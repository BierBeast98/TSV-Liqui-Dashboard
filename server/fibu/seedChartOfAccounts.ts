import { db } from "../db";
import { fibuChartOfAccounts, type InsertFibuAccount } from "@shared/schema";
import { SKR49_DEFAULT_MAPPING, type MappingValue } from "../datevSkr49Mapping";
import { sql } from "drizzle-orm";

type AccountType = NonNullable<InsertFibuAccount["accountType"]>;
type FiscalArea = NonNullable<InsertFibuAccount["fiscalArea"]>;

function fiscalAreaFrom(cat: MappingValue): FiscalArea {
  if (cat === "SKIP") return "neutral";
  switch (cat.charAt(0)) {
    case "A": return "ideell";
    case "B": return "vermoegensverwaltung";
    case "C": return "zweckbetrieb";
    case "D": return "wirtschaftlich";
    default:  return "neutral";
  }
}

function accountTypeFrom(cat: MappingValue, konto: string): AccountType {
  if (cat !== "SKIP") {
    return cat.endsWith("1") ? "income" : "expense";
  }
  // SKIP = Bilanzkonto
  switch (konto.charAt(0)) {
    case "3": return "liability";
    case "9": return "equity";
    default:  return "asset";
  }
}

/**
 * Seedet `fibu_chart_of_accounts` aus SKR49_DEFAULT_MAPPING.
 * Idempotent: bestehende Konten werden nur dann überschrieben, wenn sie sich ändern.
 * Gibt {inserted, updated, unchanged} zurück.
 */
export async function seedChartOfAccounts(): Promise<{
  inserted: number;
  updated: number;
  unchanged: number;
  total: number;
}> {
  const entries = Object.entries(SKR49_DEFAULT_MAPPING);
  const rows: InsertFibuAccount[] = entries.map(([konto, entry]) => {
    const accountType = accountTypeFrom(entry.easCategory, konto);
    return {
      konto,
      name: entry.kontoname,
      class: konto.charAt(0),
      accountType,
      fiscalArea: fiscalAreaFrom(entry.easCategory),
      vatKey: null,
      isBalanceSheet: entry.easCategory === "SKIP",
      parentKonto: null,
    };
  });

  // Snapshot bestehender Konten, um Delta zu zählen
  const existing = await db.select().from(fibuChartOfAccounts);
  const existingMap = new Map(existing.map((r) => [r.konto, r]));

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const row of rows) {
    const prev = existingMap.get(row.konto);
    if (!prev) {
      inserted++;
      continue;
    }
    const changed =
      prev.name !== row.name ||
      prev.class !== row.class ||
      prev.accountType !== row.accountType ||
      prev.fiscalArea !== row.fiscalArea ||
      prev.isBalanceSheet !== row.isBalanceSheet;
    if (changed) updated++;
    else unchanged++;
  }

  // Upsert
  await db
    .insert(fibuChartOfAccounts)
    .values(rows)
    .onConflictDoUpdate({
      target: fibuChartOfAccounts.konto,
      set: {
        name: sql`excluded.name`,
        class: sql`excluded.class`,
        accountType: sql`excluded.account_type`,
        fiscalArea: sql`excluded.fiscal_area`,
        isBalanceSheet: sql`excluded.is_balance_sheet`,
        updatedAt: sql`now()`,
      },
    });

  return { inserted, updated, unchanged, total: rows.length };
}
