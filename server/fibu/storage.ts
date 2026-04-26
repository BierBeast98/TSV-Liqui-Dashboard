import { db } from "../db";
import {
  fibuChartOfAccounts,
  fibuJournalEntries,
  fibuJournalLines,
  type FibuAccount,
  type FibuJournalEntry,
  type FibuJournalLine,
} from "@shared/schema";
import { asc, desc, eq, sql } from "drizzle-orm";
import { JournalValidationError, summarizeEntry, type JournalEntryWithLines } from "./journalEngine";

/**
 * Isolierte CRUD-Schicht für das FiBu-Subsystem.
 * Schreibt ausschließlich in `fibu_*` Tabellen, liest nichts aus dem Bestand.
 */
export const fibuStorage = {
  async listAccounts(): Promise<FibuAccount[]> {
    return db
      .select()
      .from(fibuChartOfAccounts)
      .orderBy(asc(fibuChartOfAccounts.konto));
  },

  async countAccounts(): Promise<number> {
    const rows = await db.select().from(fibuChartOfAccounts);
    return rows.length;
  },

  async listEntries(opts?: { year?: number }): Promise<JournalEntryWithLines[]> {
    const where = opts?.year !== undefined ? eq(fibuJournalEntries.fiscalYear, opts.year) : undefined;

    const entries = where
      ? await db.select().from(fibuJournalEntries).where(where).orderBy(desc(fibuJournalEntries.bookingDate), desc(fibuJournalEntries.id))
      : await db.select().from(fibuJournalEntries).orderBy(desc(fibuJournalEntries.bookingDate), desc(fibuJournalEntries.id));

    if (entries.length === 0) return [];

    const entryIds = entries.map((e) => e.id);
    const lines = await db
      .select()
      .from(fibuJournalLines)
      .where(sql`${fibuJournalLines.entryId} IN (${sql.join(entryIds.map((id) => sql`${id}`), sql`, `)})`);

    const linesByEntry = new Map<number, FibuJournalLine[]>();
    for (const l of lines) {
      const arr = linesByEntry.get(l.entryId) ?? [];
      arr.push(l);
      linesByEntry.set(l.entryId, arr);
    }

    return entries.map((e) => summarizeEntry(e, linesByEntry.get(e.id) ?? []));
  },

  async getEntry(id: number): Promise<JournalEntryWithLines | null> {
    const [entry] = await db
      .select()
      .from(fibuJournalEntries)
      .where(eq(fibuJournalEntries.id, id))
      .limit(1);
    if (!entry) return null;
    const lines = await db
      .select()
      .from(fibuJournalLines)
      .where(eq(fibuJournalLines.entryId, id))
      .orderBy(asc(fibuJournalLines.id));
    return summarizeEntry(entry, lines);
  },

  async deleteEntry(id: number): Promise<void> {
    const [entry] = await db
      .select()
      .from(fibuJournalEntries)
      .where(eq(fibuJournalEntries.id, id))
      .limit(1);
    if (!entry) {
      throw new JournalValidationError("NOT_FOUND", `Buchung #${id} existiert nicht.`);
    }
    if (entry.lockedAt !== null) {
      throw new JournalValidationError(
        "LOCKED",
        `Buchung #${id} ist festgeschrieben und kann nicht gelöscht werden. Nutze Storno.`,
      );
    }
    // Lines werden per ON DELETE CASCADE mitgelöscht
    await db.delete(fibuJournalEntries).where(eq(fibuJournalEntries.id, id));
  },

  async lockEntry(id: number): Promise<FibuJournalEntry> {
    const [entry] = await db
      .select()
      .from(fibuJournalEntries)
      .where(eq(fibuJournalEntries.id, id))
      .limit(1);
    if (!entry) {
      throw new JournalValidationError("NOT_FOUND", `Buchung #${id} existiert nicht.`);
    }
    if (entry.lockedAt !== null) {
      throw new JournalValidationError(
        "ALREADY_LOCKED",
        `Buchung #${id} ist bereits am ${entry.lockedAt.toISOString()} festgeschrieben.`,
      );
    }
    const [updated] = await db
      .update(fibuJournalEntries)
      .set({ lockedAt: new Date() })
      .where(eq(fibuJournalEntries.id, id))
      .returning();
    return updated;
  },
};
