import { pgTable, text, serial, integer, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
// Import auth tables to include them in the schema for migrations
export * from "./models/auth";

// === TABLE DEFINITIONS ===

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: ["income", "expense"] }).notNull(),
  isDefault: boolean("is_default").default(false),
});

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  iban: text("iban").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
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
export const insertTransactionSchema = createInsertSchema(transactions, {
  date: z.coerce.date(),
}).omit({ id: true, createdAt: true });

export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Account = typeof accounts.$inferSelect;
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

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
  currentBalance: number;
  totalIncome: number;
  totalExpenses: number;
  netResult: number;
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
