/**
 * FiBu → Bestand Bridge (read-only)
 *
 * Einzige Stelle, an der das FiBu-Subsystem auf bestehende Analyse-Tabellen
 * zugreift. Strikt lesend und ausschließlich zum Vorbefüllen von Buchungs-
 * vorschlägen in der FiBu-UI. Die FiBu-Logik selbst hängt nicht von diesen
 * Daten ab — wenn die Bestandstabellen morgen wegfallen, bleiben die schon
 * erzeugten `fibu_journal_entries` vollständig und konsistent.
 *
 * Erlaubt:  SELECT aus transactions / accounts / categories
 * Verboten: INSERT/UPDATE/DELETE auf Bestandstabellen, JOINs mit fibu_* Tabellen
 *           mit Semantik außerhalb der source_ref-Dokumentation.
 */
import { db } from "../db";
import {
  transactions,
  accounts,
  categories,
  fibuJournalEntries,
} from "@shared/schema";
import { eq, sql, and, gte, lt, isNotNull } from "drizzle-orm";

export interface TransactionSuggestion {
  id: number;
  date: string; // ISO-Datum yyyy-mm-dd
  amount: number;
  description: string;
  counterparty: string | null;
  accountId: number | null;
  accountName: string | null;
  bankKonto: string | null; // datev_konto vom Bank-Konto
  categoryName: string | null;
  fiscalArea: string | null;
  alreadyBooked: boolean;
  sourceRef: string;
}

export async function listTransactionSuggestions(opts?: { year?: number }): Promise<TransactionSuggestion[]> {
  const yearFilter =
    opts?.year !== undefined
      ? and(
          gte(transactions.date, new Date(opts.year, 0, 1)),
          lt(transactions.date, new Date(opts.year + 1, 0, 1)),
        )
      : undefined;

  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      description: transactions.description,
      counterparty: transactions.counterparty,
      accountId: transactions.accountId,
      accountName: accounts.name,
      bankKonto: accounts.datevKonto,
      categoryName: categories.name,
      fiscalArea: categories.fiscalArea,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(yearFilter as any);

  // Welche source_refs sind schon verbucht?
  const used = await db
    .select({ sourceRef: fibuJournalEntries.sourceRef })
    .from(fibuJournalEntries)
    .where(isNotNull(fibuJournalEntries.sourceRef));
  const usedSet = new Set(used.map((r) => r.sourceRef).filter((x): x is string => x !== null));

  return rows
    .map((r) => {
      const sourceRef = `tx:${r.id}`;
      return {
        id: r.id,
        date: r.date.toISOString().slice(0, 10),
        amount: r.amount,
        description: r.description,
        counterparty: r.counterparty,
        accountId: r.accountId,
        accountName: r.accountName,
        bankKonto: r.bankKonto,
        categoryName: r.categoryName,
        fiscalArea: r.fiscalArea,
        alreadyBooked: usedSet.has(sourceRef),
        sourceRef,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
}
