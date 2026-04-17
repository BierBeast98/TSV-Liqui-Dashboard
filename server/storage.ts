import { db } from "./db";
import {
  categories, transactions, accounts, accountBalances, euerReports, euerLineItems, events, eventEntries, contracts, contractSuggestions,
  summenSaldenEntries, kassenberichtConfig, datevBookings, datevKontoMapping,
  type DatevBooking, type InsertDatevBooking,
  type DatevKontoMapping, type InsertDatevKontoMapping,
  type DatevPivotSummary, type EasCategory, EAS_CATEGORIES,
  type Category, type InsertCategory,
  type Transaction, type InsertTransaction,
  type UpdateCategoryRequest, type UpdateTransactionRequest,
  type Account, type AccountWithTxCount, type TransactionResponse, type TransactionWithDetails,
  type AccountBalance, type InsertAccountBalance,
  type EuerReport, type InsertEuerReport,
  type EuerLineItem, type InsertEuerLineItem,
  type Event, type InsertEvent, type EventWithTotals,
  type EventEntry, type InsertEventEntry,
  type Contract, type InsertContract, type ContractWithCategory,
  type ContractSuggestion, type InsertContractSuggestion, type ContractSuggestionWithDetails,
  type SummenSaldenEntry, type InsertSummenSaldenEntry, type LiquideMittelSummary
} from "@shared/schema";
import { eq, and, sql, desc, asc, inArray } from "drizzle-orm";
import { authStorage, type IAuthStorage } from "./replit_integrations/auth/storage";

export interface IStorage extends IAuthStorage {
  // Categories
  getCategories(): Promise<Category[]>;
  getCategory(id: number): Promise<Category | undefined>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: number, updates: UpdateCategoryRequest): Promise<Category>;
  deleteCategory(id: number): Promise<void>;
  seedCategories(): Promise<void>;

  // Accounts
  getAccounts(): Promise<Account[]>;
  getAccountByIban(iban: string): Promise<Account | undefined>;
  getOrCreateAccount(iban: string, name?: string): Promise<Account>;

  // Account Balances (Opening balances per year)
  getAccountBalances(year: number, accountId?: number): Promise<(AccountBalance & { accountName: string; iban: string })[]>;
  getAccountBalance(accountId: number, year: number): Promise<AccountBalance | undefined>;
  upsertAccountBalance(balance: InsertAccountBalance): Promise<AccountBalance>;

  // Transactions
  getTransactions(params?: { 
    year?: number;
    years?: number[];  // Multiple years support
    categoryId?: number; 
    categoryIds?: number[];  // Multiple categories support
    accountId?: number;
    accountIds?: number[];  // Multiple accounts support
    account?: string; 
    search?: string;
    startDate?: string;
    endDate?: string;
    minAmount?: number;
    maxAmount?: number;
  }): Promise<TransactionResponse[]>;
  getTransaction(id: number): Promise<Transaction | undefined>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransaction(id: number, updates: UpdateTransactionRequest): Promise<Transaction>;
  deleteTransaction(id: number): Promise<void>;
  createTransactionsBulk(transactionsData: InsertTransaction[]): Promise<{ imported: number, duplicates: number }>;
  bulkUpdateTransactions(ids: number[], updates: Partial<UpdateTransactionRequest>): Promise<number>;
  getTransactionsByCounterparty(counterparty: string): Promise<TransactionResponse[]>;
  linkTransactionToContract(transactionId: number, contractId: number): Promise<Transaction>;
  unlinkTransactionFromContract(transactionId: number): Promise<Transaction>;
  
  // Stats
  getMonthlyStats(year: number, account?: string): Promise<{ month: string, income: number, expenses: number }[]>;
  getCategoryStats(year: number, account?: string): Promise<{ name: string, value: number }[]>;
  getBalanceHistory(year: number, account?: string): Promise<{ date: string, balance: number }[]>;
  getTotalStats(year: number, account?: string): Promise<{ income: number, expenses: number }>;
  autoCategorize(transactionId: number): Promise<Transaction | undefined>;
  deleteAllTransactions(): Promise<void>;
  getFiscalAreaStats(year: number): Promise<FiscalAreaReport>;
  
  // EÜR Reports (PDF-based)
  getEuerReport(year: number): Promise<EuerReport | undefined>;
  getEuerReports(): Promise<EuerReport[]>;
  upsertEuerReport(report: InsertEuerReport): Promise<EuerReport>;
  deleteEuerReport(year: number): Promise<void>;
  
  // EÜR Line Items
  getEuerLineItems(reportId: number): Promise<EuerLineItem[]>;
  getEuerLineItemsByArea(reportId: number, fiscalArea: string): Promise<EuerLineItem[]>;
  upsertEuerLineItems(reportId: number, items: Omit<InsertEuerLineItem, 'reportId'>[]): Promise<EuerLineItem[]>;
  
  // Summen- und Saldenliste
  upsertSummenSalden(year: number, entries: InsertSummenSaldenEntry[]): Promise<SummenSaldenEntry[]>;
  getSummenSalden(year: number): Promise<SummenSaldenEntry[]>;
  getSummenSaldenYears(): Promise<number[]>;
  getLiquideMittel(year: number): Promise<LiquideMittelSummary>;
  deleteSummenSalden(year: number): Promise<void>;

  // Events / Veranstaltungen
  getEvents(): Promise<EventWithTotals[]>;
  getEvent(id: number): Promise<Event | undefined>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: number, updates: Partial<InsertEvent>): Promise<Event>;
  deleteEvent(id: number): Promise<void>;
  
  // Event Entries
  getEventEntries(eventId: number): Promise<EventEntry[]>;
  createEventEntry(entry: InsertEventEntry): Promise<EventEntry>;
  updateEventEntry(id: number, updates: Partial<InsertEventEntry>): Promise<EventEntry>;
  deleteEventEntry(id: number): Promise<void>;
  
  // Contracts (recurring payments/income)
  getContracts(includeInactive?: boolean): Promise<ContractWithCategory[]>;
  getContract(id: number): Promise<Contract | undefined>;
  createContract(contract: InsertContract): Promise<Contract>;
  updateContract(id: number, updates: Partial<InsertContract>): Promise<Contract>;
  deleteContract(id: number): Promise<void>;
  
  // Contract Suggestions (auto-detected recurring payments)
  getContractSuggestions(status?: "pending" | "accepted" | "dismissed"): Promise<ContractSuggestionWithDetails[]>;
  getContractSuggestion(id: number): Promise<ContractSuggestion | undefined>;
  createContractSuggestion(suggestion: InsertContractSuggestion): Promise<ContractSuggestion>;
  updateContractSuggestionStatus(id: number, status: "pending" | "accepted" | "dismissed"): Promise<ContractSuggestion>;
  clearPendingSuggestions(): Promise<void>;
  acceptSuggestion(id: number): Promise<Contract>;

  // Kassenbericht Config
  getKassenberichtConfig(key: string): Promise<string | null>;
  setKassenberichtConfig(key: string, value: string): Promise<void>;
}

export interface FiscalAreaSummary {
  name: string;
  label: string;
  income: number;
  expenses: number;
  net: number;
  categories: { name: string; amount: number; type: string }[];
}

export interface FiscalAreaReport {
  year: number;
  areas: FiscalAreaSummary[];
  totalIncome: number;
  totalExpenses: number;
  totalNet: number;
}

export class DatabaseStorage implements IStorage {
  // Auth methods delegated to authStorage
  getUser = authStorage.getUser;
  upsertUser = authStorage.upsertUser;

  async getCategories(): Promise<Category[]> {
    return await db.select().from(categories).orderBy(categories.name);
  }

  async getCategory(id: number): Promise<Category | undefined> {
    const [category] = await db.select().from(categories).where(eq(categories.id, id));
    return category;
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const [newCategory] = await db.insert(categories).values(category).returning();
    return newCategory;
  }

  async updateCategory(id: number, updates: UpdateCategoryRequest): Promise<Category> {
    const [updated] = await db.update(categories).set(updates).where(eq(categories.id, id)).returning();
    return updated;
  }

  async deleteCategory(id: number): Promise<void> {
    await db.delete(categories).where(eq(categories.id, id));
  }

  async seedCategories(): Promise<void> {
    const count = await db.select({ count: sql<number>`count(*)` }).from(categories);
    if (Number(count[0].count) === 0) {
      const defaultCategories = [
        // A. Ideeller Tätigkeitsbereich - Einnahmen
        { name: "Mitgliedsbeiträge", type: "income", fiscalArea: "ideell", isDefault: true },
        { name: "Spenden", type: "income", fiscalArea: "ideell", isDefault: true },
        { name: "Zuschüsse", type: "income", fiscalArea: "ideell", isDefault: true },
        { name: "Abteilungsbeiträge", type: "income", fiscalArea: "ideell", isDefault: true },
        { name: "Förderverein", type: "income", fiscalArea: "ideell", isDefault: true },
        { name: "Stiftungen", type: "income", fiscalArea: "ideell", isDefault: true },
        { name: "Sonstige Einnahmen", type: "income", fiscalArea: "ideell", isDefault: true },
        // A. Ideeller Tätigkeitsbereich - Ausgaben
        { name: "Verbandsabgaben", type: "expense", fiscalArea: "ideell", isDefault: true },
        { name: "Büromaterial & Porto", type: "expense", fiscalArea: "ideell", isDefault: true },
        { name: "Mitgliederpflege", type: "expense", fiscalArea: "ideell", isDefault: true },
        { name: "Ehrungen & Geschenke", type: "expense", fiscalArea: "ideell", isDefault: true },
        { name: "Bankgebühren", type: "expense", fiscalArea: "ideell", isDefault: true },
        { name: "Steuern", type: "expense", fiscalArea: "ideell", isDefault: true },
        { name: "Sonstige Ausgaben", type: "expense", fiscalArea: "ideell", isDefault: true },
        
        // B. Vermögensverwaltung - Einnahmen
        { name: "Pachteinnahmen", type: "income", fiscalArea: "vermoegensverwaltung", isDefault: true },
        { name: "Nebenkosten-Abrechnung", type: "income", fiscalArea: "vermoegensverwaltung", isDefault: true },
        { name: "Zinserträge", type: "income", fiscalArea: "vermoegensverwaltung", isDefault: true },
        // B. Vermögensverwaltung - Ausgaben
        { name: "Platz & Gebäude", type: "expense", fiscalArea: "vermoegensverwaltung", isDefault: true },
        { name: "Versicherungen", type: "expense", fiscalArea: "vermoegensverwaltung", isDefault: true },
        { name: "Abschreibungen", type: "expense", fiscalArea: "vermoegensverwaltung", isDefault: true },
        { name: "Darlehenszinsen", type: "expense", fiscalArea: "vermoegensverwaltung", isDefault: true },
        { name: "Strom & Energie", type: "expense", fiscalArea: "vermoegensverwaltung", isDefault: true },
        { name: "Wasser & Heizung", type: "expense", fiscalArea: "vermoegensverwaltung", isDefault: true },
        { name: "Reparaturen", type: "expense", fiscalArea: "vermoegensverwaltung", isDefault: true },
        
        // C. Zweckbetriebe - Einnahmen
        { name: "Veranstaltungen (Einnahmen)", type: "income", fiscalArea: "zweckbetrieb", isDefault: true },
        { name: "Eintrittsgelder", type: "income", fiscalArea: "zweckbetrieb", isDefault: true },
        { name: "Startgelder", type: "income", fiscalArea: "zweckbetrieb", isDefault: true },
        { name: "Teilnehmergebühren", type: "income", fiscalArea: "zweckbetrieb", isDefault: true },
        { name: "Spielerablöse", type: "income", fiscalArea: "zweckbetrieb", isDefault: true },
        // C. Zweckbetriebe - Ausgaben
        { name: "Veranstaltungen (Ausgaben)", type: "expense", fiscalArea: "zweckbetrieb", isDefault: true },
        { name: "Trainer & Schiedsrichter", type: "expense", fiscalArea: "zweckbetrieb", isDefault: true },
        { name: "Geräte & Material", type: "expense", fiscalArea: "zweckbetrieb", isDefault: true },
        { name: "Übungsleiter", type: "expense", fiscalArea: "zweckbetrieb", isDefault: true },
        { name: "Aufwandsentschädigung", type: "expense", fiscalArea: "zweckbetrieb", isDefault: true },
        { name: "Ehrenamtspauschale", type: "expense", fiscalArea: "zweckbetrieb", isDefault: true },
        { name: "Schiedsrichter", type: "expense", fiscalArea: "zweckbetrieb", isDefault: true },
        { name: "Sportkleidung", type: "expense", fiscalArea: "zweckbetrieb", isDefault: true },
        { name: "Platzpflege", type: "expense", fiscalArea: "zweckbetrieb", isDefault: true },
        { name: "Fahrzeugkosten", type: "expense", fiscalArea: "zweckbetrieb", isDefault: true },
        
        // D. Wirtschaftlicher Geschäftsbetrieb - Einnahmen
        { name: "Sponsoring", type: "income", fiscalArea: "wirtschaftlich", isDefault: true },
        { name: "Bewirtung", type: "income", fiscalArea: "wirtschaftlich", isDefault: true },
        { name: "Bandenwerbung", type: "income", fiscalArea: "wirtschaftlich", isDefault: true },
        { name: "Bannerwerbung", type: "income", fiscalArea: "wirtschaftlich", isDefault: true },
        { name: "PV-Einspeisevergütung", type: "income", fiscalArea: "wirtschaftlich", isDefault: true },
        // D. Wirtschaftlicher Geschäftsbetrieb - Ausgaben
        { name: "Wareneinkauf", type: "expense", fiscalArea: "wirtschaftlich", isDefault: true },
        { name: "Werbekosten", type: "expense", fiscalArea: "wirtschaftlich", isDefault: true },
      ];
      // @ts-ignore
      await db.insert(categories).values(defaultCategories);
    }
  }

  async getAccounts(): Promise<AccountWithTxCount[]> {
    const rows = await db
      .select({
        id: accounts.id,
        iban: accounts.iban,
        name: accounts.name,
        datevKonto: accounts.datevKonto,
        createdAt: accounts.createdAt,
        txCount: sql<number>`CAST(COUNT(${transactions.id}) AS INTEGER)`,
      })
      .from(accounts)
      .leftJoin(transactions, eq(transactions.accountId, accounts.id))
      .groupBy(accounts.id)
      .orderBy(accounts.name);
    return rows;
  }

  async importAccountsFromSummenSalden(year: number): Promise<{ created: Account[]; skipped: string[] }> {
    const entries = await this.getSummenSalden(year);
    // Only bank accounts (18xx) — skip Kassen (16xx)
    const bankEntries = entries.filter(e => e.konto.startsWith('18'));

    const created: Account[] = [];
    const skipped: string[] = [];

    for (const entry of bankEntries) {
      const datevKonto = entry.sub !== '0' ? `${entry.konto}.${entry.sub}` : entry.konto;
      const iban = `DATEV-${datevKonto}`;

      // Check if account already exists (by IBAN or datevKonto)
      const [existingByIban] = await db.select().from(accounts).where(eq(accounts.iban, iban));
      if (existingByIban) { skipped.push(`${datevKonto}: ${entry.beschriftung} (bereits vorhanden)`); continue; }

      const allAccounts = await db.select().from(accounts);
      const existingByKonto = allAccounts.find(a => a.datevKonto === datevKonto);
      if (existingByKonto) { skipped.push(`${datevKonto}: ${entry.beschriftung} (DATEV-Konto bereits zugeordnet)`); continue; }

      const [newAccount] = await db.insert(accounts).values({
        iban,
        name: entry.beschriftung,
        datevKonto,
      }).returning();
      created.push(newAccount);
    }

    return { created, skipped };
  }

  async getAccountByIban(iban: string): Promise<Account | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.iban, iban));
    return account;
  }

  async updateAccount(id: number, patch: { datevKonto?: string | null; iban?: string }): Promise<Account> {
    const setFields: any = {};
    if (patch.datevKonto !== undefined) setFields.datevKonto = patch.datevKonto;
    if (patch.iban) setFields.iban = patch.iban;
    const [updated] = await db.update(accounts)
      .set(setFields)
      .where(eq(accounts.id, id))
      .returning();
    return updated;
  }

  async renameAccount(id: number, name: string): Promise<Account> {
    const [updated] = await db.update(accounts)
      .set({ name })
      .where(eq(accounts.id, id))
      .returning();
    return updated;
  }

  async deleteAccount(id: number): Promise<void> {
    const [{ count }] = await db
      .select({ count: sql<number>`CAST(COUNT(${transactions.id}) AS INTEGER)` })
      .from(transactions)
      .where(eq(transactions.accountId, id));
    if (count > 0) throw new Error(`Konto hat noch ${count} Buchungen`);
    await db.delete(accountBalances).where(eq(accountBalances.accountId, id));
    await db.delete(accounts).where(eq(accounts.id, id));
  }

  async mergeAccount(sourceId: number, targetId: number): Promise<void> {
    // 1. Move transactions
    await db.update(transactions)
      .set({ accountId: targetId })
      .where(eq(transactions.accountId, sourceId));

    // 2. Move/merge opening balances
    const sourceBalances = await db.select().from(accountBalances)
      .where(eq(accountBalances.accountId, sourceId));
    for (const sb of sourceBalances) {
      const [existing] = await db.select().from(accountBalances)
        .where(and(eq(accountBalances.accountId, targetId), eq(accountBalances.year, sb.year)));
      if (existing) {
        await db.update(accountBalances)
          .set({ openingBalance: existing.openingBalance + sb.openingBalance })
          .where(eq(accountBalances.id, existing.id));
      } else {
        await db.insert(accountBalances).values({ accountId: targetId, year: sb.year, openingBalance: sb.openingBalance });
      }
    }
    await db.delete(accountBalances).where(eq(accountBalances.accountId, sourceId));

    // 3. Move contract suggestions
    await db.update(contractSuggestions)
      .set({ accountId: targetId })
      .where(eq(contractSuggestions.accountId, sourceId));

    // 4. Delete source account
    await db.delete(accounts).where(eq(accounts.id, sourceId));
  }

  async getOrCreateAccount(iban: string, name?: string): Promise<Account> {
    const existing = await this.getAccountByIban(iban);
    if (existing) return existing;

    const displayName = name || `Konto ****${iban.slice(-4)}`;
    const [newAccount] = await db.insert(accounts).values({ iban, name: displayName }).returning();
    return newAccount;
  }

  async getAccountBalances(year: number, accountId?: number): Promise<(AccountBalance & { accountName: string; iban: string })[]> {
    const filters = [eq(accountBalances.year, year)];
    if (accountId) {
      filters.push(eq(accountBalances.accountId, accountId));
    }
    
    const result = await db.select({
      id: accountBalances.id,
      accountId: accountBalances.accountId,
      year: accountBalances.year,
      openingBalance: accountBalances.openingBalance,
      accountName: accounts.name,
      iban: accounts.iban,
    })
    .from(accountBalances)
    .innerJoin(accounts, eq(accountBalances.accountId, accounts.id))
    .where(and(...filters));
    return result;
  }

  async getAccountBalance(accountId: number, year: number): Promise<AccountBalance | undefined> {
    const [balance] = await db.select()
      .from(accountBalances)
      .where(and(eq(accountBalances.accountId, accountId), eq(accountBalances.year, year)));
    return balance;
  }

  async upsertAccountBalance(balance: InsertAccountBalance): Promise<AccountBalance> {
    const existing = await this.getAccountBalance(balance.accountId, balance.year);
    if (existing) {
      const [updated] = await db.update(accountBalances)
        .set({ openingBalance: balance.openingBalance })
        .where(eq(accountBalances.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(accountBalances).values(balance).returning();
    return created;
  }

  async syncFromSummenSalden(sourceYear: number, targetYear: number, previewOnly = false): Promise<{
    synced: { accountId: number; accountName: string; datevKonto: string; amount: number }[];
    skipped: { accountName: string; reason: string }[];
  }> {
    const allAccounts = await this.getAccounts();
    const mappedAccounts = allAccounts.filter(a => a.datevKonto);
    const entries = await this.getSummenSalden(sourceYear);

    const synced: { accountId: number; accountName: string; datevKonto: string; amount: number }[] = [];
    const skipped: { accountName: string; reason: string }[] = [];

    for (const account of mappedAccounts) {
      const datevKonto = account.datevKonto!;
      // Support "1840.1" notation for sub-accounts
      const [konto, sub = "0"] = datevKonto.split(".");
      const entry = entries.find(e => e.konto === konto && e.sub === sub);
      if (!entry) {
        skipped.push({ accountName: account.name, reason: `Konto ${datevKonto} nicht in Saldenliste ${sourceYear}` });
        continue;
      }
      // Sign: S = Aktivkonto (positive), H = Passivkonto (negative), null = 0
      const amount = entry.saldo != null
        ? (entry.saldoSeite === "S" ? entry.saldo : entry.saldoSeite === "H" ? -entry.saldo : 0)
        : 0;
      if (!previewOnly) {
        await this.upsertAccountBalance({ accountId: account.id, year: targetYear, openingBalance: amount });
      }
      synced.push({ accountId: account.id, accountName: account.name, datevKonto, amount });
    }

    return { synced, skipped };
  }

  async getTransactions(params?: {
    year?: number;
    years?: number[];  // Multiple years support
    categoryId?: number;
    categoryIds?: number[];  // Multiple categories support
    accountId?: number;
    accountIds?: number[];  // Multiple accounts support
    account?: string; 
    search?: string;
    startDate?: string;
    endDate?: string;
    minAmount?: number;
    maxAmount?: number;
    hasContract?: boolean;
  }): Promise<TransactionResponse[]> {
    let query = db.select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      description: transactions.description,
      counterparty: transactions.counterparty,
      categoryId: transactions.categoryId,
      accountId: transactions.accountId,
      contractId: transactions.contractId,
      account: transactions.account,
      recurring: transactions.recurring,
      hash: transactions.hash,
      createdAt: transactions.createdAt,
      categoryName: categories.name,
      categoryType: categories.type,
      accountName: accounts.name,
      contractName: contracts.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(contracts, eq(transactions.contractId, contracts.id));

    const filters = [];

    // Support multiple years with safe parameterization
    if (params?.years && params.years.length > 0) {
      // Use OR conditions for year filtering (safe from SQL injection)
      const yearConditions = params.years.map(y => sql`EXTRACT(YEAR FROM ${transactions.date}) = ${y}`);
      if (yearConditions.length === 1) {
        filters.push(yearConditions[0]);
      } else {
        filters.push(sql`(${sql.join(yearConditions, sql` OR `)})`);
      }
    } else if (params?.year) {
      filters.push(sql`EXTRACT(YEAR FROM ${transactions.date}) = ${params.year}`);
    }
    
    // Support multiple categories with IN clause
    if (params?.categoryIds && params.categoryIds.length > 0) {
      filters.push(inArray(transactions.categoryId, params.categoryIds));
    } else if (params?.categoryId) {
      filters.push(eq(transactions.categoryId, params.categoryId));
    }
    
    // Support multiple accounts with IN clause
    if (params?.accountIds && params.accountIds.length > 0) {
      filters.push(inArray(transactions.accountId, params.accountIds));
    } else if (params?.accountId) {
      filters.push(eq(transactions.accountId, params.accountId));
    }
    if (params?.account && params.account !== "all") {
      filters.push(eq(transactions.account, params.account));
    }
    if (params?.search) {
      // Search in both description and counterparty fields
      filters.push(sql`(${transactions.description} ILIKE ${`%${params.search}%`} OR ${transactions.counterparty} ILIKE ${`%${params.search}%`})`);
    }
    if (params?.startDate) {
      filters.push(sql`${transactions.date} >= ${new Date(params.startDate)}`);
    }
    if (params?.endDate) {
      filters.push(sql`${transactions.date} <= ${new Date(params.endDate)}`);
    }
    if (params?.minAmount !== undefined) {
      filters.push(sql`ABS(${transactions.amount}) >= ${params.minAmount}`);
    }
    if (params?.maxAmount !== undefined) {
      filters.push(sql`ABS(${transactions.amount}) <= ${params.maxAmount}`);
    }
    if (params?.hasContract === true) {
      filters.push(sql`${transactions.contractId} IS NOT NULL`);
    } else if (params?.hasContract === false) {
      filters.push(sql`${transactions.contractId} IS NULL`);
    }
    
    if (filters.length > 0) {
      query.where(and(...filters));
    }
    
    return await query.orderBy(desc(transactions.date)) as TransactionResponse[];
  }

  async linkTransactionToContract(transactionId: number, contractId: number): Promise<Transaction> {
    const [tx] = await db.update(transactions)
      .set({ contractId })
      .where(eq(transactions.id, transactionId))
      .returning();
    return tx;
  }

  async unlinkTransactionFromContract(transactionId: number): Promise<Transaction> {
    const [tx] = await db.update(transactions)
      .set({ contractId: null })
      .where(eq(transactions.id, transactionId))
      .returning();
    return tx;
  }

  async getTransaction(id: number): Promise<Transaction | undefined> {
    const [tx] = await db.select().from(transactions).where(eq(transactions.id, id));
    return tx;
  }

  async getTransactionsByIds(ids: number[]): Promise<TransactionWithDetails[]> {
    if (ids.length === 0) return [];
    const result = await db
      .select({
        id: transactions.id,
        date: transactions.date,
        description: transactions.description,
        amount: transactions.amount,
        account: transactions.account,
        accountId: transactions.accountId,
        categoryId: transactions.categoryId,
        hash: transactions.hash,
        categoryName: categories.name,
        fiscalArea: categories.fiscalArea,
        counterparty: transactions.counterparty,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(inArray(transactions.id, ids))
      .orderBy(desc(transactions.date));
    return result;
  }

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const [tx] = await db.insert(transactions).values(transaction).returning();
    return tx;
  }

  async updateTransaction(id: number, updates: UpdateTransactionRequest): Promise<Transaction> {
    const [tx] = await db.update(transactions).set(updates).where(eq(transactions.id, id)).returning();
    return tx;
  }

  async deleteTransaction(id: number): Promise<void> {
    if (isNaN(id)) return;
    await db.delete(transactions).where(eq(transactions.id, id));
  }

  async createTransactionsBulk(transactionsData: InsertTransaction[]): Promise<{ imported: number, duplicates: number }> {
    let imported = 0;
    let duplicates = 0;

    for (const tx of transactionsData) {
      // Create a unique hash based on date, amount, description and accountId
      const dateStr = new Date(tx.date).toISOString().split('T')[0];
      const accountKey = tx.accountId ? `aid${tx.accountId}` : (tx.account || "Hauptkonto");
      const hash = `${dateStr}_${tx.amount}_${tx.description}_${accountKey}`;
      
      const existing = await db.select().from(transactions).where(eq(transactions.hash, hash));
      if (existing.length > 0) {
        duplicates++;
        continue;
      }

      await db.insert(transactions).values({ ...tx, hash }).returning();
      imported++;
    }
    return { imported, duplicates };
  }

  async bulkUpdateTransactions(ids: number[], updates: Partial<UpdateTransactionRequest>): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db.update(transactions)
      .set(updates)
      .where(inArray(transactions.id, ids))
      .returning({ id: transactions.id });
    return result.length;
  }

  async getTransactionsByCounterparty(counterparty: string): Promise<TransactionResponse[]> {
    if (!counterparty || !counterparty.trim()) return [];
    const result = await db
      .select({
        id: transactions.id,
        date: transactions.date,
        description: transactions.description,
        amount: transactions.amount,
        account: transactions.account,
        accountId: transactions.accountId,
        categoryId: transactions.categoryId,
        counterparty: transactions.counterparty,
        recurring: transactions.recurring,
        hash: transactions.hash,
        createdAt: transactions.createdAt,
        categoryName: categories.name,
        categoryType: categories.type,
        accountName: accounts.name,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(eq(transactions.counterparty, counterparty.trim()))
      .orderBy(desc(transactions.date));
    return result as TransactionResponse[];
  }

  async getMonthlyStats(year: number, account?: string): Promise<{ month: string, income: number, expenses: number }[]> {
    const allTx = await this.getTransactions({ year, account });
    const cats = await this.getCategories();
    const transferCatIds = new Set(cats.filter(c => c.name === 'Interne Umbuchung').map(c => c.id));

    const stats = new Map<string, { income: number, expenses: number }>();
    
    for(let i=0; i<12; i++) {
        const m = `${year}-${String(i+1).padStart(2, '0')}`;
        stats.set(m, { income: 0, expenses: 0 });
    }

    for (const tx of allTx) {
        const dateObj = new Date(tx.date);
        if (isNaN(dateObj.getTime())) continue;
        const month = dateObj.toISOString().slice(0, 7);
        if (!stats.has(month)) continue;
        
        // Skip internal transfers from income/expense calculation
        if (tx.categoryId && transferCatIds.has(tx.categoryId)) continue;
        
        if (tx.amount > 0) {
            stats.get(month)!.income += tx.amount;
        } else {
            stats.get(month)!.expenses += Math.abs(tx.amount);
        }
    }

    return Array.from(stats.entries()).map(([month, data]) => ({ month, ...data })).sort((a,b) => a.month.localeCompare(b.month));
  }

  async getCategoryStats(year: number, account?: string): Promise<{ name: string, value: number }[]> {
    const allTx = await this.getTransactions({ year, account });
    const cats = await this.getCategories();
    const catNameMap = new Map(cats.map(c => [c.id, c.name]));
    
    const stats = new Map<string, number>();

    for (const tx of allTx) {
        let name = 'Uncategorized';
        if (tx.categoryId) {
            name = catNameMap.get(tx.categoryId) || 'Unknown';
        }
        const val = Math.abs(tx.amount);
        stats.set(name, (stats.get(name) || 0) + val);
    }
    
    return Array.from(stats.entries()).map(([name, value]) => ({ name, value }));
  }

  async getBalanceHistory(year: number, account?: string): Promise<{ date: string, balance: number }[]> {
    // Get opening balance for the year
    let openingBalance = 0;
    let accountIdFilter: number | undefined;
    
    if (account && account !== "all") {
      const accounts = await this.getAccounts();
      const matchedAccount = accounts.find(a => a.name === account || a.iban === account);
      if (matchedAccount) {
        accountIdFilter = matchedAccount.id;
      }
    }
    
    const balances = await this.getAccountBalances(year, accountIdFilter);
    if (balances.length > 0) {
      openingBalance = balances.reduce((sum, b) => sum + (b.openingBalance || 0), 0);
    }
    
    // Get transactions
    const allTx = await this.getTransactions({ account });
    
    // Sort by date
    const sortedTx = [...allTx].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Start with opening balance
    let balance = openingBalance;
    const history: { date: string, balance: number }[] = [];
    
    // Add starting point at year beginning
    history.push({ date: `${year}-01-01`, balance: openingBalance });

    for (const tx of sortedTx) {
        const dateObj = new Date(tx.date);
        if (isNaN(dateObj.getTime())) continue;
        
        // Only include transactions from the selected year
        if (dateObj.getFullYear() !== year) continue;
        
        balance += tx.amount;
        const dateStr = dateObj.toISOString().split('T')[0];
        
        if (history.length > 0 && history[history.length-1].date === dateStr) {
            history[history.length-1].balance = balance;
        } else {
            history.push({ date: dateStr, balance });
        }
    }
    return history;
  }

  async getTotalStats(year: number, account?: string): Promise<{ income: number, expenses: number }> {
     const monthly = await this.getMonthlyStats(year, account);
     return monthly.reduce((acc, curr) => ({
         income: acc.income + curr.income,
         expenses: acc.expenses + curr.expenses
     }), { income: 0, expenses: 0 });
  }

  async autoCategorize(transactionId: number): Promise<Transaction | undefined> {
    const tx = await this.getTransaction(transactionId);
    if (!tx || tx.categoryId) return tx;

    const cats = await this.getCategories();
    const descLower = tx.description.toLowerCase();

    // ── Step 1: Internal transfer detection ──────────────────────────────────
    // If "interne umbuchung", "festgeldanlage", or "neuanlage" is in the description,
    // this is a balance-sheet movement — skip, do not categorize as income/expense.
    if (
      descLower.includes('interne umbuchung') ||
      descLower.includes('festgeldanlage') ||
      descLower.includes('neuanlage  vr-festgeld') ||
      descLower.includes('darl. tilg') // loan repayment principal
    ) {
      return tx;
    }

    // Check via own IBANs in description (existing logic, improved)
    const accounts = await this.getAccounts();
    const realIbans = accounts.map(a => a.iban.toUpperCase()).filter(i => !i.startsWith('DATEV'));
    const descUpper = tx.description.toUpperCase();
    const mentionsOwnIban = realIbans.some(iban => descUpper.includes(iban));

    if (mentionsOwnIban) {
      const txDate = new Date(tx.date);
      const year = txDate.getFullYear();
      const allTx = await this.getTransactions({ year });
      const counterTx = allTx.find(other => {
        if (other.id === tx.id || other.accountId === tx.accountId) return false;
        const sameAmount = Math.abs(other.amount) === Math.abs(tx.amount);
        const oppositeSign = (other.amount > 0 && tx.amount < 0) || (other.amount < 0 && tx.amount > 0);
        if (!sameAmount || !oppositeSign) return false;
        const daysDiff = Math.abs((txDate.getTime() - new Date(other.date).getTime()) / 86400000);
        return daysDiff <= 2;
      });
      if (counterTx) return tx; // confirmed internal transfer — skip
    }

    // ── Step 2: Learn from counterparty (most powerful signal) ───────────────
    if (tx.counterparty) {
      const normalizedCP = tx.counterparty.toLowerCase().trim().replace(/\s+/g, ' ');
      const [topMatch] = await db
        .select({ categoryId: transactions.categoryId, cnt: sql<number>`COUNT(*)::int` })
        .from(transactions)
        .where(
          and(
            sql`LOWER(TRIM(REGEXP_REPLACE(counterparty, '\\s+', ' ', 'g'))) = ${normalizedCP}`,
            sql`category_id IS NOT NULL`,
            sql`id != ${transactionId}`,
          )
        )
        .groupBy(transactions.categoryId)
        .orderBy(desc(sql`COUNT(*)`))
        .limit(1);

      if (topMatch?.categoryId) {
        const cat = cats.find(c => c.id === topMatch.categoryId);
        if (cat && !(cat.type === 'income' && tx.amount < 0) && !(cat.type === 'expense' && tx.amount > 0)) {
          return await this.updateTransaction(transactionId, { categoryId: cat.id });
        }
      }
    }

    // ── Step 3: Keyword mapping (description-based) ──────────────────────────
    const mapping: Record<string, string[]> = {
      // A. Ideeller Bereich
      "Mitgliedsbeiträge": ["sepa sammel", "mitglied", "jahresbeitrag", "mitgliedschaft", "basis-ls e.v"],
      "Abteilungsbeiträge": ["skiclub beitrag", "abteilungsbeitrag"],
      "Spenden": ["spende", "geldspende", "foerderverein", "förderverein"],
      "Stiftungen": ["stiftung", "dengler"],
      "Zuschüsse": [
        "zuschuss", "förderung", "beihilfe", "vereinspauschale", "sportförderung",
        "kostenbeteiligung", "sportforderung", "ao 6215", "ao 6426",
      ],
      "Verbandsabgaben": ["verband", "blsv", "dfb", "bfv", "bayerischer fussball"],
      "Sonstige Ausgaben": [
        "rückweisung", "rueckweisung", "mahngebühr", "retoure", "fehlbuchung",
        "grabpflege", "rollengebühr",
      ],
      "Bankgebühren": ["abschluss per", "kontoführung", "kontoabschluss", "buchungsposten"],
      "Steuern": ["finanzamt", "steuer", "kest", "solidaritätszuschlag"],
      "Büromaterial & Porto": ["porto", "büromaterial", "druckerei", "briefmarke"],

      // B. Vermögensverwaltung
      "Pachteinnahmen": ["pacht"],
      "Nebenkosten-Abrechnung": ["nebenkosten", "betriebskosten", "svg-verr", "abrechnung"],
      "Platz & Gebäude": ["turnhalle", "sporthalle", "grundsteuer", "reinigung", "hausmeister", "müll", "abwasser"],
      "Strom & Energie": ["n-ergie", "stromversorgung", "strom", "gas", "fernwärme", "energie", "heizwerk", "wärme", "abschlag energie"],
      "Wasser & Heizung": ["wasserversorgung", "wasserwerk", "heizung", "heizöl"],
      "Versicherungen": ["versicherung", "arag", "allianz", "signal", "haftpflicht", "zurich", "vdek"],
      "Reparaturen": ["reparatur", "instandhaltung", "wartung", "sanierung"],
      "Zinserträge": ["zinsgutschrift", "zinsertrag", "habenzins"],
      "Darlehenszinsen": ["zinsaufwand", "darlehenszins", "annuität"],

      // C. Zweckbetriebe
      "Veranstaltungen (Einnahmen)": [
        "hallencup", "fasching", "vereinsfest", "stadtmeisterschaft", "sommerfest",
        "weihnachtsfeier einnahmen", "ertrag weihnachtsfeier",
      ],
      "Veranstaltungen (Ausgaben)": [
        "trainingslager", "soccatours", "mossner-reisen", "busfahrt", "zeltverleih",
        "auszahlung weihnachtsfeier",
      ],
      "Eintrittsgelder": ["sportplatzeinnahmen", "eintritt"],
      "Startgelder": ["startgeld", "meldegebühr"],
      "Spielerablöse": ["spielerwechsel", "ablöse", "abloese", "transferentschädigung"],
      "Übungsleiter": ["übungsleiter", "uebungsleiter", "ül-vergütung", "ul-vergütung"],
      "Ehrenamtspauschale": ["ehrenamtspauschale"],
      "Aufwandsentschädigung": ["aufwandsentschädigung", "auslagenerstattung"],
      "Trainer & Schiedsrichter": ["trainerlohn", "schiedsrichter", "trainer"],
      "Schiedsrichter": ["schiedsrichtergebühr"],
      "Geräte & Material": ["baumarkt", "obi", "holz", "werkzeug", "material"],
      "Sportkleidung": ["trikot", "dress", "sportbekleidung", "bekleidung", "sport koenig", "sportausrüstung"],
      "Platzpflege": ["platzpflege", "rasen", "mäher", "dünger", "landtechnik", "platzpfleg"],
      "Fahrzeugkosten": ["tankstelle", "kraftstoff", "kfz", "fahrzeug"],
      "Teilnehmergebühren": ["teilnahmegebühr", "kursgebühr"],

      // D. Wirtschaftlicher Geschäftsbetrieb
      "Sponsoring": ["sponsoring", "sponsor"],
      "Werbekosten": ["werbung", "werbeagentur", "image werbung", "markwart", "bandenwerbung", "banner"],
      "Bewirtung": ["bewirtung", "speisen", "catering", "pizz", "metzgerei", "getränk", "edeka", "lebensmittel"],
      "Wareneinkauf": ["wareneinkauf", "getränkehandel", "brauerei", "getränke"],
    };

    for (const [catName, keywords] of Object.entries(mapping)) {
      if (keywords.some(k => descLower.includes(k))) {
        const cat = cats.find(c => c.name === catName);
        if (cat) {
          if (cat.type === 'income' && tx.amount < 0) continue;
          if (cat.type === 'expense' && tx.amount > 0) continue;
          return await this.updateTransaction(transactionId, { categoryId: cat.id });
        }
      }
    }

    return tx;
  }

  async deleteAllTransactions(): Promise<void> {
    console.log("Storage: Starting deletion of all transactions");
    try {
      const result = await db.delete(transactions).returning();
      console.log(`Storage: Deleted ${result.length} transactions`);
    } catch (e) {
      console.error("Storage: Error deleting all transactions:", e);
      throw e;
    }
  }

  async getFiscalAreaStats(year: number): Promise<FiscalAreaReport> {
    const allTx = await this.getTransactions({ year });
    const cats = await this.getCategories();
    
    const catMap = new Map(cats.map(c => [c.id, c]));
    
    const fiscalAreas = [
      { name: 'ideell', label: 'A. Ideeller Tätigkeitsbereich' },
      { name: 'vermoegensverwaltung', label: 'B. Vermögensverwaltung' },
      { name: 'zweckbetrieb', label: 'C. Zweckbetriebe' },
      { name: 'wirtschaftlich', label: 'D. Wirtschaftlicher Geschäftsbetrieb' }
    ];

    const areas: FiscalAreaSummary[] = fiscalAreas.map(area => {
      const areaCats = cats.filter(c => c.fiscalArea === area.name);
      const catIds = new Set(areaCats.map(c => c.id));
      
      const areaTx = allTx.filter(tx => tx.categoryId && catIds.has(tx.categoryId));
      
      let income = 0;
      let expenses = 0;
      const catStats = new Map<number, { name: string; amount: number; type: string }>();
      
      for (const tx of areaTx) {
        const cat = catMap.get(tx.categoryId!);
        if (!cat) continue;
        
        const absAmount = Math.abs(tx.amount);
        if (cat.type === 'income') {
          income += absAmount;
        } else {
          expenses += absAmount;
        }
        
        if (!catStats.has(cat.id)) {
          catStats.set(cat.id, { name: cat.name, amount: 0, type: cat.type });
        }
        catStats.get(cat.id)!.amount += absAmount;
      }
      
      return {
        name: area.name,
        label: area.label,
        income,
        expenses,
        net: income - expenses,
        categories: Array.from(catStats.values()).sort((a, b) => b.amount - a.amount)
      };
    });

    const totalIncome = areas.reduce((sum, a) => sum + a.income, 0);
    const totalExpenses = areas.reduce((sum, a) => sum + a.expenses, 0);

    return {
      year,
      areas,
      totalIncome,
      totalExpenses,
      totalNet: totalIncome - totalExpenses
    };
  }

  // EÜR Report methods (PDF-based)
  async getEuerReport(year: number): Promise<EuerReport | undefined> {
    const [report] = await db.select().from(euerReports).where(eq(euerReports.year, year));
    return report;
  }

  async getEuerReports(): Promise<EuerReport[]> {
    return await db.select().from(euerReports).orderBy(desc(euerReports.year));
  }

  async upsertEuerReport(report: InsertEuerReport): Promise<EuerReport> {
    const existing = await this.getEuerReport(report.year);
    if (existing) {
      const [updated] = await db.update(euerReports)
        .set(report)
        .where(eq(euerReports.year, report.year))
        .returning();
      return updated;
    }
    const [created] = await db.insert(euerReports).values(report).returning();
    return created;
  }

  async deleteEuerReport(year: number): Promise<void> {
    const report = await this.getEuerReport(year);
    if (report) {
      await db.delete(euerLineItems).where(eq(euerLineItems.reportId, report.id));
    }
    await db.delete(euerReports).where(eq(euerReports.year, year));
  }

  // EÜR Line Items
  async getEuerLineItems(reportId: number): Promise<EuerLineItem[]> {
    return await db.select().from(euerLineItems).where(eq(euerLineItems.reportId, reportId));
  }

  async getEuerLineItemsByArea(reportId: number, fiscalArea: "ideell" | "vermoegensverwaltung" | "zweckbetrieb" | "wirtschaftlich"): Promise<EuerLineItem[]> {
    return await db.select().from(euerLineItems)
      .where(and(eq(euerLineItems.reportId, reportId), eq(euerLineItems.fiscalArea, fiscalArea)));
  }

  async upsertEuerLineItems(reportId: number, items: Omit<InsertEuerLineItem, 'reportId'>[]): Promise<EuerLineItem[]> {
    // Delete existing items for this report
    await db.delete(euerLineItems).where(eq(euerLineItems.reportId, reportId));
    
    if (items.length === 0) return [];
    
    // Insert new items
    const toInsert = items.map(item => ({ ...item, reportId }));
    return await db.insert(euerLineItems).values(toInsert).returning();
  }

  // Summen- und Saldenliste
  async upsertSummenSalden(year: number, entries: InsertSummenSaldenEntry[]): Promise<SummenSaldenEntry[]> {
    await db.delete(summenSaldenEntries).where(eq(summenSaldenEntries.year, year));
    if (entries.length === 0) return [];
    return await db.insert(summenSaldenEntries).values(entries).returning();
  }

  async getSummenSalden(year: number): Promise<SummenSaldenEntry[]> {
    return await db.select().from(summenSaldenEntries)
      .where(eq(summenSaldenEntries.year, year))
      .orderBy(asc(summenSaldenEntries.konto), asc(summenSaldenEntries.sub));
  }

  async getSummenSaldenYears(): Promise<number[]> {
    const rows = await db.selectDistinct({ year: summenSaldenEntries.year })
      .from(summenSaldenEntries)
      .orderBy(desc(summenSaldenEntries.year));
    return rows.map(r => r.year);
  }

  async getLiquideMittel(year: number): Promise<LiquideMittelSummary> {
    const all = await this.getSummenSalden(year);
    // Liquide Mittel: Kasse (16xx) + Bank (18xx)
    const details = all.filter(e => e.konto.startsWith('16') || e.konto.startsWith('18'));

    const anfangsbestand = details.reduce((sum, e) => {
      const val = e.ebWert ?? 0;
      return sum + (e.ebSeite === 'S' ? val : e.ebSeite === 'H' ? -val : 0);
    }, 0);

    const endbestand = details.reduce((sum, e) => {
      const val = e.saldo ?? 0;
      return sum + (e.saldoSeite === 'S' ? val : e.saldoSeite === 'H' ? -val : 0);
    }, 0);

    return { year, anfangsbestand, endbestand, veraenderung: endbestand - anfangsbestand, details };
  }

  async deleteSummenSalden(year: number): Promise<void> {
    await db.delete(summenSaldenEntries).where(eq(summenSaldenEntries.year, year));
  }

  // Events / Veranstaltungen
  async getEvents(): Promise<EventWithTotals[]> {
    const allEvents = await db.select().from(events).orderBy(desc(events.date));
    const result: EventWithTotals[] = [];
    
    for (const event of allEvents) {
      const entries = await db.select().from(eventEntries).where(eq(eventEntries.eventId, event.id));
      const totalIncome = entries.reduce((sum, e) => sum + (e.income || 0), 0);
      const totalExpenses = entries.reduce((sum, e) => sum + (e.expense || 0), 0);
      result.push({
        ...event,
        totalIncome,
        totalExpenses,
        result: totalIncome - totalExpenses
      });
    }
    return result;
  }

  async getEvent(id: number): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event;
  }

  async createEvent(event: InsertEvent): Promise<Event> {
    const [created] = await db.insert(events).values(event).returning();
    return created;
  }

  async updateEvent(id: number, updates: Partial<InsertEvent>): Promise<Event> {
    const [updated] = await db.update(events).set(updates).where(eq(events.id, id)).returning();
    return updated;
  }

  async deleteEvent(id: number): Promise<void> {
    await db.delete(eventEntries).where(eq(eventEntries.eventId, id));
    await db.delete(events).where(eq(events.id, id));
  }

  // Event Entries
  async getEventEntries(eventId: number): Promise<EventEntry[]> {
    return await db.select().from(eventEntries)
      .where(eq(eventEntries.eventId, eventId))
      .orderBy(asc(eventEntries.date));
  }

  async createEventEntry(entry: InsertEventEntry): Promise<EventEntry> {
    const [created] = await db.insert(eventEntries).values(entry).returning();
    return created;
  }

  async updateEventEntry(id: number, updates: Partial<InsertEventEntry>): Promise<EventEntry> {
    const [updated] = await db.update(eventEntries).set(updates).where(eq(eventEntries.id, id)).returning();
    return updated;
  }

  async deleteEventEntry(id: number): Promise<void> {
    await db.delete(eventEntries).where(eq(eventEntries.id, id));
  }

  // Contracts (recurring payments/income)
  async getContracts(includeInactive: boolean = false): Promise<ContractWithCategory[]> {
    const allContracts = await db.select().from(contracts).orderBy(contracts.name);
    const cats = await this.getCategories();
    const catMap = new Map(cats.map(c => [c.id, c.name]));
    
    return allContracts
      .filter(c => includeInactive || c.isActive)
      .map(c => ({
        ...c,
        categoryName: c.categoryId ? catMap.get(c.categoryId) : undefined
      }));
  }

  async getContract(id: number): Promise<Contract | undefined> {
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id));
    return contract;
  }

  async createContract(contract: InsertContract): Promise<Contract> {
    const [created] = await db.insert(contracts).values(contract).returning();
    return created;
  }

  async updateContract(id: number, updates: Partial<InsertContract>): Promise<Contract> {
    const [updated] = await db.update(contracts).set(updates).where(eq(contracts.id, id)).returning();
    return updated;
  }

  async deleteContract(id: number): Promise<void> {
    // First, unlink all transactions that reference this contract
    await db.update(transactions)
      .set({ contractId: null })
      .where(eq(transactions.contractId, id));
    // Then delete the contract
    await db.delete(contracts).where(eq(contracts.id, id));
  }

  // Contract Suggestions (auto-detected recurring payments)
  async getContractSuggestions(status?: "pending" | "accepted" | "dismissed"): Promise<ContractSuggestionWithDetails[]> {
    let query = db.select().from(contractSuggestions);
    let suggestions: ContractSuggestion[];
    
    if (status) {
      suggestions = await query.where(eq(contractSuggestions.status, status)).orderBy(desc(contractSuggestions.confidence));
    } else {
      suggestions = await query.orderBy(desc(contractSuggestions.confidence));
    }
    
    const cats = await this.getCategories();
    const accs = await this.getAccounts();
    const catMap = new Map(cats.map(c => [c.id, c.name]));
    const accMap = new Map(accs.map(a => [a.id, a.name]));
    
    return suggestions.map(s => ({
      ...s,
      categoryName: s.categoryId ? catMap.get(s.categoryId) : undefined,
      accountName: s.accountId ? accMap.get(s.accountId) : undefined
    }));
  }

  async getContractSuggestion(id: number): Promise<ContractSuggestion | undefined> {
    const [suggestion] = await db.select().from(contractSuggestions).where(eq(contractSuggestions.id, id));
    return suggestion;
  }

  async createContractSuggestion(suggestion: InsertContractSuggestion): Promise<ContractSuggestion> {
    const [created] = await db.insert(contractSuggestions).values(suggestion).returning();
    return created;
  }

  async updateContractSuggestionStatus(id: number, status: "pending" | "accepted" | "dismissed"): Promise<ContractSuggestion> {
    const [updated] = await db.update(contractSuggestions).set({ status }).where(eq(contractSuggestions.id, id)).returning();
    return updated;
  }

  async clearPendingSuggestions(): Promise<void> {
    await db.delete(contractSuggestions).where(eq(contractSuggestions.status, "pending"));
  }

  async acceptSuggestion(id: number): Promise<Contract> {
    const suggestion = await this.getContractSuggestion(id);
    if (!suggestion) throw new Error("Vorschlag nicht gefunden");

    const type = suggestion.type as "income" | "expense";
    const signedAmount = type === "expense"
      ? -Math.abs(suggestion.amount)
      : Math.abs(suggestion.amount);

    const contract = await this.createContract({
      name: suggestion.name,
      description: suggestion.description,
      amount: signedAmount,
      frequency: suggestion.frequency as "monthly" | "quarterly" | "yearly",
      type,
      categoryId: suggestion.categoryId,
      isActive: true
    });

    await this.updateContractSuggestionStatus(id, "accepted");
    return contract;
  }

  async getKassenberichtConfig(key: string): Promise<string | null> {
    const [row] = await db.select().from(kassenberichtConfig).where(eq(kassenberichtConfig.key, key));
    return row?.value ?? null;
  }

  async setKassenberichtConfig(key: string, value: string): Promise<void> {
    await db.insert(kassenberichtConfig)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: kassenberichtConfig.key, set: { value, updatedAt: new Date() } });
  }

  // === DATEV Bookings ===

  async upsertDatevBookings(
    bookings: InsertDatevBooking[]
  ): Promise<{ inserted: number; skipped: number }> {
    if (bookings.length === 0) return { inserted: 0, skipped: 0 };

    // Prüfe welche GUIDs schon existieren
    const guids = bookings.map((b) => b.buchungsGuid);
    const existing = await db
      .select({ guid: datevBookings.buchungsGuid })
      .from(datevBookings)
      .where(inArray(datevBookings.buchungsGuid, guids));
    const existingSet = new Set(existing.map((e) => e.guid));

    const toInsert = bookings.filter((b) => !existingSet.has(b.buchungsGuid));
    if (toInsert.length === 0) {
      return { inserted: 0, skipped: bookings.length };
    }

    // Batched insert (PG hat Parameter-Limit ~64k, wir halten uns bei 500 Zeilen)
    for (let i = 0; i < toInsert.length; i += 500) {
      await db.insert(datevBookings).values(toInsert.slice(i, i + 500));
    }
    return { inserted: toInsert.length, skipped: bookings.length - toInsert.length };
  }

  async getDatevBookings(year: number): Promise<DatevBooking[]> {
    return db
      .select()
      .from(datevBookings)
      .where(eq(datevBookings.year, year))
      .orderBy(asc(datevBookings.belegdatum), asc(datevBookings.id));
  }

  async getDatevYears(): Promise<number[]> {
    const rows = await db
      .selectDistinct({ year: datevBookings.year })
      .from(datevBookings);
    return rows.map((r) => r.year).sort((a, b) => b - a);
  }

  async getDatevPivot(year: number): Promise<DatevPivotSummary> {
    const rows = await db
      .select()
      .from(datevBookings)
      .where(eq(datevBookings.year, year));

    const totals: Record<string, number> = {};
    for (const c of EAS_CATEGORIES) totals[c] = 0;
    totals["UNCLASSIFIED"] = 0;

    let unclassifiedCount = 0;
    for (const r of rows) {
      const key = r.easCategory ?? (r.euerKonto === null ? null : "UNCLASSIFIED");
      if (!key) continue; // Bilanz-Buchungen (beide SKIP) bleiben aus dem Pivot
      totals[key] = (totals[key] ?? 0) + r.umsatz;
      if (key === "UNCLASSIFIED") unclassifiedCount++;
    }

    const gesamt = EAS_CATEGORIES.reduce((s, c) => {
      // Einnahmen positiv, Ausgaben negativ
      const isIncome = c.endsWith("1");
      return s + (isIncome ? totals[c] : -totals[c]);
    }, 0);

    return {
      year,
      totals: totals as DatevPivotSummary["totals"],
      gesamt,
      bookingCount: rows.length,
      unclassifiedCount,
    };
  }

  async updateDatevBookingClassification(
    id: number,
    easCategory: EasCategory
  ): Promise<void> {
    await db
      .update(datevBookings)
      .set({ easCategory, manualOverride: true })
      .where(eq(datevBookings.id, id));
  }

  async deleteDatevBookingsByYear(year: number): Promise<number> {
    const deleted = await db
      .delete(datevBookings)
      .where(eq(datevBookings.year, year))
      .returning({ id: datevBookings.id });
    return deleted.length;
  }

  async getDatevKontoMapping(): Promise<DatevKontoMapping[]> {
    return db.select().from(datevKontoMapping).orderBy(asc(datevKontoMapping.konto));
  }

  async upsertDatevKontoMapping(entry: InsertDatevKontoMapping): Promise<void> {
    await db
      .insert(datevKontoMapping)
      .values({ ...entry, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: datevKontoMapping.konto,
        set: {
          kontoname: entry.kontoname,
          easCategory: entry.easCategory,
          source: entry.source,
          updatedAt: new Date(),
        },
      });
  }

  async bulkUpsertDatevKontoMapping(entries: InsertDatevKontoMapping[]): Promise<void> {
    if (entries.length === 0) return;
    for (const e of entries) {
      await this.upsertDatevKontoMapping(e);
    }
  }

  /**
   * Wendet das aktuelle Mapping auf alle bestehenden Buchungen eines Jahres neu an
   * (z.B. nach manuellem Mapping-Update). Überschreibt `manualOverride=true`-Zeilen NICHT.
   */
  async reclassifyDatevBookings(year: number): Promise<number> {
    const { classifyBooking } = await import("./datevSkr49Mapping");
    const mapping = await this.getDatevKontoMapping();
    const m = new Map<string, any>();
    for (const entry of mapping) m.set(entry.konto, entry.easCategory);

    const rows = await db
      .select()
      .from(datevBookings)
      .where(and(eq(datevBookings.year, year), eq(datevBookings.manualOverride, false)));

    let updated = 0;
    for (const row of rows) {
      const { euerKonto, easCategory } = classifyBooking(
        row.konto,
        row.gegenkonto,
        m,
        row.kost1 ?? null,
      );
      if (row.easCategory !== easCategory || row.euerKonto !== euerKonto) {
        await db
          .update(datevBookings)
          .set({ easCategory, euerKonto })
          .where(eq(datevBookings.id, row.id));
        updated++;
      }
    }
    return updated;
  }
}

export const storage = new DatabaseStorage();
