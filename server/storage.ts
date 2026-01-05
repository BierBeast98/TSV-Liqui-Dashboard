import { db } from "./db";
import { 
  categories, transactions, accounts, accountBalances, euerReports, euerLineItems,
  type Category, type InsertCategory,
  type Transaction, type InsertTransaction,
  type UpdateCategoryRequest, type UpdateTransactionRequest,
  type Account, type TransactionResponse,
  type AccountBalance, type InsertAccountBalance,
  type EuerReport, type InsertEuerReport,
  type EuerLineItem, type InsertEuerLineItem
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

  // Account Balances (Opening balances per year)
  getAccountBalances(year: number): Promise<(AccountBalance & { accountName: string; iban: string })[]>;
  getAccountBalance(accountId: number, year: number): Promise<AccountBalance | undefined>;
  upsertAccountBalance(balance: InsertAccountBalance): Promise<AccountBalance>;

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

  async getAccountBalances(year: number): Promise<(AccountBalance & { accountName: string; iban: string })[]> {
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
    .where(eq(accountBalances.year, year));
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
    if (isNaN(id)) return;
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

      await db.insert(transactions).values({ ...tx, hash }).returning();
      imported++;
    }
    return { imported, duplicates };
  }

  async getMonthlyStats(year: number, account?: string): Promise<{ month: string, income: number, expenses: number }[]> {
    const allTx = await this.getTransactions({ year, account });

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
    let query = db.select().from(transactions).orderBy(asc(transactions.date));
    
    if (account && account !== "all") {
      // Check if it's a numeric ID (new accountId) or a string (legacy account name)
      if (!isNaN(Number(account))) {
        query.where(eq(transactions.accountId, Number(account)));
      } else {
        query.where(eq(transactions.account, account));
      }
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
      // A. Ideeller Bereich
      "Mitgliedsbeiträge": ["beitrag", "mitglied", "jahresbeitrag", "mitgliedschaft"],
      "Spenden": ["spende", "zuwendung", "stiftung", "geldspende"],
      "Zuschüsse": ["zuschuss", "förderung", "beihilfe", "kommunal"],
      "Verbandsabgaben": ["verband", "blsv", "dfb", "bfv", "bayerischer"],
      "Bankgebühren": ["abschluss per", "zinsen", "gebühr", "entgelt", "kontoführung", "karte", "abschluss"],
      "Steuern": ["finanzamt", "steuer", "ust", "kest"],
      "Sonstige Ausgaben": ["rückweisung", "rueckweisung", "mahngebühr"],
      
      // B. Vermögensverwaltung
      "Pachteinnahmen": ["pacht", "miete eingang"],
      "Platz & Gebäude": ["n-ergie", "energie", "heizung", "grundsteuer", "reinigung", "hausmeister", "müll"],
      "Strom & Energie": ["strom", "gas", "fernwärme"],
      "Versicherungen": ["versicherung", "arag", "vdek", "allianz", "signal", "haftpflicht"],
      "Reparaturen": ["reparatur", "instandhaltung", "wartung"],
      
      // C. Zweckbetriebe
      "Veranstaltungen (Einnahmen)": ["hallencup", "turnier", "fasching", "weihnachtsfeier", "vereinsfest"],
      "Veranstaltungen (Ausgaben)": ["hallencup", "turnier", "fasching", "weihnachtsfeier", "vereinsfest"],
      "Übungsleiter": ["übungsleiter", "uebungsleiter", "übungsleiter-tätigkeit", "uel"],
      "Ehrenamtspauschale": ["ehrenamtspauschale", "ehrenamt"],
      "Aufwandsentschädigung": ["aufwandsentschädigung", "aufwand", "auslagen"],
      "Trainer & Schiedsrichter": ["trainer", "schiedsrichter", "lohn"],
      "Geräte & Material": ["baumarkt", "obi", "holz", "werkzeug", "sport", "ball", "trikot"],
      "Sportkleidung": ["trikot", "dress", "sportbekleidung", "kleidung"],
      "Platzpflege": ["platzpflege", "rasen", "mäher", "dünger"],
      "Teilnehmergebühren": ["teilnehmer", "kurs", "training"],
      
      // D. Wirtschaftlicher Geschäftsbetrieb
      "Sponsoring": ["sponsoring", "sponsor", "werbung"],
      "Bandenwerbung": ["bande", "bandenwerbung"],
      "Bewirtung": ["bewirtung", "getränke", "speisen", "catering"],
      "Wareneinkauf": ["einkauf", "waren", "getränkehandel", "brauerei"],
    };

    for (const [catName, keywords] of Object.entries(mapping)) {
      if (keywords.some(k => desc.includes(k))) {
        const cat = cats.find(c => c.name === catName);
        if (cat) {
          // Check if category type matches transaction direction
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
}

export const storage = new DatabaseStorage();
