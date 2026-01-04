import { db } from "./db";
import { 
  categories, transactions, accounts,
  type Category, type InsertCategory,
  type Transaction, type InsertTransaction,
  type UpdateCategoryRequest, type UpdateTransactionRequest,
  type Account, type TransactionResponse
} from "@shared/schema";
import { eq, and, sql, desc, asc } from "drizzle-orm";
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

  // Transactions
  getTransactions(params?: { 
    year?: number; 
    categoryId?: number; 
    accountId?: number;
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
  
  // Stats
  getMonthlyStats(year: number, account?: string): Promise<{ month: string, income: number, expenses: number }[]>;
  getCategoryStats(year: number, account?: string): Promise<{ name: string, value: number }[]>;
  getBalanceHistory(year: number, account?: string): Promise<{ date: string, balance: number }[]>;
  getTotalStats(year: number, account?: string): Promise<{ income: number, expenses: number }>;
  autoCategorize(transactionId: number): Promise<Transaction | undefined>;
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
        { name: "Mitgliedsbeiträge", type: "income", isDefault: true },
        { name: "Spenden", type: "income", isDefault: true },
        { name: "Veranstaltungen", type: "income", isDefault: true },
        { name: "Zuschüsse", type: "income", isDefault: true },
        { name: "Sponsoring", type: "income", isDefault: true },
        { name: "Sportbetrieb", type: "expense", isDefault: true },
        { name: "Platz & Gebäude", type: "expense", isDefault: true },
        { name: "Geräte & Material", type: "expense", isDefault: true },
        { name: "Trainer & Personal", type: "expense", isDefault: true },
        { name: "Versicherungen", type: "expense", isDefault: true },
        { name: "Verbandsabgaben", type: "expense", isDefault: true },
        { name: "Verwaltung & Büro", type: "expense", isDefault: true },
        { name: "Bankgebühren", type: "expense", isDefault: true },
        { name: "Steuern", type: "expense", isDefault: true },
        { name: "Sonstiges", type: "expense", isDefault: true },
      ];
      // @ts-ignore
      await db.insert(categories).values(defaultCategories);
    }
  }

  async getAccounts(): Promise<Account[]> {
    return await db.select().from(accounts).orderBy(accounts.name);
  }

  async getAccountByIban(iban: string): Promise<Account | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.iban, iban));
    return account;
  }

  async getOrCreateAccount(iban: string, name?: string): Promise<Account> {
    const existing = await this.getAccountByIban(iban);
    if (existing) return existing;

    const displayName = name || `Konto ****${iban.slice(-4)}`;
    const [newAccount] = await db.insert(accounts).values({ iban, name: displayName }).returning();
    return newAccount;
  }

  async getTransactions(params?: { 
    year?: number; 
    categoryId?: number; 
    accountId?: number;
    account?: string; 
    search?: string;
    startDate?: string;
    endDate?: string;
    minAmount?: number;
    maxAmount?: number;
  }): Promise<TransactionResponse[]> {
    let query = db.select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      description: transactions.description,
      categoryId: transactions.categoryId,
      accountId: transactions.accountId,
      account: transactions.account,
      recurring: transactions.recurring,
      hash: transactions.hash,
      createdAt: transactions.createdAt,
      categoryName: categories.name,
      categoryType: categories.type,
      accountName: accounts.name
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id));

    const filters = [];

    if (params?.year) {
      filters.push(sql`EXTRACT(YEAR FROM ${transactions.date}) = ${params.year}`);
    }
    if (params?.categoryId) {
      filters.push(eq(transactions.categoryId, params.categoryId));
    }
    if (params?.accountId) {
      filters.push(eq(transactions.accountId, params.accountId));
    }
    if (params?.account && params.account !== "all") {
      filters.push(eq(transactions.account, params.account));
    }
    if (params?.search) {
      filters.push(sql`${transactions.description} ILIKE ${`%${params.search}%`}`);
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
    
    if (filters.length > 0) {
      query.where(and(...filters));
    }
    
    return await query.orderBy(desc(transactions.date)) as TransactionResponse[];
  }

  async getTransaction(id: number): Promise<Transaction | undefined> {
    const [tx] = await db.select().from(transactions).where(eq(transactions.id, id));
    return tx;
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
    await db.delete(transactions).where(eq(transactions.id, id));
  }

  async createTransactionsBulk(transactionsData: InsertTransaction[]): Promise<{ imported: number, duplicates: number }> {
    let imported = 0;
    let duplicates = 0;

    for (const tx of transactionsData) {
      // Create a unique hash based on date, amount, description and account
      const dateStr = new Date(tx.date).toISOString().split('T')[0];
      const accountStr = tx.account || "Hauptkonto";
      const hash = `${dateStr}_${tx.amount}_${tx.description}_${accountStr}`;
      
      const existing = await db.select().from(transactions).where(eq(transactions.hash, hash));
      if (existing.length > 0) {
        duplicates++;
        continue;
      }

      const [insertedTx] = await db.insert(transactions).values({ ...tx, hash }).returning();
      if (insertedTx) {
        await this.autoCategorize(insertedTx.id);
      }
      imported++;
    }
    return { imported, duplicates };
  }

  async getMonthlyStats(year: number, account?: string): Promise<{ month: string, income: number, expenses: number }[]> {
    const allTx = await this.getTransactions({ year, account });
    const cats = await this.getCategories();
    const catTypeMap = new Map(cats.map(c => [c.id, c.type]));

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
        
        const categoryId = tx.categoryId;
        const type = categoryId ? catTypeMap.get(categoryId) : null;
        if (type === 'income' || (!type && tx.amount > 0)) {
            stats.get(month)!.income += tx.amount;
        } else if (type === 'expense' || (!type && tx.amount < 0)) {
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
    let query = db.select().from(transactions).orderBy(asc(transactions.date));
    // Filter by account string or accountId if we had it, but for compatibility keep account string for now
    if (account && account !== "all") {
      query.where(eq(transactions.account, account));
    }
    const allTx = await query;
    let balance = 0;
    const history: { date: string, balance: number }[] = [];

    for (const tx of allTx) {
        balance += tx.amount;
        const dateObj = new Date(tx.date);
        if (isNaN(dateObj.getTime())) continue;
        const dateStr = dateObj.toISOString().split('T')[0];
        if (dateObj.getFullYear() === year) {
           if (history.length > 0 && history[history.length-1].date === dateStr) {
               history[history.length-1].balance = balance;
           } else {
               history.push({ date: dateStr, balance });
           }
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
    const desc = tx.description.toLowerCase();

    const mapping: Record<string, string[]> = {
      "Mitgliedsbeiträge": ["beitrag", "mitglied", "jahresbeitrag"],
      "Spenden": ["spende", "zuwendung", "stiftung"],
      "Veranstaltungen (Einnahmen)": ["hallencup", "turnier", "fasching", "weihnachtsfeier"],
      "Veranstaltungen (Ausgaben)": ["hallencup", "turnier", "fasching", "weihnachtsfeier"],
      "Sponsoring": ["sponsoring", "werbung"],
      "Trainer & Schiedsrichter": ["trainer", "lohn", "schiedsrichter", "uel-verguetung"],
      "Platz & Gebäude": ["strom", "wasser", "gas", "wärme", "heizung", "pacht", "grundsteuer", "reinigung"],
      "Bankgebühren": ["abschluss", "zinsen", "gebühr", "entgelt", "buchung", "karte"],
      "Versicherungen": ["versicherung", "arag", "vdek"],
      "Verbandsabgaben": ["verband", "blsv", "dfb", "bfv"],
      "Geräte & Material": ["baumarkt", "obi", "holz", "werkzeug"],
    };

    for (const [catName, keywords] of Object.entries(mapping)) {
      if (keywords.some(k => desc.includes(k))) {
        const cat = cats.find(c => c.name === catName);
        if (cat) {
          // If it's a category that exists for both income and expense, check amount
          if (catName === "Veranstaltungen (Einnahmen)" && tx.amount < 0) continue;
          if (catName === "Veranstaltungen (Ausgaben)" && tx.amount > 0) continue;
          
          return await this.updateTransaction(transactionId, { categoryId: cat.id });
        }
      }
    }

    return tx;
  }
}

export const storage = new DatabaseStorage();
