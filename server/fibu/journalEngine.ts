import { db } from "../db";
import {
  fibuJournalEntries,
  fibuJournalLines,
  fibuChartOfAccounts,
  type InsertFibuJournalEntry,
  type InsertFibuJournalLine,
  type FibuJournalEntry,
  type FibuJournalLine,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

export class JournalValidationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "JournalValidationError";
  }
}

export type JournalLineInput = Omit<InsertFibuJournalLine, "entryId" | "id">;
export type JournalEntryInput = Omit<InsertFibuJournalEntry, "id" | "createdAt">;

const CENT_TOLERANCE = 0.005; // halber Cent — deckt Float-Rundungsfehler ab, nicht aber echte Differenzen

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

function validateLines(lines: JournalLineInput[]): void {
  if (lines.length < 2) {
    throw new JournalValidationError(
      "TOO_FEW_LINES",
      `Doppelte Buchung braucht mindestens 2 Positionen, bekommen: ${lines.length}`,
    );
  }

  let sumDebit = 0;
  let sumCredit = 0;
  for (const [i, line] of lines.entries()) {
    const d = line.debit ?? 0;
    const c = line.credit ?? 0;
    if (d < 0 || c < 0) {
      throw new JournalValidationError(
        "NEGATIVE_AMOUNT",
        `Zeile ${i + 1}: Soll/Haben dürfen nicht negativ sein (debit=${d}, credit=${c})`,
      );
    }
    if (d > 0 && c > 0) {
      throw new JournalValidationError(
        "BOTH_SIDES",
        `Zeile ${i + 1}: Soll und Haben gleichzeitig gesetzt (debit=${d}, credit=${c}). Pro Zeile nur eine Seite.`,
      );
    }
    if (d === 0 && c === 0) {
      throw new JournalValidationError(
        "EMPTY_LINE",
        `Zeile ${i + 1}: weder Soll noch Haben gesetzt.`,
      );
    }
    sumDebit += d;
    sumCredit += c;
  }

  const diff = Math.abs(sumDebit - sumCredit);
  if (diff > CENT_TOLERANCE) {
    throw new JournalValidationError(
      "NOT_BALANCED",
      `Summe Soll (${roundCents(sumDebit).toFixed(2)}) ≠ Summe Haben (${roundCents(sumCredit).toFixed(2)}), Differenz ${roundCents(diff).toFixed(2)}`,
    );
  }
}

async function assertKontenExist(konten: string[]): Promise<void> {
  const unique = Array.from(new Set(konten));
  const found = await db
    .select({ konto: fibuChartOfAccounts.konto })
    .from(fibuChartOfAccounts)
    .where(inArray(fibuChartOfAccounts.konto, unique));
  const foundSet = new Set(found.map((r) => r.konto));
  const missing = unique.filter((k) => !foundSet.has(k));
  if (missing.length > 0) {
    throw new JournalValidationError(
      "UNKNOWN_KONTO",
      `Unbekannte Konten im Kontenrahmen: ${missing.join(", ")}`,
    );
  }
}

/**
 * Legt eine Buchung (Kopf + Positionen) transaktional an.
 *
 * Validiert:
 *  - ≥ 2 Positionen
 *  - Pro Position genau eine Seite (Soll XOR Haben)
 *  - Keine Negativbeträge
 *  - Summe(Soll) == Summe(Haben) (± halber Cent Toleranz)
 *  - Alle Konten existieren in `fibu_chart_of_accounts`
 */
export async function createJournalEntry(
  input: JournalEntryInput,
  lines: JournalLineInput[],
): Promise<{ id: number }> {
  validateLines(lines);
  await assertKontenExist(lines.map((l) => l.konto));

  const id = await db.transaction(async (tx) => {
    const [entry] = await tx
      .insert(fibuJournalEntries)
      .values(input)
      .returning({ id: fibuJournalEntries.id });

    const lineRows: InsertFibuJournalLine[] = lines.map((l) => ({
      ...l,
      entryId: entry.id,
      debit: l.debit ?? 0,
      credit: l.credit ?? 0,
    }));
    await tx.insert(fibuJournalLines).values(lineRows);

    return entry.id;
  });

  return { id };
}

/**
 * Storniert eine Buchung, indem eine neue Gegenbuchung angelegt wird (Soll/Haben
 * getauscht). Verknüpft über `reversalOf`. Setzt Original NICHT auf gelöscht —
 * das Journal bleibt vollständig nachvollziehbar.
 *
 * Eine festgeschriebene Buchung darf storniert werden (die Festschreibung
 * schützt nur vor Löschen/Ändern, nicht vor korrigierender Gegenbuchung).
 * Eine Storno-Buchung selbst kann nicht nochmal storniert werden.
 */
export async function reverseJournalEntry(
  originalId: number,
  overrides?: { bookingDate?: Date; description?: string },
): Promise<{ id: number }> {
  const original = await db
    .select()
    .from(fibuJournalEntries)
    .where(eq(fibuJournalEntries.id, originalId))
    .limit(1);
  if (original.length === 0) {
    throw new JournalValidationError("NOT_FOUND", `Buchung #${originalId} existiert nicht.`);
  }
  const head = original[0];
  if (head.reversalOf !== null) {
    throw new JournalValidationError(
      "ALREADY_REVERSAL",
      `Buchung #${originalId} ist selbst bereits eine Storno-Buchung.`,
    );
  }

  const originalLines = await db
    .select()
    .from(fibuJournalLines)
    .where(eq(fibuJournalLines.entryId, originalId));
  if (originalLines.length === 0) {
    throw new JournalValidationError(
      "NO_LINES",
      `Buchung #${originalId} hat keine Positionen (korrupt?).`,
    );
  }

  const reversedLines: JournalLineInput[] = originalLines.map((l) => ({
    konto: l.konto,
    debit: l.credit ?? 0,
    credit: l.debit ?? 0,
    vatKey: l.vatKey,
    vatAmount: l.vatAmount !== null && l.vatAmount !== undefined ? -l.vatAmount : null,
    costCenter: l.costCenter,
    lineText: l.lineText ? `Storno: ${l.lineText}` : "Storno",
  }));

  const entry: JournalEntryInput = {
    bookingDate: overrides?.bookingDate ?? new Date(),
    fiscalYear: head.fiscalYear,
    source: "reversal",
    description:
      overrides?.description ?? `Storno #${originalId}: ${head.description}`,
    docRef: head.docRef,
    lockedAt: null,
    reversalOf: originalId,
  };

  return createJournalEntry(entry, reversedLines);
}

export type JournalEntryWithLines = FibuJournalEntry & {
  lines: FibuJournalLine[];
  totalAmount: number;
};

export function summarizeEntry(
  entry: FibuJournalEntry,
  lines: FibuJournalLine[],
): JournalEntryWithLines {
  const totalAmount = lines.reduce((acc, l) => acc + (l.debit ?? 0), 0);
  return { ...entry, lines, totalAmount: roundCents(totalAmount) };
}
