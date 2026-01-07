import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { insertTransactionSchema, insertContractSchema, type InsertTransaction } from "@shared/schema";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import multer from "multer";
import { parse } from "csv-parse/sync";
import path from "path";
import fs from "fs";
import { processAssistantQuery } from "./assistant";

const upload = multer({ storage: multer.memoryStorage() });

// PDF upload storage for EÜR reports
const pdfStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'euer-pdfs');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const year = req.params.year || 'unknown';
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `euer_${year}_${timestamp}${ext}`);
  }
});

const pdfUpload = multer({
  storage: pdfStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Nur PDF-Dateien erlaubt'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Setup Auth
  await setupAuth(app);
  registerAuthRoutes(app);

  // Seed Categories
  await storage.seedCategories();

  // === Categories ===
  app.get(api.categories.list.path, isAuthenticated, async (req, res) => {
    const cats = await storage.getCategories();
    res.json(cats);
  });

  app.post(api.categories.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.categories.create.input.parse(req.body);
      const cat = await storage.createCategory(input);
      res.status(201).json(cat);
    } catch (e) {
      if (e instanceof z.ZodError) res.status(400).json(e.errors);
      else throw e;
    }
  });

  app.put(api.categories.update.path, isAuthenticated, async (req, res) => {
    const input = api.categories.update.input.parse(req.body);
    const cat = await storage.updateCategory(Number(req.params.id), input);
    if (!cat) return res.status(404).send("Not found");
    res.json(cat);
  });

  app.delete(api.categories.delete.path, isAuthenticated, async (req, res) => {
    await storage.deleteCategory(Number(req.params.id));
    res.status(204).send();
  });

  // === Accounts ===
  app.get("/api/accounts", isAuthenticated, async (req, res) => {
    const accs = await storage.getAccounts();
    res.json(accs);
  });

  // === Account Balances (Opening balances per year) ===
  app.get("/api/account-balances/:year", isAuthenticated, async (req, res) => {
    const year = Number(req.params.year);
    const balances = await storage.getAccountBalances(year);
    res.json(balances);
  });

  app.post("/api/account-balances", isAuthenticated, async (req, res) => {
    try {
      const { accountId, year, openingBalance } = req.body;
      if (!accountId || !year || openingBalance === undefined) {
        return res.status(400).json({ message: "accountId, year und openingBalance erforderlich" });
      }
      const balance = await storage.upsertAccountBalance({
        accountId: Number(accountId),
        year: Number(year),
        openingBalance: Number(openingBalance),
      });
      res.status(201).json(balance);
    } catch (e) {
      console.error("Error upserting account balance:", e);
      res.status(500).json({ message: "Fehler beim Speichern des Anfangssaldos" });
    }
  });

  // === Transactions ===
  app.get(api.transactions.list.path, isAuthenticated, async (req, res) => {
    const query = req.query as any;
    const params = {
      year: query.year ? Number(query.year) : undefined,
      categoryId: query.categoryId ? Number(query.categoryId) : undefined,
      accountId: query.accountId ? Number(query.accountId) : undefined,
      account: query.account,
      search: query.search,
      startDate: query.startDate,
      endDate: query.endDate,
      minAmount: query.minAmount ? Number(query.minAmount) : undefined,
      maxAmount: query.maxAmount ? Number(query.maxAmount) : undefined,
    };
    const txs = await storage.getTransactions(params);
    res.json(txs);
  });

  app.post(api.transactions.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.transactions.create.input.parse(req.body);
      
      // Calculate hash for single transaction to prevent duplicates
      const dateStr = new Date(input.date).toISOString().split('T')[0];
      const accountStr = input.account || "Hauptkonto";
      const hash = `${dateStr}_${input.amount}_${input.description}_${accountStr}`;

      const existing = await storage.getTransactions({ search: input.description });
      const duplicate = existing.find(t => t.hash === hash);
      
      if (duplicate) {
        return res.status(409).json({ message: "Transaktion existiert bereits (Duplikat erkannt)" });
      }

      const tx = await storage.createTransaction({ ...input, hash });
      await storage.autoCategorize(tx.id);
      const updatedTx = await storage.getTransaction(tx.id);
      res.status(201).json(updatedTx || tx);
    } catch (e) {
      if (e instanceof z.ZodError) {
        res.status(400).json({
          message: e.errors[0].message,
          field: e.errors[0].path.join('.'),
        });
      } else {
        throw e;
      }
    }
  });

  app.put(api.transactions.update.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.transactions.update.input.parse(req.body);
      const tx = await storage.updateTransaction(Number(req.params.id), input);
      if (!tx) return res.status(404).send("Not found");
      res.json(tx);
    } catch (e) {
      if (e instanceof z.ZodError) {
        res.status(400).json({
          message: e.errors[0].message,
          field: e.errors[0].path.join('.'),
        });
      } else {
        throw e;
      }
    }
  });

  app.delete(api.transactions.delete.path, isAuthenticated, async (req, res) => {
    await storage.deleteTransaction(Number(req.params.id));
    res.status(204).send();
  });

  app.delete("/api/transactions/all", isAuthenticated, async (req, res) => {
    try {
      console.log("DELETE ALL: Request received");
      await storage.deleteAllTransactions();
      console.log("DELETE ALL: Success");
      res.status(200).json({ status: "success", message: "All transactions deleted" });
    } catch (e) {
      console.error("DELETE ALL: Error", e);
      res.status(500).json({ status: "error", message: e instanceof Error ? e.message : "Unknown error" });
    }
  });

  app.post(api.transactions.upload.path, isAuthenticated, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send("No file uploaded");
    
    try {
      const csvContent = req.file.buffer.toString('utf8');
      
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter: ';',
        relax_column_count: true
      });

      if (records.length === 0) return res.json({ imported: 0, duplicates: 0 });

      // Identify IBAN column
      const first = records[0] as Record<string, string>;
      const ibanKey = Object.keys(first).find(k => {
        const norm = k.toLowerCase().replace(/[^a-z]/g, '');
        return norm === 'ibanauftragskonto' || norm === 'auftragskonto' || norm === 'iban';
      });

      if (!ibanKey) {
        return res.status(400).json({ message: "Keine IBAN-Spalte (Auftragskonto) in der CSV gefunden." });
      }

      const iban = first[ibanKey];
      const account = await storage.getOrCreateAccount(iban);

      const toImport: InsertTransaction[] = records.map((r: any) => {
        const dateStr = r['Buchungstag'] || r['Valutadatum'] || r.Date || r.Datum || r.date;
        const amountStr = r['Betrag'] || r.Amount || r.Betrag || r.amount;
        const descStr = r['Verwendungszweck'] || r['Buchungstext'] || r.Description || r.description || r.Text;
        
        if (!dateStr || !amountStr) return null;

        let date: Date;
        if (typeof dateStr === 'string' && dateStr.includes('.')) {
          const [day, month, year] = dateStr.split('.');
          date = new Date(`${year}-${month}-${day}`);
        } else {
          date = new Date(dateStr);
        }

        let amount = 0;
        if (typeof amountStr === 'string') {
          amount = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'));
        } else {
          amount = Number(amountStr);
        }

        return {
          date: date,
          amount: amount,
          description: String(descStr || "No description"),
          accountId: account.id,
          account: account.name, // Legacy support
          hash: "",
          recurring: false
        } as InsertTransaction;
      }).filter((r): r is InsertTransaction => r !== null && !isNaN(r.amount));

      const result = await storage.createTransactionsBulk(toImport);
      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(400).json({ message: "Failed to parse CSV" });
    }
  });

  app.get("/api/migration/backfill", isAuthenticated, async (req, res) => {
    const txs = await storage.getTransactions();
    let migratedCount = 0;
    
    // Create default account if needed
    const defaultAccount = await storage.getOrCreateAccount("LEGACY", "Altkonto / Unassigned");

    for (const tx of txs) {
      if (!tx.accountId) {
        await storage.updateTransaction(tx.id, { accountId: defaultAccount.id });
        migratedCount++;
      }
    }
    res.json({ migratedCount });
  });
  app.get(api.dashboard.stats.path, isAuthenticated, async (req, res) => {
    const year = Number(req.query.year) || 2024;
    const account = req.query.account as string | undefined;
    const stats = await storage.getTotalStats(year, account);
    
    // Get opening balance from account_balances table
    let openingBalance = 0;
    
    // If filtering by account name, find the accountId first
    let accountIdFilter: number | undefined;
    if (account && account !== "all") {
      const accounts = await storage.getAccounts();
      const matchedAccount = accounts.find(a => a.name === account || a.iban === account);
      if (matchedAccount) {
        accountIdFilter = matchedAccount.id;
      }
    }
    
    const balances = await storage.getAccountBalances(year, accountIdFilter);
    if (balances.length > 0) {
      openingBalance = balances.reduce((sum, b) => sum + (b.openingBalance || 0), 0);
    }
    
    // Cash flow = income - expenses (net movement for the year)
    const cashFlow = stats.income - stats.expenses;
    
    // Cash position = opening balance + all transactions (income + negative expenses)
    const cashPosition = openingBalance + cashFlow;
    
    res.json({
      openingBalance,
      cashPosition,
      totalIncome: stats.income,
      totalExpenses: stats.expenses,
      cashFlow
    });
  });

  app.get(api.dashboard.charts.path, isAuthenticated, async (req, res) => {
    const year = Number(req.query.year) || 2024;
    const account = req.query.account as string | undefined;
    const monthly = await storage.getMonthlyStats(year, account);
    const cats = await storage.getCategoryStats(year, account);
    const balance = await storage.getBalanceHistory(year, account);

    res.json({
      incomeVsExpenses: monthly,
      categoryDistribution: cats,
      balanceOverTime: balance
    });
  });

  app.post(api.transactions.autoCategorize.path, isAuthenticated, async (req, res) => {
    const txs = await storage.getTransactions();
    const uncategorized = txs.filter(t => !t.categoryId);
    let updatedCount = 0;
    
    for (const tx of uncategorized) {
      const updated = await storage.autoCategorize(tx.id);
      if (updated && updated.categoryId) {
        updatedCount++;
      }
    }
    
    res.json({ updatedCount });
  });

  // EÜR Reports (PDF-based, manual entry)
  app.get("/api/euer-reports", isAuthenticated, async (req, res) => {
    const reports = await storage.getEuerReports();
    res.json(reports);
  });

  app.get("/api/euer-reports/:year", isAuthenticated, async (req, res) => {
    const year = Number(req.params.year);
    const report = await storage.getEuerReport(year);
    if (!report) return res.status(404).json({ message: "Kein Bericht für dieses Jahr" });
    res.json(report);
  });

  app.put("/api/euer-reports/:year", isAuthenticated, async (req, res) => {
    try {
      const year = Number(req.params.year);
      if (isNaN(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ message: "Ungültiges Jahr" });
      }
      
      // Validate numeric fields
      const parseNum = (v: any): number => {
        const n = parseFloat(v);
        return isNaN(n) ? 0 : n;
      };
      
      // Get uploadedBy from authenticated session
      const user = req.user as any;
      const uploadedBy = user?.claims?.email || user?.claims?.sub || 'unknown';
      
      const data = {
        year,
        sourceFileName: String(req.body.sourceFileName || ''),
        uploadedBy,
        ideellIncome: parseNum(req.body.ideellIncome),
        ideellExpenses: parseNum(req.body.ideellExpenses),
        vermoegenIncome: parseNum(req.body.vermoegenIncome),
        vermoegenExpenses: parseNum(req.body.vermoegenExpenses),
        zweckbetriebIncome: parseNum(req.body.zweckbetriebIncome),
        zweckbetriebExpenses: parseNum(req.body.zweckbetriebExpenses),
        wirtschaftlichIncome: parseNum(req.body.wirtschaftlichIncome),
        wirtschaftlichExpenses: parseNum(req.body.wirtschaftlichExpenses),
      };
      const report = await storage.upsertEuerReport(data);
      res.json(report);
    } catch (e) {
      console.error("Error saving EÜR report:", e);
      res.status(400).json({ message: "Fehler beim Speichern" });
    }
  });

  app.delete("/api/euer-reports/:year", isAuthenticated, async (req, res) => {
    await storage.deleteEuerReport(Number(req.params.year));
    res.status(204).send();
  });

  // PDF Upload for EÜR reports
  app.post("/api/euer-reports/:year/upload-pdf", isAuthenticated, pdfUpload.single('pdf'), async (req, res) => {
    try {
      const year = Number(req.params.year);
      if (isNaN(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ message: "Ungültiges Jahr" });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: "Keine PDF-Datei hochgeladen" });
      }
      
      const user = req.user as any;
      const uploadedBy = user?.claims?.email || user?.claims?.sub || 'unknown';
      
      // Check if report already exists
      const existingReport = await storage.getEuerReport(year);
      
      if (existingReport) {
        // Update existing report with new file info
        const updated = await storage.upsertEuerReport({
          ...existingReport,
          year,
          sourceFileName: req.file.originalname,
          pdfFilePath: req.file.path,
          uploadedBy,
        });
        res.json({ 
          message: "PDF hochgeladen und Bericht aktualisiert", 
          report: updated,
          fileName: req.file.originalname 
        });
      } else {
        // Create new report entry with PDF
        const report = await storage.upsertEuerReport({
          year,
          sourceFileName: req.file.originalname,
          pdfFilePath: req.file.path,
          uploadedBy,
          ideellIncome: 0,
          ideellExpenses: 0,
          vermoegenIncome: 0,
          vermoegenExpenses: 0,
          zweckbetriebIncome: 0,
          zweckbetriebExpenses: 0,
          wirtschaftlichIncome: 0,
          wirtschaftlichExpenses: 0,
        });
        res.json({ 
          message: "PDF hochgeladen. Bitte die Werte jetzt manuell eintragen.", 
          report,
          fileName: req.file.originalname 
        });
      }
    } catch (e) {
      console.error("Error uploading PDF:", e);
      res.status(500).json({ message: "Fehler beim Hochladen" });
    }
  });

  // Serve uploaded PDFs
  app.get("/api/euer-reports/:year/pdf", isAuthenticated, async (req, res) => {
    const year = Number(req.params.year);
    const report = await storage.getEuerReport(year);
    
    if (!report || !report.pdfFilePath) {
      return res.status(404).json({ message: "Keine PDF-Datei vorhanden" });
    }
    
    if (!fs.existsSync(report.pdfFilePath)) {
      return res.status(404).json({ message: "PDF-Datei nicht gefunden" });
    }
    
    res.sendFile(report.pdfFilePath);
  });

  // EÜR Line Items
  const validFiscalAreas = ['ideell', 'vermoegensverwaltung', 'zweckbetrieb', 'wirtschaftlich'];
  
  app.get("/api/euer-reports/:year/items", isAuthenticated, async (req, res) => {
    const year = Number(req.params.year);
    const fiscalArea = req.query.fiscalArea as string | undefined;
    const report = await storage.getEuerReport(year);
    if (!report) return res.json([]);
    
    if (fiscalArea) {
      if (!validFiscalAreas.includes(fiscalArea)) {
        return res.status(400).json({ message: "Ungültiger Tätigkeitsbereich" });
      }
      const items = await storage.getEuerLineItemsByArea(report.id, fiscalArea as "ideell" | "vermoegensverwaltung" | "zweckbetrieb" | "wirtschaftlich");
      res.json(items);
    } else {
      const items = await storage.getEuerLineItems(report.id);
      res.json(items);
    }
  });

  app.put("/api/euer-reports/:year/items", isAuthenticated, async (req, res) => {
    const year = Number(req.params.year);
    const report = await storage.getEuerReport(year);
    if (!report) return res.status(404).json({ message: "Report nicht gefunden" });
    
    const items = req.body.items || [];
    const saved = await storage.upsertEuerLineItems(report.id, items);
    res.json(saved);
  });

  // EÜR endpoint - PDF-based with transaction fallback
  app.get("/api/report/euer", isAuthenticated, async (req, res) => {
    const year = Number(req.query.year) || 2024;
    const pdfReport = await storage.getEuerReport(year);
    
    if (pdfReport) {
      // Return PDF-based data in FiscalAreaReport format
      res.json({
        year,
        source: 'pdf',
        sourceFileName: pdfReport.sourceFileName,
        uploadedAt: pdfReport.uploadedAt,
        areas: [
          { name: 'ideell', label: 'A. Ideeller Tätigkeitsbereich', income: pdfReport.ideellIncome || 0, expenses: pdfReport.ideellExpenses || 0, net: (pdfReport.ideellIncome || 0) - (pdfReport.ideellExpenses || 0) },
          { name: 'vermoegensverwaltung', label: 'B. Vermögensverwaltung', income: pdfReport.vermoegenIncome || 0, expenses: pdfReport.vermoegenExpenses || 0, net: (pdfReport.vermoegenIncome || 0) - (pdfReport.vermoegenExpenses || 0) },
          { name: 'zweckbetrieb', label: 'C. Zweckbetriebe', income: pdfReport.zweckbetriebIncome || 0, expenses: pdfReport.zweckbetriebExpenses || 0, net: (pdfReport.zweckbetriebIncome || 0) - (pdfReport.zweckbetriebExpenses || 0) },
          { name: 'wirtschaftlich', label: 'D. Wirtschaftlicher Geschäftsbetrieb', income: pdfReport.wirtschaftlichIncome || 0, expenses: pdfReport.wirtschaftlichExpenses || 0, net: (pdfReport.wirtschaftlichIncome || 0) - (pdfReport.wirtschaftlichExpenses || 0) },
        ],
        totalIncome: (pdfReport.ideellIncome || 0) + (pdfReport.vermoegenIncome || 0) + (pdfReport.zweckbetriebIncome || 0) + (pdfReport.wirtschaftlichIncome || 0),
        totalExpenses: (pdfReport.ideellExpenses || 0) + (pdfReport.vermoegenExpenses || 0) + (pdfReport.zweckbetriebExpenses || 0) + (pdfReport.wirtschaftlichExpenses || 0),
        totalNet: 0,
      });
    } else {
      // Fallback to transaction-calculated data
      const fiscalSummary = await storage.getFiscalAreaStats(year);
      res.json({
        ...fiscalSummary,
        source: 'transactions',
      });
    }
  });

  app.get(api.dashboard.forecast.path, isAuthenticated, async (req, res) => {
    // Simple linear projection based on average monthly net change
    // Or just project recurring transactions?
    // PRD says: "Calculate average monthly income and expenses... Extrapolate... Include recurring transactions explicitly"
    
    const year = new Date().getFullYear();
    const monthly = await storage.getMonthlyStats(year);
    const currentMonth = new Date().getMonth(); // 0-11
    
    // Calculate averages (excluding current partial month ideally, but let's include all for simplicity)
    const completedMonths = monthly.length;
    const avgIncome = completedMonths > 0 ? monthly.reduce((sum, m) => sum + m.income, 0) / completedMonths : 0;
    const avgExpenses = completedMonths > 0 ? monthly.reduce((sum, m) => sum + m.expenses, 0) / completedMonths : 0;
    const avgNet = avgIncome - avgExpenses;

    const history = await storage.getBalanceHistory(year);
    const currentBalance = history.length > 0 ? history[history.length - 1].balance : 0;

    const monthsRemaining = 12 - (currentMonth + 1);
    const projectedEnd = currentBalance + (avgNet * monthsRemaining);

    // Generate forecast data points
    const forecastData = [];
    let runningBalance = currentBalance;
    for (let i = 1; i <= monthsRemaining; i++) {
        runningBalance += avgNet;
        const d = new Date();
        d.setMonth(currentMonth + i);
        forecastData.push({
            date: d.toISOString().split('T')[0],
            balance: runningBalance,
            isProjected: true
        });
    }

    res.json({
      projectedYearEndBalance: projectedEnd,
      warning: projectedEnd < 0 ? "Warning: Projected balance is negative!" : undefined,
      data: forecastData
    });
  });

  // === Events / Veranstaltungen ===
  app.get("/api/events", isAuthenticated, async (req, res) => {
    const events = await storage.getEvents();
    res.json(events);
  });

  app.get("/api/events/:id", isAuthenticated, async (req, res) => {
    const id = Number(req.params.id);
    const event = await storage.getEvent(id);
    if (!event) {
      return res.status(404).json({ message: "Veranstaltung nicht gefunden" });
    }
    res.json(event);
  });

  app.post("/api/events", isAuthenticated, async (req, res) => {
    const eventData = {
      ...req.body,
      date: new Date(req.body.date),
    };
    const event = await storage.createEvent(eventData);
    res.status(201).json(event);
  });

  app.patch("/api/events/:id", isAuthenticated, async (req, res) => {
    const id = Number(req.params.id);
    const updates = { ...req.body };
    if (updates.date) {
      updates.date = new Date(updates.date);
    }
    const event = await storage.updateEvent(id, updates);
    res.json(event);
  });

  app.delete("/api/events/:id", isAuthenticated, async (req, res) => {
    const id = Number(req.params.id);
    await storage.deleteEvent(id);
    res.status(204).send();
  });

  // Event Entries
  app.get("/api/events/:eventId/entries", isAuthenticated, async (req, res) => {
    const eventId = Number(req.params.eventId);
    const entries = await storage.getEventEntries(eventId);
    res.json(entries);
  });

  app.post("/api/events/:eventId/entries", isAuthenticated, async (req, res) => {
    const eventId = Number(req.params.eventId);
    const entryData = {
      ...req.body,
      eventId,
      date: new Date(req.body.date),
    };
    const entry = await storage.createEventEntry(entryData);
    res.status(201).json(entry);
  });

  app.patch("/api/event-entries/:id", isAuthenticated, async (req, res) => {
    const id = Number(req.params.id);
    const updates = { ...req.body };
    if (updates.date) {
      updates.date = new Date(updates.date);
    }
    const entry = await storage.updateEventEntry(id, updates);
    res.json(entry);
  });

  app.delete("/api/event-entries/:id", isAuthenticated, async (req, res) => {
    const id = Number(req.params.id);
    await storage.deleteEventEntry(id);
    res.status(204).send();
  });

  // === Contracts (Verträge) ===
  app.get("/api/contracts", isAuthenticated, async (req, res) => {
    const includeInactive = req.query.includeInactive === "true";
    const contracts = await storage.getContracts(includeInactive);
    res.json(contracts);
  });

  // Contract Suggestions routes MUST come before /:id routes to avoid routing conflict
  app.get("/api/contracts/suggestions", isAuthenticated, async (req, res) => {
    const status = req.query.status as "pending" | "accepted" | "dismissed" | undefined;
    const suggestions = await storage.getContractSuggestions(status);
    res.json(suggestions);
  });

  app.post("/api/contracts/suggestions/run", isAuthenticated, async (req, res) => {
    try {
      const { analyzeRecurringTransactions } = await import("./contractAnalyzer");
      await analyzeRecurringTransactions();
      const suggestions = await storage.getContractSuggestions("pending");
      res.json({ count: suggestions.length, suggestions });
    } catch (error) {
      console.error("Error analyzing contracts:", error);
      res.status(500).json({ error: "Fehler bei der Analyse" });
    }
  });

  app.post("/api/contracts/suggestions/:id/accept", isAuthenticated, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const contract = await storage.acceptSuggestion(id);
      res.status(201).json(contract);
    } catch (error) {
      res.status(400).json({ error: "Vorschlag konnte nicht übernommen werden" });
    }
  });

  app.post("/api/contracts/suggestions/:id/dismiss", isAuthenticated, async (req, res) => {
    const id = Number(req.params.id);
    await storage.updateContractSuggestionStatus(id, "dismissed");
    res.status(204).send();
  });

  app.get("/api/contracts/:id", isAuthenticated, async (req, res) => {
    const id = Number(req.params.id);
    const contract = await storage.getContract(id);
    if (!contract) {
      return res.status(404).json({ error: "Vertrag nicht gefunden" });
    }
    res.json(contract);
  });

  app.post("/api/contracts", isAuthenticated, async (req, res) => {
    try {
      const contractData = insertContractSchema.parse(req.body);
      const contract = await storage.createContract(contractData);
      res.status(201).json(contract);
    } catch (error) {
      res.status(400).json({ error: "Ungültige Vertragsdaten" });
    }
  });

  app.patch("/api/contracts/:id", isAuthenticated, async (req, res) => {
    const id = Number(req.params.id);
    const updates = { ...req.body };
    if (updates.startDate) updates.startDate = new Date(updates.startDate);
    if (updates.endDate) updates.endDate = new Date(updates.endDate);
    if (updates.nextDueDate) updates.nextDueDate = new Date(updates.nextDueDate);
    const contract = await storage.updateContract(id, updates);
    res.json(contract);
  });

  app.delete("/api/contracts/:id", isAuthenticated, async (req, res) => {
    const id = Number(req.params.id);
    await storage.deleteContract(id);
    res.status(204).send();
  });

  // === AI Assistant ===
  app.post("/api/assistant", isAuthenticated, async (req, res) => {
    let aborted = false;
    
    req.on("close", () => {
      aborted = true;
    });
    
    try {
      const { message, year, account } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "Nachricht erforderlich" });
      }
      
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();
      
      const stream = await processAssistantQuery({
        message,
        year: year || 2024,
        account: account || undefined,
      });
      
      for await (const chunk of stream) {
        if (aborted) break;
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      }
      
      if (!aborted) {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      }
      res.end();
    } catch (error) {
      console.error("Assistant error:", error);
      if (res.headersSent) {
        if (!aborted) {
          res.write(`data: ${JSON.stringify({ error: "Ein Fehler ist aufgetreten" })}\n\n`);
        }
        res.end();
      } else {
        res.status(500).json({ error: "Ein Fehler ist aufgetreten" });
      }
    }
  });

  return httpServer;
}
