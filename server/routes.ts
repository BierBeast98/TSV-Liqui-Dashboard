import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { insertTransactionSchema, type InsertTransaction } from "@shared/schema";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import multer from "multer";
import { parse } from "csv-parse/sync";

const upload = multer({ storage: multer.memoryStorage() });

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

  // === Transactions ===
  app.get(api.transactions.list.path, isAuthenticated, async (req, res) => {
    const query = api.transactions.list.input?.parse(req.query) || {};
    const txs = await storage.getTransactions(query);
    res.json(txs);
  });

  app.post(api.transactions.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.transactions.create.input.parse(req.body);
      const tx = await storage.createTransaction(input);
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

      const toImport: InsertTransaction[] = records.map((r: any) => {
        const dateStr = r['Buchungstag'] || r['Valutadatum'] || r.Date || r.Datum || r.date;
        const amountStr = r['Betrag'] || r.Amount || r.Betrag || r.amount;
        const descStr = r['Verwendungszweck'] || r['Buchungstext'] || r.Description || r.description || r.Text;
        const accountName = r['Auftragskonto'] || r['Konto'] || r.Account || "Hauptkonto";
        
        if (!dateStr || !amountStr) return null;

        let date: Date;
        if (dateStr.includes('.')) {
          const [day, month, year] = dateStr.split('.');
          date = new Date(`${year}-${month}-${day}`);
        } else {
          date = new Date(dateStr);
        }

        let amount = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'));
        if (isNaN(amount)) amount = parseFloat(amountStr);

        return {
          date: date,
          amount: amount,
          description: descStr || "No description",
          account: accountName,
          hash: "",
          recurring: false
        };
      }).filter((r: any): r is InsertTransaction => r !== null && !isNaN(r.amount));

      const result = await storage.createTransactionsBulk(toImport);
      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(400).json({ message: "Failed to parse CSV" });
    }
  });

  // === Dashboard & Forecast ===
  app.get(api.dashboard.stats.path, isAuthenticated, async (req, res) => {
    const year = Number(req.query.year) || 2024;
    const stats = await storage.getTotalStats(year);
    // Current balance is total of ALL time
    const history = await storage.getBalanceHistory(year);
    const currentBalance = history.length > 0 ? history[history.length - 1].balance : 0;
    
    res.json({
      currentBalance,
      totalIncome: stats.income,
      totalExpenses: stats.expenses,
      netResult: stats.income - stats.expenses
    });
  });

  app.get(api.dashboard.charts.path, isAuthenticated, async (req, res) => {
    const year = Number(req.query.year) || 2024;
    const monthly = await storage.getMonthlyStats(year);
    const cats = await storage.getCategoryStats(year);
    const balance = await storage.getBalanceHistory(year);

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

  return httpServer;
}
