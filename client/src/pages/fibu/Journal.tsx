import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, BookCheck, Lock, Undo2, Trash2, FileText, Link2, Receipt } from "lucide-react";
import { useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import type { FibuAccount } from "@shared/schema";
import {
  useFibuAccounts,
  useFibuJournal,
  useCreateFibuEntry,
  useLockFibuEntry,
  useReverseFibuEntry,
  useDeleteFibuEntry,
  useFibuTransactionSuggestions,
  type FibuJournalEntryWithLines,
  type CreateEntryInput,
  type TransactionSuggestion,
} from "@/hooks/use-fibu-journal";

type Bereich = "" | "ideell" | "vermoegensverwaltung" | "zweckbetrieb" | "wirtschaftlich";

// SKR49-Konvention: KOST1 "1"/"2"/"3"/"4" = Ideell/Vermögensverw./Zweckbetrieb/wGB
// (siehe server/datevSkr49Mapping.ts — gleiche Semantik wird f\u00fcr DATEV-Export gebraucht)
const BEREICH_TO_KOST1: Record<Bereich, string | null> = {
  "": null,
  ideell: "1",
  vermoegensverwaltung: "2",
  zweckbetrieb: "3",
  wirtschaftlich: "4",
};
const KOST1_TO_BEREICH: Record<string, Bereich> = {
  "1": "ideell",
  "2": "vermoegensverwaltung",
  "3": "zweckbetrieb",
  "4": "wirtschaftlich",
};
const BEREICH_LABEL: Record<Bereich, string> = {
  "": "—",
  ideell: "Ideell",
  vermoegensverwaltung: "Vermögensverw.",
  zweckbetrieb: "Zweckbetrieb",
  wirtschaftlich: "Wirtschaftlich",
};

function fiscalAreaToBereich(fa: string | null | undefined): Bereich {
  if (!fa) return "";
  if (fa === "ideell" || fa === "vermoegensverwaltung" || fa === "zweckbetrieb" || fa === "wirtschaftlich") {
    return fa;
  }
  return "";
}

interface DraftLine {
  id: string;
  konto: string;
  side: "debit" | "credit";
  amount: string;
  lineText: string;
  bereich: Bereich;
}

function emptyLine(side: "debit" | "credit", overrides: Partial<DraftLine> = {}): DraftLine {
  return {
    id: crypto.randomUUID(),
    konto: "",
    side,
    amount: "",
    lineText: "",
    bereich: "",
    ...overrides,
  };
}

function parseAmount(raw: string): number {
  if (!raw.trim()) return 0;
  const cleaned = raw.replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function formatAmountForInput(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

/**
 * Versucht, ein Bestands-Bank-Konto (datevKonto) auf ein FiBu-SKR49-Konto
 * zu mappen. Exakter Match hat Vorrang; sonst Versuch 4-stellig → 5-stellig
 * (DATEV-SKR49 trailing-0-Konvention). Ohne Treffer wird nichts gesetzt —
 * der Nutzer wählt manuell.
 */
function resolveBankKonto(raw: string | null, accounts: FibuAccount[]): string {
  if (!raw) return "";
  const direct = accounts.find((a) => a.konto === raw);
  if (direct) return direct.konto;
  if (raw.length === 4) {
    const padded = raw + "0";
    const match = accounts.find((a) => a.konto === padded);
    if (match) return match.konto;
  }
  return "";
}

interface NewEntryInitial {
  bookingDate?: string;
  description?: string;
  docRef?: string;
  sourceRef?: string | null;
  lines?: DraftLine[];
}

interface NewEntryDialogProps {
  accounts: FibuAccount[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: NewEntryInitial;
}

function NewEntryDialog({ accounts, open, onOpenChange, initial }: NewEntryDialogProps) {
  const { toast } = useToast();
  const createMutation = useCreateFibuEntry();

  const [bookingDate, setBookingDate] = useState(
    () => initial?.bookingDate ?? format(new Date(), "yyyy-MM-dd"),
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [docRef, setDocRef] = useState(initial?.docRef ?? "");
  const [sourceRef] = useState<string | null>(initial?.sourceRef ?? null);
  const [lines, setLines] = useState<DraftLine[]>(
    () => initial?.lines ?? [emptyLine("debit"), emptyLine("credit")],
  );

  const sums = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const l of lines) {
      const n = parseAmount(l.amount);
      if (!Number.isFinite(n)) continue;
      if (l.side === "debit") debit += n;
      else credit += n;
    }
    return { debit, credit, diff: Math.abs(debit - credit) };
  }, [lines]);

  const balanced = sums.diff < 0.005 && sums.debit > 0;

  function updateLine(id: string, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...patch };
        // Wenn Konto neu gesetzt wird und noch kein Bereich: Default aus fiscalArea \u00fcbernehmen
        if (patch.konto !== undefined && patch.konto !== l.konto && !next.bereich) {
          const konto = accounts.find((a) => a.konto === patch.konto);
          if (konto) next.bereich = fiscalAreaToBereich(konto.fiscalArea);
        }
        return next;
      }),
    );
  }
  function removeLine(id: string) {
    setLines((prev) => (prev.length > 2 ? prev.filter((l) => l.id !== id) : prev));
  }
  function addLine(side: "debit" | "credit") {
    setLines((prev) => [...prev, emptyLine(side)]);
  }

  async function handleSubmit() {
    const errors: string[] = [];
    if (!description.trim()) errors.push("Buchungstext fehlt.");
    if (!bookingDate) errors.push("Buchungsdatum fehlt.");
    const parsedDate = new Date(bookingDate);
    if (Number.isNaN(parsedDate.getTime())) errors.push("Ungültiges Datum.");

    const preparedLines: CreateEntryInput["lines"] = [];
    for (const [i, l] of lines.entries()) {
      if (!l.konto) {
        errors.push(`Zeile ${i + 1}: Konto fehlt.`);
        continue;
      }
      const amount = parseAmount(l.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        errors.push(`Zeile ${i + 1}: Betrag ungültig.`);
        continue;
      }
      preparedLines.push({
        konto: l.konto,
        debit: l.side === "debit" ? amount : 0,
        credit: l.side === "credit" ? amount : 0,
        lineText: l.lineText.trim() || null,
        costCenter: BEREICH_TO_KOST1[l.bereich] ?? null,
      });
    }
    if (!balanced) errors.push(`Summe Soll (${sums.debit.toFixed(2)}) ≠ Summe Haben (${sums.credit.toFixed(2)}).`);

    if (errors.length) {
      toast({ title: "Eingabe prüfen", description: errors.join(" "), variant: "destructive" });
      return;
    }

    try {
      await createMutation.mutateAsync({
        bookingDate,
        fiscalYear: parsedDate.getFullYear(),
        description: description.trim(),
        docRef: docRef.trim() || null,
        sourceRef,
        lines: preparedLines,
      });
      toast({ title: "Buchung angelegt", description: description.trim() });
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Neue Buchung</DialogTitle>
          <DialogDescription>
            Doppelte Buchung: mindestens 2 Positionen, Summe Soll == Summe Haben.
            {sourceRef && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-primary">
                <Link2 className="w-3 h-3" /> aus {sourceRef}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="fibu-date">Buchungsdatum</Label>
            <Input id="fibu-date" type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label htmlFor="fibu-desc">Buchungstext</Label>
            <Input id="fibu-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="z.B. Mitgliedsbeiträge März" />
          </div>
          <div>
            <Label htmlFor="fibu-doc">Belegnummer</Label>
            <Input id="fibu-doc" value={docRef} onChange={(e) => setDocRef(e.target.value)} placeholder="optional" />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="grid grid-cols-[110px_1fr_110px_160px_160px_40px] gap-2 text-xs uppercase tracking-wide text-muted-foreground px-1">
            <span>Seite</span>
            <span>Konto</span>
            <span>Betrag (€)</span>
            <span>Bereich</span>
            <span>Text</span>
            <span />
          </div>
          {lines.map((l) => (
            <div key={l.id} className="grid grid-cols-[110px_1fr_110px_160px_160px_40px] gap-2 items-center">
              <Select value={l.side} onValueChange={(v) => updateLine(l.id, { side: v as "debit" | "credit" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="debit">Soll</SelectItem>
                  <SelectItem value="credit">Haben</SelectItem>
                </SelectContent>
              </Select>
              <Select value={l.konto} onValueChange={(v) => updateLine(l.id, { konto: v })}>
                <SelectTrigger><SelectValue placeholder="Konto wählen" /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {accounts.map((a) => (
                    <SelectItem key={a.konto} value={a.konto}>
                      <span className="font-mono">{a.konto}</span> &nbsp; {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={l.amount}
                onChange={(e) => updateLine(l.id, { amount: e.target.value })}
              />
              <Select
                value={l.bereich === "" ? "__none" : l.bereich}
                onValueChange={(v) => updateLine(l.id, { bereich: (v === "__none" ? "" : v) as Bereich })}
              >
                <SelectTrigger><SelectValue placeholder="— keiner —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— keiner (neutral) —</SelectItem>
                  <SelectItem value="ideell">Ideell</SelectItem>
                  <SelectItem value="vermoegensverwaltung">Vermögensverwaltung</SelectItem>
                  <SelectItem value="zweckbetrieb">Zweckbetrieb</SelectItem>
                  <SelectItem value="wirtschaftlich">Wirtschaftlicher GB</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Text (optional)"
                value={l.lineText}
                onChange={(e) => updateLine(l.id, { lineText: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={lines.length <= 2}
                onClick={() => removeLine(l.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => addLine("debit")}>
              <Plus className="w-3 h-3 mr-1" /> Soll-Zeile
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => addLine("credit")}>
              <Plus className="w-3 h-3 mr-1" /> Haben-Zeile
            </Button>
          </div>
        </div>

        <div className={`mt-3 flex items-center justify-between rounded-md border px-4 py-2 text-sm ${balanced ? "border-emerald-500/40 bg-emerald-500/5" : "border-rose-500/40 bg-rose-500/5"}`}>
          <div>
            Summe Soll: <span className="font-mono font-semibold">{formatCurrency(sums.debit)}</span>
            &nbsp;|&nbsp;
            Summe Haben: <span className="font-mono font-semibold">{formatCurrency(sums.credit)}</span>
          </div>
          <div className="font-medium">
            {balanced ? "ausgeglichen ✓" : `Differenz ${formatCurrency(sums.diff)}`}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button type="button" onClick={handleSubmit} disabled={createMutation.isPending || !balanced}>
            {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Buchen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TransactionPickerProps {
  year: number | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (tx: TransactionSuggestion) => void;
}

function TransactionPickerDialog({ year, open, onOpenChange, onPick }: TransactionPickerProps) {
  const { data: suggestions = [], isLoading } = useFibuTransactionSuggestions(year);
  const [search, setSearch] = useState("");
  const [hideBooked, setHideBooked] = useState(true);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suggestions.filter((s) => {
      if (hideBooked && s.alreadyBooked) return false;
      if (!q) return true;
      return (
        s.description.toLowerCase().includes(q) ||
        (s.counterparty ?? "").toLowerCase().includes(q) ||
        String(s.amount).includes(q)
      );
    });
  }, [suggestions, search, hideBooked]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Buchung aus Bestands-Transaktion übernehmen</DialogTitle>
          <DialogDescription>
            Wähle eine Buchung aus der Analyse-Seite als Vorlage. Betrag, Datum und
            Bank-Konto werden vorbefüllt, die FiBu-Buchung entsteht eigenständig.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 pb-2">
          <Input
            placeholder="Suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={hideBooked}
              onChange={(e) => setHideBooked(e.target.checked)}
            />
            nur unverbuchte
          </label>
          <div className="ml-auto text-xs text-muted-foreground">
            {filtered.length} / {suggestions.length} Buchungen
          </div>
        </div>

        <div className="overflow-y-auto border rounded-md">
          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground p-8">
              <Loader2 className="w-4 h-4 animate-spin" /> Lade Transaktionen…
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Keine passenden Transaktionen.
            </div>
          )}
          {!isLoading && filtered.length > 0 && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background z-10">
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 px-3">Datum</th>
                  <th className="py-2 px-3">Beschreibung</th>
                  <th className="py-2 px-3">Gegenpartei</th>
                  <th className="py-2 px-3">Konto</th>
                  <th className="py-2 px-3 text-right">Betrag</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    className={`border-b cursor-pointer hover:bg-muted/40 ${s.alreadyBooked ? "opacity-60" : ""}`}
                    onClick={() => { onPick(s); onOpenChange(false); }}
                  >
                    <td className="py-2 px-3 whitespace-nowrap">{format(new Date(s.date), "dd.MM.yyyy")}</td>
                    <td className="py-2 px-3">{s.description}</td>
                    <td className="py-2 px-3 text-muted-foreground">{s.counterparty ?? ""}</td>
                    <td className="py-2 px-3 text-muted-foreground text-xs">{s.accountName ?? "—"}</td>
                    <td className={`py-2 px-3 text-right font-mono ${s.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {formatCurrency(s.amount)}
                    </td>
                    <td className="py-2 px-3">
                      {s.alreadyBooked ? (
                        <Badge variant="secondary" className="text-xs">✓ Verbucht</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Offen</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EntryRow({ entry, accounts }: { entry: FibuJournalEntryWithLines; accounts: Map<string, string> }) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const lockMutation = useLockFibuEntry();
  const reverseMutation = useReverseFibuEntry();
  const deleteMutation = useDeleteFibuEntry();

  const isLocked = entry.lockedAt !== null;
  const isReversal = entry.reversalOf !== null;
  const hasSource = entry.sourceRef !== null;

  async function handleDelete() {
    if (!confirm(`Buchung #${entry.id} endgültig löschen? (nur offene Buchungen)`)) return;
    try {
      await deleteMutation.mutateAsync(entry.id);
      toast({ title: "Gelöscht", description: `Buchung #${entry.id}` });
    } catch (e) {
      toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" });
    }
  }
  async function handleLock() {
    if (!confirm(`Buchung #${entry.id} festschreiben? Kann nicht rückgängig gemacht werden.`)) return;
    try {
      await lockMutation.mutateAsync(entry.id);
      toast({ title: "Festgeschrieben", description: `Buchung #${entry.id}` });
    } catch (e) {
      toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" });
    }
  }
  async function handleReverse() {
    if (!confirm(`Buchung #${entry.id} stornieren (Gegenbuchung anlegen)?`)) return;
    try {
      const reversal = await reverseMutation.mutateAsync({ id: entry.id });
      toast({ title: "Storniert", description: `Gegenbuchung #${reversal.id} angelegt` });
    } catch (e) {
      toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" });
    }
  }

  return (
    <>
      <tr
        className={`border-b hover:bg-muted/30 cursor-pointer ${isReversal ? "bg-amber-50/50" : ""}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="py-2 pr-3 font-mono text-xs">#{entry.id}</td>
        <td className="py-2 pr-3">{format(new Date(entry.bookingDate), "dd.MM.yyyy")}</td>
        <td className="py-2 pr-3">
          {entry.description}
          {isReversal && <Badge variant="outline" className="ml-2">Storno #{entry.reversalOf}</Badge>}
          {hasSource && !isReversal && (
            <Badge variant="outline" className="ml-2 text-xs gap-1">
              <Link2 className="w-3 h-3" /> {entry.sourceRef}
            </Badge>
          )}
        </td>
        <td className="py-2 pr-3 font-mono">{formatCurrency(entry.totalAmount)}</td>
        <td className="py-2 pr-3">
          {isLocked ? (
            <Badge variant="secondary" className="gap-1"><Lock className="w-3 h-3" /> Festgeschrieben</Badge>
          ) : (
            <Badge variant="outline">Offen</Badge>
          )}
        </td>
        <td className="py-2 pr-3 text-right" onClick={(e) => e.stopPropagation()}>
          <div className="inline-flex gap-1">
            {!isLocked && (
              <Button variant="ghost" size="sm" onClick={handleLock} disabled={lockMutation.isPending}>
                <Lock className="w-3 h-3 mr-1" /> Festschreiben
              </Button>
            )}
            {!isReversal && (
              <Button variant="ghost" size="sm" onClick={handleReverse} disabled={reverseMutation.isPending}>
                <Undo2 className="w-3 h-3 mr-1" /> Storno
              </Button>
            )}
            {!isLocked && (
              <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleteMutation.isPending} className="text-rose-600 hover:text-rose-700">
                <Trash2 className="w-3 h-3 mr-1" /> Löschen
              </Button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/20">
          <td colSpan={6} className="py-2 px-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left py-1 pr-3">Konto</th>
                  <th className="text-left py-1 pr-3">Name</th>
                  <th className="text-right py-1 pr-3">Soll</th>
                  <th className="text-right py-1 pr-3">Haben</th>
                  <th className="text-left py-1 pr-3">Bereich</th>
                  <th className="text-left py-1 pr-3">Text</th>
                </tr>
              </thead>
              <tbody>
                {entry.lines.map((l) => {
                  const bereich = l.costCenter ? KOST1_TO_BEREICH[l.costCenter] ?? "" : "";
                  return (
                    <tr key={l.id}>
                      <td className="py-1 pr-3 font-mono">{l.konto}</td>
                      <td className="py-1 pr-3">{accounts.get(l.konto) ?? "—"}</td>
                      <td className="py-1 pr-3 text-right font-mono">{l.debit ? formatCurrency(l.debit) : ""}</td>
                      <td className="py-1 pr-3 text-right font-mono">{l.credit ? formatCurrency(l.credit) : ""}</td>
                      <td className="py-1 pr-3">{BEREICH_LABEL[bereich]}</td>
                      <td className="py-1 pr-3">{l.lineText ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

export default function FibuJournal() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number | undefined>(currentYear);

  // Dialog-State: Wir remounten NewEntryDialog bei jedem Open mit neuem Key,
  // damit das Formular frisch initialisiert wird (mit oder ohne Prefill).
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const [dialogInitial, setDialogInitial] = useState<NewEntryInitial | undefined>(undefined);

  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: accounts = [] } = useFibuAccounts();
  const { data: entries = [], isLoading, error } = useFibuJournal(year);

  const accountsMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accounts) m.set(a.konto, a.name);
    return m;
  }, [accounts]);

  const totalVolume = useMemo(
    () => entries.reduce((acc, e) => acc + e.totalAmount, 0),
    [entries],
  );
  const lockedCount = entries.filter((e) => e.lockedAt !== null).length;
  const reversalCount = entries.filter((e) => e.reversalOf !== null).length;

  const years = useMemo(() => {
    const set = new Set<number>([currentYear]);
    for (const e of entries) set.add(e.fiscalYear);
    return Array.from(set).sort((a, b) => b - a);
  }, [entries, currentYear]);

  function openNewEntry() {
    setDialogInitial(undefined);
    setDialogKey((k) => k + 1);
    setDialogOpen(true);
  }

  function handlePickTransaction(tx: TransactionSuggestion) {
    // Bank-Zeile: wenn Betrag > 0 (Geld kommt rein), Bank im Soll; sonst im Haben.
    const absAmount = Math.abs(tx.amount);
    const bankKonto = resolveBankKonto(tx.bankKonto, accounts);
    const bankSide: "debit" | "credit" = tx.amount >= 0 ? "debit" : "credit";
    const otherSide: "debit" | "credit" = bankSide === "debit" ? "credit" : "debit";

    const txBereich = fiscalAreaToBereich(tx.fiscalArea);
    const lines: DraftLine[] = [
      emptyLine(bankSide, {
        konto: bankKonto,
        amount: formatAmountForInput(absAmount),
        lineText: tx.counterparty ?? "",
        // Bank-Zeile bleibt neutral — Bank ist kein E/A-Konto
      }),
      emptyLine(otherSide, {
        konto: "",
        amount: formatAmountForInput(absAmount),
        lineText: "",
        bereich: txBereich, // aus category.fiscalArea der Quell-Transaktion
      }),
    ];

    setDialogInitial({
      bookingDate: tx.date,
      description: tx.description,
      docRef: tx.counterparty ?? "",
      sourceRef: tx.sourceRef,
      lines,
    });
    setDialogKey((k) => k + 1);
    setDialogOpen(true);
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookCheck className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold font-display">FiBu — Journal</h1>
              <p className="text-sm text-muted-foreground">
                Doppelte Buchungen der Schatten-Buchhaltung
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(year ?? "all")} onValueChange={(v) => setYear(v === "all" ? undefined : Number(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Jahre</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setPickerOpen(true)} disabled={accounts.length === 0}>
              <Receipt className="w-4 h-4 mr-2" /> Aus Buchung übernehmen
            </Button>
            <Button onClick={openNewEntry} disabled={accounts.length === 0}>
              <Plus className="w-4 h-4 mr-2" /> Neue Buchung
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Buchungen</CardTitle></CardHeader>
            <CardContent><span className="text-2xl font-bold">{entries.length}</span></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Volumen Soll</CardTitle></CardHeader>
            <CardContent><span className="text-2xl font-bold font-mono">{formatCurrency(totalVolume)}</span></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Festgeschrieben</CardTitle></CardHeader>
            <CardContent><span className="text-2xl font-bold text-blue-600">{lockedCount}</span></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Stornos</CardTitle></CardHeader>
            <CardContent><span className="text-2xl font-bold text-amber-600">{reversalCount}</span></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Buchungen</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="flex items-center gap-2 text-muted-foreground py-8">
                <Loader2 className="w-4 h-4 animate-spin" /> Lade Journal…
              </div>
            )}
            {error && <div className="text-rose-600 py-4">Fehler: {(error as Error).message}</div>}
            {!isLoading && !error && entries.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                <FileText className="w-10 h-10 opacity-40" />
                <p>Noch keine Buchungen{year ? ` für ${year}` : ""}.</p>
                <p className="text-xs">Lege oben rechts die erste Buchung an oder übernimm eine aus den Bestands-Buchungen.</p>
              </div>
            )}
            {!isLoading && !error && entries.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2 pr-3">ID</th>
                      <th className="py-2 pr-3">Datum</th>
                      <th className="py-2 pr-3">Text</th>
                      <th className="py-2 pr-3">Betrag</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3 text-right">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <EntryRow key={e.id} entry={e} accounts={accountsMap} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <NewEntryDialog
        key={dialogKey}
        accounts={accounts}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={dialogInitial}
      />
      <TransactionPickerDialog
        year={year}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={handlePickTransaction}
      />
    </Layout>
  );
}
