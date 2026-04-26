import type { Express } from "express";
import { z } from "zod";
import { fibuStorage } from "./storage";
import { seedChartOfAccounts } from "./seedChartOfAccounts";
import { listTransactionSuggestions } from "./bridge";
import {
  createJournalEntry,
  reverseJournalEntry,
  JournalValidationError,
  type JournalLineInput,
} from "./journalEngine";

const lineSchema = z.object({
  konto: z.string().min(1),
  debit: z.number().nonnegative().optional().default(0),
  credit: z.number().nonnegative().optional().default(0),
  vatKey: z.string().nullable().optional(),
  vatAmount: z.number().nullable().optional(),
  costCenter: z.string().nullable().optional(),
  lineText: z.string().nullable().optional(),
});

const createEntryBodySchema = z.object({
  bookingDate: z.coerce.date(),
  fiscalYear: z.number().int(),
  source: z
    .enum(["manual", "bank-csv", "dtvf-import", "afa-run", "opening-balance", "reversal"])
    .optional()
    .default("manual"),
  description: z.string().min(1),
  docRef: z.string().nullable().optional(),
  sourceRef: z.string().nullable().optional(),
  lines: z.array(lineSchema).min(2),
});

const reverseBodySchema = z.object({
  bookingDate: z.coerce.date().optional(),
  description: z.string().optional(),
});

/**
 * Registriert die FiBu-Routes unter `/api/fibu/*`.
 * Schreibt ausschließlich auf `fibu_*` Tabellen.
 */
export async function registerFibuRoutes(app: Express): Promise<void> {
  try {
    const result = await seedChartOfAccounts();
    console.log(
      `[fibu] Kontenrahmen geseedet: ${result.inserted} neu, ${result.updated} aktualisiert, ${result.unchanged} unverändert (Summe ${result.total})`,
    );
  } catch (e) {
    console.error("[fibu] Seed fehlgeschlagen:", e);
  }

  // === Bridge: Vorschläge aus Bestands-Transaktionen (read-only) ===
  app.get("/api/fibu/transaction-suggestions", async (req, res) => {
    const yearRaw = req.query.year;
    const year = yearRaw ? Number(yearRaw) : undefined;
    if (year !== undefined && !Number.isFinite(year)) {
      return res.status(400).json({ error: "Ungültiger year-Parameter" });
    }
    try {
      res.json(await listTransactionSuggestions({ year }));
    } catch (e) {
      console.error("[fibu] GET /transaction-suggestions error:", e);
      res.status(500).json({ error: "Konnte Transaktions-Vorschläge nicht laden" });
    }
  });

  // === Kontenrahmen ===
  app.get("/api/fibu/accounts", async (_req, res) => {
    try {
      res.json(await fibuStorage.listAccounts());
    } catch (e) {
      console.error("[fibu] GET /accounts error:", e);
      res.status(500).json({ error: "Konnte FiBu-Konten nicht laden" });
    }
  });

  // === Journal ===
  app.get("/api/fibu/journal", async (req, res) => {
    try {
      const yearRaw = req.query.year;
      const year = yearRaw ? Number(yearRaw) : undefined;
      if (year !== undefined && !Number.isFinite(year)) {
        return res.status(400).json({ error: "Ungültiger year-Parameter" });
      }
      res.json(await fibuStorage.listEntries({ year }));
    } catch (e) {
      console.error("[fibu] GET /journal error:", e);
      res.status(500).json({ error: "Konnte Journal nicht laden" });
    }
  });

  app.get("/api/fibu/journal/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Ungültige ID" });
    try {
      const entry = await fibuStorage.getEntry(id);
      if (!entry) return res.status(404).json({ error: "Buchung nicht gefunden" });
      res.json(entry);
    } catch (e) {
      console.error("[fibu] GET /journal/:id error:", e);
      res.status(500).json({ error: "Konnte Buchung nicht laden" });
    }
  });

  app.post("/api/fibu/journal", async (req, res) => {
    const parsed = createEntryBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Ungültige Eingabe", details: parsed.error.issues });
    }
    const { lines, ...entry } = parsed.data;
    const lineInputs: JournalLineInput[] = lines.map((l) => ({
      konto: l.konto,
      debit: l.debit ?? 0,
      credit: l.credit ?? 0,
      vatKey: l.vatKey ?? null,
      vatAmount: l.vatAmount ?? null,
      costCenter: l.costCenter ?? null,
      lineText: l.lineText ?? null,
    }));
    try {
      const { id } = await createJournalEntry(
        {
          bookingDate: entry.bookingDate,
          fiscalYear: entry.fiscalYear,
          source: entry.source,
          description: entry.description,
          docRef: entry.docRef ?? null,
          sourceRef: entry.sourceRef ?? null,
          lockedAt: null,
          reversalOf: null,
        },
        lineInputs,
      );
      const full = await fibuStorage.getEntry(id);
      res.status(201).json(full);
    } catch (e) {
      if (e instanceof JournalValidationError) {
        return res.status(400).json({ error: e.message, code: e.code });
      }
      console.error("[fibu] POST /journal error:", e);
      res.status(500).json({ error: "Konnte Buchung nicht anlegen" });
    }
  });

  app.delete("/api/fibu/journal/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Ungültige ID" });
    try {
      await fibuStorage.deleteEntry(id);
      res.json({ success: true });
    } catch (e) {
      if (e instanceof JournalValidationError) {
        return res.status(400).json({ error: e.message, code: e.code });
      }
      console.error("[fibu] DELETE /journal/:id error:", e);
      res.status(500).json({ error: "Konnte Buchung nicht löschen" });
    }
  });

  app.post("/api/fibu/journal/:id/lock", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Ungültige ID" });
    try {
      const entry = await fibuStorage.lockEntry(id);
      res.json(entry);
    } catch (e) {
      if (e instanceof JournalValidationError) {
        return res.status(400).json({ error: e.message, code: e.code });
      }
      console.error("[fibu] POST /journal/:id/lock error:", e);
      res.status(500).json({ error: "Konnte Buchung nicht festschreiben" });
    }
  });

  app.post("/api/fibu/journal/:id/reverse", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Ungültige ID" });
    const parsed = reverseBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Ungültige Eingabe", details: parsed.error.issues });
    }
    try {
      const { id: reversalId } = await reverseJournalEntry(id, parsed.data);
      const full = await fibuStorage.getEntry(reversalId);
      res.status(201).json(full);
    } catch (e) {
      if (e instanceof JournalValidationError) {
        return res.status(400).json({ error: e.message, code: e.code });
      }
      console.error("[fibu] POST /journal/:id/reverse error:", e);
      res.status(500).json({ error: "Konnte Storno nicht anlegen" });
    }
  });
}
