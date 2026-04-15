import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { insertTransactionSchema, insertContractSchema, type InsertTransaction } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import { parse } from "csv-parse/sync";
import path from "path";
import fs from "fs";
import iconv from "iconv-lite";
import { processAssistantQuery } from "./assistant";
import { parsePdf, parseSummenSaldenPdf, parseKontoauszugPdf } from "./pdfParser";

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

// Multer für Summen-/Saldenliste PDFs
const sumSalStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'summen-salden');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const year = req.params.year || 'unknown';
    cb(null, `sumsaldo_${year}_${Date.now()}.pdf`);
  }
});
const sumSalUpload = multer({
  storage: sumSalStorage,
  fileFilter: (req, file, cb) => {
    file.mimetype === 'application/pdf' ? cb(null, true) : cb(new Error('Nur PDF-Dateien erlaubt'));
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Seed Categories
  await storage.seedCategories();

  // === Categories ===
  app.get(api.categories.list.path, async (req, res) => {
    const cats = await storage.getCategories();
    res.json(cats);
  });

  app.post(api.categories.create.path, async (req, res) => {
    try {
      const input = api.categories.create.input.parse(req.body);
      const cat = await storage.createCategory(input);
      res.status(201).json(cat);
    } catch (e) {
      if (e instanceof z.ZodError) res.status(400).json(e.errors);
      else throw e;
    }
  });

  app.put(api.categories.update.path, async (req, res) => {
    const input = api.categories.update.input.parse(req.body);
    const cat = await storage.updateCategory(Number(req.params.id), input);
    if (!cat) return res.status(404).send("Not found");
    res.json(cat);
  });

  app.delete(api.categories.delete.path, async (req, res) => {
    await storage.deleteCategory(Number(req.params.id));
    res.status(204).send();
  });

  // === Accounts ===
  app.get("/api/accounts", async (req, res) => {
    const accs = await storage.getAccounts();
    res.json(accs);
  });

  app.post("/api/accounts/import-from-summen-salden", async (req, res) => {
    try {
      const { year } = req.body;
      if (!year) return res.status(400).json({ message: "year erforderlich" });
      const result = await storage.importAccountsFromSummenSalden(Number(year));
      res.json(result);
    } catch (e) {
      console.error("Error importing accounts:", e);
      res.status(500).json({ message: "Fehler beim Importieren" });
    }
  });

  app.patch("/api/accounts/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { datevKonto, iban } = req.body;
      const patch: { datevKonto?: string | null; iban?: string } = {};
      if (datevKonto !== undefined) patch.datevKonto = datevKonto || null;
      if (iban) patch.iban = iban.replace(/\s/g, '');
      const account = await storage.updateAccount(id, patch);
      res.json(account);
    } catch (e) {
      console.error("Error updating account:", e);
      res.status(500).json({ message: "Fehler beim Aktualisieren des Kontos" });
    }
  });

  app.patch("/api/accounts/:id/rename", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { name } = req.body;
      if (!name?.trim()) return res.status(400).json({ message: "Name darf nicht leer sein" });
      const account = await storage.renameAccount(id, name.trim());
      res.json(account);
    } catch (e) {
      console.error("Error renaming account:", e);
      res.status(500).json({ message: "Fehler beim Umbenennen" });
    }
  });

  app.post("/api/accounts/:sourceId/merge", async (req, res) => {
    try {
      const sourceId = Number(req.params.sourceId);
      const { targetId } = req.body;
      if (!targetId) return res.status(400).json({ message: "targetId erforderlich" });
      if (sourceId === Number(targetId)) return res.status(400).json({ message: "Quelle und Ziel dürfen nicht gleich sein" });
      await storage.mergeAccount(sourceId, Number(targetId));
      res.json({ message: "Konten zusammengeführt" });
    } catch (e) {
      console.error("Error merging accounts:", e);
      res.status(500).json({ message: "Fehler beim Zusammenführen" });
    }
  });

  app.delete("/api/accounts/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteAccount(id);
      res.status(204).send();
    } catch (e: any) {
      const msg = e?.message || "Fehler beim Löschen";
      res.status(400).json({ message: msg });
    }
  });

  // === Account Balances (Opening balances per year) ===
  app.get("/api/account-balances/:year", async (req, res) => {
    const year = Number(req.params.year);
    const balances = await storage.getAccountBalances(year);
    res.json(balances);
  });

  app.post("/api/account-balances", async (req, res) => {
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

  app.post("/api/account-balances/sync-from-summen-salden", async (req, res) => {
    try {
      const { sourceYear, targetYear, previewOnly } = req.body;
      if (!sourceYear || !targetYear) {
        return res.status(400).json({ message: "sourceYear und targetYear erforderlich" });
      }
      const result = await storage.syncFromSummenSalden(Number(sourceYear), Number(targetYear), !!previewOnly);
      res.json(result);
    } catch (e) {
      console.error("Error syncing from Summen-/Saldenliste:", e);
      res.status(500).json({ message: "Fehler bei der Synchronisierung" });
    }
  });

  // === Transactions ===
  app.get(api.transactions.list.path, async (req, res) => {
    const query = req.query as any;
    
    // Parse comma-separated values for multi-select filters
    const parseIds = (value: string | undefined): number[] | undefined => {
      if (!value) return undefined;
      const ids = value.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      return ids.length > 0 ? ids : undefined;
    };
    
    const params = {
      year: query.year ? Number(query.year) : undefined,
      years: parseIds(query.years),  // Multiple years: "2024,2025"
      categoryId: query.categoryId ? Number(query.categoryId) : undefined,
      categoryIds: parseIds(query.categoryIds),  // Multiple categories: "1,2,3"
      accountId: query.accountId ? Number(query.accountId) : undefined,
      accountIds: parseIds(query.accountIds),  // Multiple accounts: "1,2"
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

  app.get("/api/transactions/by-ids", async (req, res) => {
    const ids = req.query.ids;
    if (!ids || typeof ids !== "string") {
      return res.status(400).json({ message: "ids parameter required" });
    }
    const idList = ids.split(",").map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    const txs = await storage.getTransactionsByIds(idList);
    res.json(txs);
  });

  app.post(api.transactions.create.path, async (req, res) => {
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

  app.put(api.transactions.update.path, async (req, res) => {
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

  app.delete(api.transactions.delete.path, async (req, res) => {
    await storage.deleteTransaction(Number(req.params.id));
    res.status(204).send();
  });

  // PATCH single transaction (partial update, e.g. contractId)
  app.patch("/api/transactions/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const updates = req.body;
      const tx = await storage.updateTransaction(id, updates);
      if (!tx) return res.status(404).send("Not found");
      res.json(tx);
    } catch (e) {
      console.error("PATCH transaction error:", e);
      res.status(500).json({ message: e instanceof Error ? e.message : "Update failed" });
    }
  });

  app.delete("/api/transactions/all", async (req, res) => {
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

  // Bulk update transactions (category, etc.)
  const bulkUpdateSchema = z.object({
    ids: z.array(z.number().int().positive()).min(1, "Keine Buchungen ausgewählt"),
    updates: z.object({
      categoryId: z.number().int().nullable().optional(),
    }).refine(obj => Object.keys(obj).length > 0, "Keine Änderungen angegeben")
  });

  app.patch("/api/transactions/bulk", async (req, res) => {
    try {
      const parsed = bulkUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }
      const { ids, updates } = parsed.data;
      
      const updatedCount = await storage.bulkUpdateTransactions(ids, updates);
      res.json({ updatedCount });
    } catch (e) {
      console.error("Bulk update error:", e);
      res.status(500).json({ message: e instanceof Error ? e.message : "Fehler bei Sammelbearbeitung" });
    }
  });

  app.post("/api/transactions/bulk-delete", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Keine Buchungen ausgewählt" });
      }
      let deleted = 0;
      for (const id of ids) {
        await storage.deleteTransaction(Number(id));
        deleted++;
      }
      res.json({ deleted });
    } catch (e) {
      console.error("Bulk delete error:", e);
      res.status(500).json({ message: e instanceof Error ? e.message : "Fehler beim Löschen" });
    }
  });

  // Find related transactions by counterparty for contract creation
  app.get("/api/transactions/:id/related", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Ungültige Buchungs-ID" });
      }

      const tx = await storage.getTransaction(id);
      if (!tx) {
        return res.status(404).json({ message: "Buchung nicht gefunden" });
      }

      if (!tx.counterparty || !tx.counterparty.trim()) {
        return res.json({
          transaction: tx,
          relatedTransactions: [],
          detectedFrequency: null,
          intervals: []
        });
      }

      const related = await storage.getTransactionsByCounterparty(tx.counterparty);
      
      // Sort by date ascending for interval calculation AND for response
      const sortedRelated = [...related].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      
      const intervals: { from: string; to: string; days: number }[] = [];
      for (let i = 1; i < sortedRelated.length; i++) {
        const fromDate = new Date(sortedRelated[i - 1].date);
        const toDate = new Date(sortedRelated[i].date);
        const days = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
        intervals.push({
          from: fromDate.toISOString().split('T')[0],
          to: toDate.toISOString().split('T')[0],
          days
        });
      }

      // Detect frequency based on intervals
      let detectedFrequency: "monthly" | "quarterly" | "yearly" | null = null;
      if (intervals.length > 0) {
        const medianDays = intervals
          .map(i => i.days)
          .sort((a, b) => a - b)[Math.floor(intervals.length / 2)];
        
        if (medianDays >= 26 && medianDays <= 35 && intervals.length >= 3) {
          detectedFrequency = "monthly";
        } else if (medianDays >= 80 && medianDays <= 110 && intervals.length >= 2) {
          detectedFrequency = "quarterly";
        } else if (medianDays >= 330 && medianDays <= 400 && intervals.length >= 1) {
          detectedFrequency = "yearly";
        }
      }

      // Return sorted list so intervals align with displayed transactions
      res.json({
        transaction: tx,
        relatedTransactions: sortedRelated,
        detectedFrequency,
        intervals
      });
    } catch (e) {
      console.error("Related transactions error:", e);
      res.status(500).json({ message: e instanceof Error ? e.message : "Fehler beim Laden" });
    }
  });

  app.post(api.transactions.upload.path, upload.array('files', 20), async (req, res) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).send("No files uploaded");
    
    try {
      let totalImported = 0;
      let totalDuplicates = 0;
      const fileResults: { name: string; imported: number; duplicates: number }[] = [];

      for (const file of files) {
        const ext = path.extname(file.originalname).toLowerCase();

        // --- PDF Kontoauszug Branch ---
        if (ext === '.pdf') {
          try {
            const pdfResult = await parseKontoauszugPdf(file.buffer);
            if (!pdfResult.success || pdfResult.transactions.length === 0) {
              fileResults.push({ name: file.originalname, imported: 0, duplicates: 0 });
              continue;
            }

            const account = await storage.getOrCreateAccount(pdfResult.iban);
            const toImport: InsertTransaction[] = pdfResult.transactions.map(t => ({
              date: new Date(t.date),
              amount: t.amount,
              description: t.description || 'Keine Beschreibung',
              counterparty: t.counterparty || undefined,
              accountId: account.id,
              account: account.name,
              hash: '',
              recurring: false,
            })).filter(t => !isNaN(t.date.getTime()) && !isNaN(t.amount));

            const result = await storage.createTransactionsBulk(toImport);
            totalImported += result.imported;
            totalDuplicates += result.duplicates;
            fileResults.push({ name: file.originalname, imported: result.imported, duplicates: result.duplicates });
          } catch (pdfErr) {
            console.error(`PDF parse error for ${file.originalname}:`, pdfErr);
            fileResults.push({ name: file.originalname, imported: 0, duplicates: 0 });
          }
          continue;
        }

        // --- CSV Branch (existing logic) ---
        // Try to decode with different encodings (German banks often use Windows-1252)
        let csvContent: string;

        // Check for BOM to detect UTF-8
        const bom = file.buffer.slice(0, 3);
        if (bom[0] === 0xEF && bom[1] === 0xBB && bom[2] === 0xBF) {
          // UTF-8 with BOM
          csvContent = file.buffer.toString('utf8');
        } else {
          // Try UTF-8 first, fallback to Windows-1252 if there are encoding issues
          const utf8Content = file.buffer.toString('utf8');
          // Check for replacement characters that indicate encoding issues
          if (utf8Content.includes('�') || utf8Content.includes('\ufffd')) {
            // Use Windows-1252 (common for German bank exports)
            csvContent = iconv.decode(file.buffer, 'win1252');
          } else {
            csvContent = utf8Content;
          }
        }

        const records = parse(csvContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          delimiter: ';',
          relax_column_count: true,
          bom: true  // Handle BOM (Byte Order Mark) from Excel exports
        });

        if (records.length === 0) {
          fileResults.push({ name: file.originalname, imported: 0, duplicates: 0 });
          continue;
        }

        // Identify IBAN column
        const first = records[0] as Record<string, string>;
        const ibanKey = Object.keys(first).find(k => {
          const norm = k.toLowerCase().replace(/[^a-z]/g, '');
          return norm === 'ibanauftragskonto' || norm === 'auftragskonto' || norm === 'iban';
        });

        if (!ibanKey) {
          fileResults.push({ name: file.originalname, imported: 0, duplicates: 0 });
          continue;
        }

        const iban = first[ibanKey];
        const account = await storage.getOrCreateAccount(iban);

        const toImport: InsertTransaction[] = records.map((r: any) => {
          const dateStr = r['Buchungstag'] || r['Valutadatum'] || r.Date || r.Datum || r.date;
          const amountStr = r['Betrag'] || r.Amount || r.Betrag || r.amount;

          // Build description from multiple possible fields
          const verwendungszweck = r['Verwendungszweck'] || '';
          const buchungstext = r['Buchungstext'] || '';
          // For Sparkasse format: combine Buchungstext + Verwendungszweck if both exist
          // For VR/other formats: use Verwendungszweck or Buchungstext
          let descStr = '';
          if (verwendungszweck && buchungstext) {
            // Sparkasse format: Buchungstext is type (e.g. ZINSEN), Verwendungszweck is purpose
            descStr = verwendungszweck.trim() ? `${buchungstext}: ${verwendungszweck}` : buchungstext;
          } else {
            descStr = verwendungszweck || buchungstext || r.Description || r.description || r.Text || '';
          }

          // Counterparty: Support multiple column names from different bank formats
          const counterpartyStr =
            r['Name Zahlungsbeteiligter'] ||
            r['Zahlungsbeteiligter'] ||
            r['Beguenstigter/Zahlungspflichtiger'] ||  // Sparkasse format
            r['Begünstigter/Zahlungspflichtiger'] ||   // With umlaut
            r['Empfänger'] ||
            r['Auftraggeber'] ||
            '';

          if (!dateStr || !amountStr) return null;

          let date: Date;
          if (typeof dateStr === 'string' && dateStr.includes('.')) {
            const parts = dateStr.split('.');
            let [day, month, year] = parts;
            // Handle 2-digit year (Sparkasse format: DD.MM.YY)
            if (year && year.length === 2) {
              const yearNum = parseInt(year);
              year = yearNum >= 70 ? `19${year}` : `20${year}`;
            }
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

          const counterparty = counterpartyStr ? String(counterpartyStr).trim() : null;

          return {
            date: date,
            amount: amount,
            description: String(descStr || "No description"),
            counterparty: counterparty || undefined,
            accountId: account.id,
            account: account.name,
            hash: "",
            recurring: false
          } as InsertTransaction;
        }).filter((r): r is InsertTransaction => r !== null && !isNaN(r.amount));

        const result = await storage.createTransactionsBulk(toImport);
        totalImported += result.imported;
        totalDuplicates += result.duplicates;
        fileResults.push({ name: file.originalname, imported: result.imported, duplicates: result.duplicates });
      }

      res.json({ imported: totalImported, duplicates: totalDuplicates, files: fileResults });
    } catch (e) {
      console.error(e);
      res.status(400).json({ message: "Failed to parse file" });
    }
  });

  app.get("/api/migration/backfill", async (req, res) => {
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
  
  app.get("/api/migration/backfill-counterparty", async (req, res) => {
    const txs = await storage.getTransactions();
    let updatedCount = 0;
    
    for (const tx of txs) {
      if (!tx.counterparty) {
        const bnamMatch = tx.description.match(/BNAM:\s*([^,]+)/i);
        if (bnamMatch) {
          await storage.updateTransaction(tx.id, { counterparty: bnamMatch[1].trim() });
          updatedCount++;
        }
      }
    }
    res.json({ updatedCount, message: `${updatedCount} Transaktionen mit Zahlungsbeteiligtem aktualisiert` });
  });
  app.get(api.dashboard.stats.path, async (req, res) => {
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

  app.get(api.dashboard.charts.path, async (req, res) => {
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

  app.post(api.transactions.autoCategorize.path, async (req, res) => {
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
  app.get("/api/euer-reports", async (req, res) => {
    const reports = await storage.getEuerReports();
    res.json(reports);
  });

  app.get("/api/euer-reports/:year", async (req, res) => {
    const year = Number(req.params.year);
    const report = await storage.getEuerReport(year);
    if (!report) return res.status(404).json({ message: "Kein Bericht für dieses Jahr" });
    res.json(report);
  });

  app.put("/api/euer-reports/:year", async (req, res) => {
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
      
      const uploadedBy = 'admin';
      
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

  app.delete("/api/euer-reports/:year", async (req, res) => {
    await storage.deleteEuerReport(Number(req.params.year));
    res.status(204).send();
  });

  // PDF Upload for EÜR reports
  app.post("/api/euer-reports/:year/upload-pdf", pdfUpload.single('pdf'), async (req, res) => {
    try {
      const year = Number(req.params.year);
      if (isNaN(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ message: "Ungültiges Jahr" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "Keine PDF-Datei hochgeladen" });
      }

      const uploadedBy = 'admin';
      const existingReport = await storage.getEuerReport(year);

      // Speichere/aktualisiere den Bericht mit der neuen PDF-Datei
      const savedReport = await storage.upsertEuerReport({
        ...(existingReport ?? {
          ideellIncome: 0,
          ideellExpenses: 0,
          vermoegenIncome: 0,
          vermoegenExpenses: 0,
          zweckbetriebIncome: 0,
          zweckbetriebExpenses: 0,
          wirtschaftlichIncome: 0,
          wirtschaftlichExpenses: 0,
        }),
        year,
        sourceFileName: req.file.originalname,
        pdfFilePath: req.file.path,
        uploadedBy,
      });

      // PDF automatisch parsen (Claude → Regex-Fallback)
      let extractedData = null;
      try {
        extractedData = await parsePdf(req.file.path, year);
      } catch (e) {
        console.error('[routes] PDF-Parsing fehlgeschlagen:', e);
      }

      const itemCount = extractedData?.lineItems?.length ?? 0;
      const message = extractedData?.success
        ? `PDF analysiert: ${itemCount} Positionen erkannt (${extractedData.method === 'claude' ? 'KI' : 'Regex'})`
        : 'PDF hochgeladen. Bitte die Werte manuell eintragen.';

      res.json({
        message,
        report: savedReport,
        fileName: req.file.originalname,
        extractedData,
      });
    } catch (e) {
      console.error("Error uploading PDF:", e);
      res.status(500).json({ message: "Fehler beim Hochladen" });
    }
  });

  // Serve uploaded PDFs
  app.get("/api/euer-reports/:year/pdf", async (req, res) => {
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
  
  app.get("/api/euer-reports/:year/items", async (req, res) => {
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

  app.put("/api/euer-reports/:year/items", async (req, res) => {
    const year = Number(req.params.year);
    const report = await storage.getEuerReport(year);
    if (!report) return res.status(404).json({ message: "Report nicht gefunden" });
    
    const items = req.body.items || [];
    const saved = await storage.upsertEuerLineItems(report.id, items);
    res.json(saved);
  });

  // ── Summen- und Saldenliste ────────────────────────────────────────────────

  app.post("/api/summen-salden/:year/upload-pdf", sumSalUpload.single('pdf'), async (req, res) => {
    try {
      const year = Number(req.params.year);
      if (isNaN(year) || year < 2000 || year > 2100) return res.status(400).json({ message: "Ungültiges Jahr" });
      if (!req.file) return res.status(400).json({ message: "Keine PDF-Datei hochgeladen" });

      const result = await parseSummenSaldenPdf(req.file.path, year);
      if (!result.success || result.entries.length === 0) {
        return res.status(422).json({ message: "PDF konnte nicht geparst werden.", warnings: result.warnings });
      }

      const toInsert = result.entries.map(e => ({ ...e, year }));
      const saved = await storage.upsertSummenSalden(year, toInsert);
      const liquide = await storage.getLiquideMittel(year);

      res.json({
        message: `${saved.length} Konten importiert`,
        year,
        count: saved.length,
        warnings: result.warnings,
        liquideMittel: liquide,
      });
    } catch (e) {
      console.error('[routes] Summen-Salden Upload Fehler:', e);
      res.status(500).json({ message: "Fehler beim Hochladen" });
    }
  });

  app.get("/api/summen-salden/years", async (req, res) => {
    const years = await storage.getSummenSaldenYears();
    res.json(years);
  });

  app.get("/api/summen-salden/:year", async (req, res) => {
    const year = Number(req.params.year);
    const entries = await storage.getSummenSalden(year);
    res.json(entries);
  });

  app.get("/api/summen-salden/:year/liquide-mittel", async (req, res) => {
    const year = Number(req.params.year);
    const result = await storage.getLiquideMittel(year);
    res.json(result);
  });

  app.delete("/api/summen-salden/:year", async (req, res) => {
    const year = Number(req.params.year);
    await storage.deleteSummenSalden(year);
    res.json({ message: "Gelöscht" });
  });

  // EÜR endpoint - PDF-based with transaction fallback
  app.get("/api/report/euer", async (req, res) => {
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
        totalNet: ((pdfReport.ideellIncome || 0) + (pdfReport.vermoegenIncome || 0) + (pdfReport.zweckbetriebIncome || 0) + (pdfReport.wirtschaftlichIncome || 0)) - ((pdfReport.ideellExpenses || 0) + (pdfReport.vermoegenExpenses || 0) + (pdfReport.zweckbetriebExpenses || 0) + (pdfReport.wirtschaftlichExpenses || 0)),
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

  app.get(api.dashboard.forecast.path, async (req, res) => {
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
  app.get("/api/events", async (req, res) => {
    const events = await storage.getEvents();
    res.json(events);
  });

  app.get("/api/events/:id", async (req, res) => {
    const id = Number(req.params.id);
    const event = await storage.getEvent(id);
    if (!event) {
      return res.status(404).json({ message: "Veranstaltung nicht gefunden" });
    }
    res.json(event);
  });

  app.post("/api/events", async (req, res) => {
    const eventData = {
      ...req.body,
      date: new Date(req.body.date),
    };
    const event = await storage.createEvent(eventData);
    res.status(201).json(event);
  });

  app.patch("/api/events/:id", async (req, res) => {
    const id = Number(req.params.id);
    const updates = { ...req.body };
    if (updates.date) {
      updates.date = new Date(updates.date);
    }
    const event = await storage.updateEvent(id, updates);
    res.json(event);
  });

  app.delete("/api/events/:id", async (req, res) => {
    const id = Number(req.params.id);
    await storage.deleteEvent(id);
    res.status(204).send();
  });

  // Event Entries
  app.get("/api/events/:eventId/entries", async (req, res) => {
    const eventId = Number(req.params.eventId);
    const entries = await storage.getEventEntries(eventId);
    res.json(entries);
  });

  app.post("/api/events/:eventId/entries", async (req, res) => {
    const eventId = Number(req.params.eventId);
    const entryData = {
      ...req.body,
      eventId,
      date: new Date(req.body.date),
    };
    const entry = await storage.createEventEntry(entryData);
    res.status(201).json(entry);
  });

  app.patch("/api/event-entries/:id", async (req, res) => {
    const id = Number(req.params.id);
    const updates = { ...req.body };
    if (updates.date) {
      updates.date = new Date(updates.date);
    }
    const entry = await storage.updateEventEntry(id, updates);
    res.json(entry);
  });

  app.delete("/api/event-entries/:id", async (req, res) => {
    const id = Number(req.params.id);
    await storage.deleteEventEntry(id);
    res.status(204).send();
  });

  // === Contracts (Verträge) ===
  app.get("/api/contracts", async (req, res) => {
    const includeInactive = req.query.includeInactive === "true";
    const contracts = await storage.getContracts(includeInactive);
    res.json(contracts);
  });

  // Contract Suggestions routes MUST come before /:id routes to avoid routing conflict
  app.get("/api/contracts/suggestions", async (req, res) => {
    const status = req.query.status as "pending" | "accepted" | "dismissed" | undefined;
    const suggestions = await storage.getContractSuggestions(status);
    res.json(suggestions);
  });

  app.post("/api/contracts/suggestions/run", async (req, res) => {
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

  app.post("/api/contracts/suggestions/:id/accept", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const contract = await storage.acceptSuggestion(id);
      res.status(201).json(contract);
    } catch (error) {
      res.status(400).json({ error: "Vorschlag konnte nicht übernommen werden" });
    }
  });

  app.post("/api/contracts/suggestions/:id/dismiss", async (req, res) => {
    const id = Number(req.params.id);
    await storage.updateContractSuggestionStatus(id, "dismissed");
    res.status(204).send();
  });

  app.get("/api/contracts/:id", async (req, res) => {
    const id = Number(req.params.id);
    const contract = await storage.getContract(id);
    if (!contract) {
      return res.status(404).json({ error: "Vertrag nicht gefunden" });
    }
    res.json(contract);
  });

  app.post("/api/contracts", async (req, res) => {
    try {
      const contractData = insertContractSchema.parse(req.body);
      const contract = await storage.createContract(contractData);
      res.status(201).json(contract);
    } catch (error) {
      res.status(400).json({ error: "Ungültige Vertragsdaten" });
    }
  });

  app.patch("/api/contracts/:id", async (req, res) => {
    const id = Number(req.params.id);
    const updates = { ...req.body };
    if (updates.startDate) updates.startDate = new Date(updates.startDate);
    if (updates.endDate) updates.endDate = new Date(updates.endDate);
    if (updates.nextDueDate) updates.nextDueDate = new Date(updates.nextDueDate);
    const contract = await storage.updateContract(id, updates);
    res.json(contract);
  });

  app.delete("/api/contracts/:id", async (req, res) => {
    const id = Number(req.params.id);
    await storage.deleteContract(id);
    res.status(204).send();
  });

  // Link matching transactions to a contract (based on amount AND counterparty similarity)
  app.post("/api/contracts/:id/link-transactions", async (req, res) => {
    try {
      const contractId = Number(req.params.id);
      const contract = await storage.getContract(contractId);
      if (!contract) {
        return res.status(404).json({ error: "Vertrag nicht gefunden" });
      }
      
      // Find transactions already linked to this contract to get counterparty pattern
      const allTx = await storage.getTransactions({});
      const linkedTx = allTx.filter(tx => tx.contractId === contractId);
      
      // Extract counterparty patterns from already linked transactions, or use contract name
      const counterpartyPatterns: string[] = linkedTx
        .map(tx => tx.counterparty?.toLowerCase().trim())
        .filter((c): c is string => !!c);
      
      // Use contract name as fallback pattern
      const contractNameLower = contract.name.toLowerCase().trim();
      
      // Find matching transactions:
      // 1. Same amount (within tolerance)
      // 2. Not already linked to any contract
      // 3. Counterparty matches an existing pattern OR description contains contract name
      const matchingTx = allTx.filter(tx => {
        if (tx.contractId) return false; // Already linked
        if (Math.abs(tx.amount - contract.amount) > 0.01) return false; // Amount mismatch
        
        const txCounterparty = tx.counterparty?.toLowerCase().trim() || "";
        const txDescription = tx.description?.toLowerCase().trim() || "";
        
        // Check if counterparty matches existing patterns
        if (counterpartyPatterns.length > 0) {
          return counterpartyPatterns.some(pattern => 
            txCounterparty === pattern || 
            txCounterparty.includes(pattern) || 
            pattern.includes(txCounterparty)
          );
        }
        
        // Fallback: check if description or counterparty contains contract name keywords
        const nameWords = contractNameLower.split(/\s+/).filter(w => w.length > 3);
        return nameWords.some(word => 
          txCounterparty.includes(word) || txDescription.includes(word)
        );
      });
      
      // Link each matching transaction
      let linkedCount = 0;
      for (const tx of matchingTx) {
        await storage.updateTransaction(tx.id, { contractId });
        linkedCount++;
      }
      
      res.json({ linkedCount, contractId });
    } catch (error) {
      console.error("Link transactions error:", error);
      res.status(500).json({ error: "Fehler beim Verknüpfen der Buchungen" });
    }
  });

  // === AI Assistant ===
  app.post("/api/assistant", async (req, res) => {
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
