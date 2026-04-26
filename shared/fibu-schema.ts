import { pgTable, text, serial, integer, boolean, timestamp, real, AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// FiBu-Subsystem (Schatten-Buchhaltung nach SKR49)
//
// Isoliertes Subsystem: alle Tabellen tragen das Präfix `fibu_`. Keine
// Schreib- oder Leseabhängigkeiten zu den bestehenden Analyse-Tabellen.
// Darf jederzeit komplett gedroppt werden, ohne den Bestand zu brechen.
// ============================================================================

// SKR49-Kontenstamm — Stammdaten, einmal geseedet und manuell pflegbar
export const fibuChartOfAccounts = pgTable("fibu_chart_of_accounts", {
  konto: text("konto").primaryKey(),
  name: text("name").notNull(),
  class: text("class").notNull(),                                    // "0".."9" (erste Stelle der Kontonummer)
  accountType: text("account_type", {
    enum: ["asset", "liability", "equity", "income", "expense", "neutral"],
  }).notNull(),
  fiscalArea: text("fiscal_area", {
    enum: ["ideell", "vermoegensverwaltung", "zweckbetrieb", "wirtschaftlich", "neutral"],
  }).notNull().default("neutral"),
  vatKey: text("vat_key"),                                           // DATEV-BU-Schlüssel, falls sinnvoll voreingestellt
  isBalanceSheet: boolean("is_balance_sheet").notNull().default(false),
  parentKonto: text("parent_konto"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Buchungskopf
export const fibuJournalEntries = pgTable("fibu_journal_entries", {
  id: serial("id").primaryKey(),
  bookingDate: timestamp("booking_date").notNull(),
  fiscalYear: integer("fiscal_year").notNull(),
  source: text("source", {
    enum: ["manual", "bank-csv", "dtvf-import", "afa-run", "opening-balance", "reversal"],
  }).notNull().default("manual"),
  description: text("description").notNull(),
  docRef: text("doc_ref"),                                           // Belegnummer
  createdAt: timestamp("created_at").defaultNow(),
  lockedAt: timestamp("locked_at"),                                  // GoBD-Festschreibung (nullable)
  reversalOf: integer("reversal_of").references((): AnyPgColumn => fibuJournalEntries.id),
  // Soft-Referenz auf Quelle der Buchung, z.B. "tx:1234" für Bestands-Transaktion.
  // Rein dokumentarisch — FiBu-Logik hängt nicht davon ab.
  sourceRef: text("source_ref"),
});

// Buchungs-Positionen — Summe(debit) == Summe(credit) pro entry_id (Validator in Journal-Engine)
export const fibuJournalLines = pgTable("fibu_journal_lines", {
  id: serial("id").primaryKey(),
  entryId: integer("entry_id").references(() => fibuJournalEntries.id, { onDelete: "cascade" }).notNull(),
  konto: text("konto").references(() => fibuChartOfAccounts.konto).notNull(),
  debit: real("debit").notNull().default(0),
  credit: real("credit").notNull().default(0),
  vatKey: text("vat_key"),
  vatAmount: real("vat_amount"),
  costCenter: text("cost_center"),                                   // KOST1
  lineText: text("line_text"),
});

// Zod-Schemas für Inserts
export const insertFibuAccountSchema = createInsertSchema(fibuChartOfAccounts).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertFibuJournalEntrySchema = createInsertSchema(fibuJournalEntries, {
  bookingDate: z.coerce.date(),
}).omit({ id: true, createdAt: true });
export const insertFibuJournalLineSchema = createInsertSchema(fibuJournalLines).omit({ id: true });

// Typen
export type FibuAccount = typeof fibuChartOfAccounts.$inferSelect;
export type InsertFibuAccount = z.infer<typeof insertFibuAccountSchema>;
export type FibuJournalEntry = typeof fibuJournalEntries.$inferSelect;
export type InsertFibuJournalEntry = z.infer<typeof insertFibuJournalEntrySchema>;
export type FibuJournalLine = typeof fibuJournalLines.$inferSelect;
export type InsertFibuJournalLine = z.infer<typeof insertFibuJournalLineSchema>;
