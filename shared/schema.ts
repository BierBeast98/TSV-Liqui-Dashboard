import { pgTable, text, serial, integer, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
// Import auth tables to include them in the schema for migrations
export * from "./models/auth";
// Import chat tables for AI assistant
export * from "./models/chat";

// === TABLE DEFINITIONS ===

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: ["income", "expense"] }).notNull(),
  fiscalArea: text("fiscal_area", { enum: ["ideell", "vermoegensverwaltung", "zweckbetrieb", "wirtschaftlich"] }).default("ideell"),
  isDefault: boolean("is_default").default(false),
});

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  iban: text("iban").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Opening balances per account per year
export const accountBalances = pgTable("account_balances", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  year: integer("year").notNull(),
  openingBalance: real("opening_balance").notNull().default(0),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  date: timestamp("date").notNull(),
  amount: real("amount").notNull(), // Using real for float amounts
  description: text("description").notNull(),
  categoryId: integer("category_id").references(() => categories.id),
  accountId: integer("account_id").references(() => accounts.id),
  account: text("account").default("Hauptkonto"), // Legacy field
  recurring: boolean("recurring").default(false),
  hash: text("hash").unique(), // For duplicate detection: hash(date + amount + description)
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCategorySchema = createInsertSchema(categories).omit({ id: true });
export const insertAccountSchema = createInsertSchema(accounts).omit({ id: true, createdAt: true });
export const insertAccountBalanceSchema = createInsertSchema(accountBalances).omit({ id: true });
export const insertTransactionSchema = createInsertSchema(transactions, {
  date: z.coerce.date(),
}).omit({ id: true, createdAt: true });

export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Account = typeof accounts.$inferSelect;
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type AccountBalance = typeof accountBalances.$inferSelect;
export type InsertAccountBalance = z.infer<typeof insertAccountBalanceSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

export type UpdateCategoryRequest = Partial<InsertCategory>;
export type UpdateTransactionRequest = Partial<InsertTransaction>;

export type TransactionResponse = Transaction & { 
  categoryName?: string; 
  categoryType?: string;
  accountName?: string;
};

// Query Params
export interface TransactionQueryParams {
  year?: number;
  categoryId?: number;
  type?: 'income' | 'expense';
  search?: string;
}

// Stats / Dashboard
export interface DashboardStats {
  openingBalance: number;    // Anfangssaldo des Jahres
  cashPosition: number;      // Kassenbestand = Anfangssaldo + alle Buchungen
  totalIncome: number;       // Einnahmen (positive Buchungen)
  totalExpenses: number;     // Ausgaben (negative Buchungen)
  cashFlow: number;          // Cashflow = Einnahmen - Ausgaben
}

export interface MonthlyStats {
  month: string; // YYYY-MM
  income: number;
  expenses: number;
}

export interface CategoryStats {
  name: string;
  value: number;
}

export interface ForecastData {
  date: string;
  balance: number;
  isProjected: boolean;
}

// === EÜR Reports (based on uploaded PDF, not transactions) ===

export const euerReports = pgTable("euer_reports", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull().unique(),
  sourceFileName: text("source_file_name"),
  pdfFilePath: text("pdf_file_path"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  uploadedBy: text("uploaded_by"),
  // A. Ideeller Tätigkeitsbereich
  ideellIncome: real("ideell_income").default(0),
  ideellExpenses: real("ideell_expenses").default(0),
  // B. Vermögensverwaltung
  vermoegenIncome: real("vermoegen_income").default(0),
  vermoegenExpenses: real("vermoegen_expenses").default(0),
  // C. Zweckbetriebe
  zweckbetriebIncome: real("zweckbetrieb_income").default(0),
  zweckbetriebExpenses: real("zweckbetrieb_expenses").default(0),
  // D. Wirtschaftlicher Geschäftsbetrieb
  wirtschaftlichIncome: real("wirtschaftlich_income").default(0),
  wirtschaftlichExpenses: real("wirtschaftlich_expenses").default(0),
});

export const insertEuerReportSchema = createInsertSchema(euerReports).omit({ id: true, uploadedAt: true });
export type EuerReport = typeof euerReports.$inferSelect;
export type InsertEuerReport = z.infer<typeof insertEuerReportSchema>;

// EÜR Line Items - detailed breakdown per fiscal area
export const euerLineItems = pgTable("euer_line_items", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").references(() => euerReports.id).notNull(),
  fiscalArea: text("fiscal_area", { enum: ["ideell", "vermoegensverwaltung", "zweckbetrieb", "wirtschaftlich"] }).notNull(),
  type: text("type", { enum: ["income", "expense"] }).notNull(),
  accountNumber: text("account_number"), // SKR Konto z.B. "2110"
  description: text("description").notNull(),
  amount: real("amount").notNull(),
});

export const insertEuerLineItemSchema = createInsertSchema(euerLineItems).omit({ id: true });
export type EuerLineItem = typeof euerLineItems.$inferSelect;
export type InsertEuerLineItem = z.infer<typeof insertEuerLineItemSchema>;

// === Events / Veranstaltungen (for tracking income/expenses at festivals, etc.) ===

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  date: timestamp("date").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const eventEntries = pgTable("event_entries", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => events.id).notNull(),
  date: timestamp("date").notNull(),
  receiptNumber: text("receipt_number"), // Belegnummer
  bankTransaction: text("bank_transaction"), // Bankbuchung (e.g., Sparkasse)
  description: text("description").notNull(), // Grund
  income: real("income").default(0), // Einnahmen
  expense: real("expense").default(0), // Ausgaben
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEventSchema = createInsertSchema(events, {
  date: z.coerce.date(),
}).omit({ id: true, createdAt: true });
export const insertEventEntrySchema = createInsertSchema(eventEntries, {
  date: z.coerce.date(),
}).omit({ id: true, createdAt: true });

export type Event = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type EventEntry = typeof eventEntries.$inferSelect;
export type InsertEventEntry = z.infer<typeof insertEventEntrySchema>;

export interface EventWithTotals extends Event {
  totalIncome: number;
  totalExpenses: number;
  result: number;
}

// === Contracts (recurring payments/income) ===

export const contracts = pgTable("contracts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  amount: real("amount").notNull(),
  frequency: text("frequency", { enum: ["monthly", "quarterly", "yearly"] }).notNull(),
  type: text("type", { enum: ["income", "expense"] }).notNull(),
  categoryId: integer("category_id").references(() => categories.id),
  isActive: boolean("is_active").default(true),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  nextDueDate: timestamp("next_due_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertContractSchema = createInsertSchema(contracts, {
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  nextDueDate: z.coerce.date().optional(),
}).omit({ id: true, createdAt: true });

export type Contract = typeof contracts.$inferSelect;
export type InsertContract = z.infer<typeof insertContractSchema>;

export interface ContractWithCategory extends Contract {
  categoryName?: string;
}

// === Contract Suggestions (auto-detected recurring payments) ===

export const contractSuggestions = pgTable("contract_suggestions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  amount: real("amount").notNull(),
  frequency: text("frequency", { enum: ["monthly", "quarterly", "yearly"] }).notNull(),
  type: text("type", { enum: ["income", "expense"] }).notNull(),
  categoryId: integer("category_id").references(() => categories.id),
  accountId: integer("account_id").references(() => accounts.id),
  confidence: real("confidence").default(0.5),
  status: text("status", { enum: ["pending", "accepted", "dismissed"] }).default("pending"),
  sourceTransactionIds: text("source_transaction_ids").array(),
  sampleDates: text("sample_dates").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertContractSuggestionSchema = createInsertSchema(contractSuggestions).omit({ id: true, createdAt: true });

export type ContractSuggestion = typeof contractSuggestions.$inferSelect;
export type InsertContractSuggestion = z.infer<typeof insertContractSuggestionSchema>;

export interface ContractSuggestionWithDetails extends ContractSuggestion {
  categoryName?: string;
  accountName?: string;
}
