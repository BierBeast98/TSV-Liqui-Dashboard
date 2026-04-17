import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Loader2, Trash2, RefreshCw, ChevronRight, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const EAS_CATEGORIES = ["A1", "A2", "B1", "B2", "C1", "C2", "D1", "D2"] as const;
type EasCategory = (typeof EAS_CATEGORIES)[number];

const EAS_LABELS: Record<EasCategory, string> = {
  A1: "Einnahmen ideeller Bereich",
  A2: "Ausgaben ideeller Bereich",
  B1: "Einnahmen Vermögensverwaltung",
  B2: "Ausgaben Vermögensverwaltung",
  C1: "Einnahmen Zweckbetrieb",
  C2: "Ausgaben Zweckbetrieb",
  D1: "Einnahmen wirtschaftl. GB",
  D2: "Ausgaben wirtschaftl. GB",
};

interface DatevBooking {
  id: number;
  year: number;
  belegdatum: string;
  belegfeld1: string | null;
  umsatz: number;
  sollHaben: string;
  konto: string;
  gegenkonto: string;
  buchungstext: string | null;
  herkunftKz: string | null;
  kost1: string | null;
  kost2: string | null;
  euerKonto: string | null;
  easCategory: EasCategory | null;
  manualOverride: boolean | null;
}

const KOST1_LABEL: Record<string, string> = {
  "1": "ideell",
  "2": "Verm.verw.",
  "3": "Zweckbetr.",
  "4": "wirt. GB",
  "9": "Bilanz/EB",
};

interface PivotSummary {
  year: number;
  totals: Record<EasCategory | "UNCLASSIFIED", number>;
  gesamt: number;
  bookingCount: number;
  unclassifiedCount: number;
}

function formatCurrency(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function formatDate(isoOrDate: string): string {
  try {
    return new Date(isoOrDate).toLocaleDateString("de-DE");
  } catch {
    return isoOrDate;
  }
}

interface KontoMappingEntry {
  konto: string;
  kontoname: string | null;
  easCategory: EasCategory | "SKIP";
}

type PivotGroupKey = EasCategory | "UNCLASSIFIED";

export function DatevAuswertungTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [filterCat, setFilterCat] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  const { data: yearsData } = useQuery<{ years: number[] }>({
    queryKey: ["/api/datev-bookings/years"],
  });
  const years = yearsData?.years ?? [];
  const year = selectedYear ?? years[0] ?? null;

  const { data: pivot } = useQuery<PivotSummary>({
    queryKey: ["/api/datev-bookings", year, "pivot"],
    queryFn: async () => {
      const r = await fetch(`/api/datev-bookings/${year}/pivot`);
      if (!r.ok) throw new Error("Pivot laden fehlgeschlagen");
      return r.json();
    },
    enabled: year !== null,
  });

  const { data: bookings = [] } = useQuery<DatevBooking[]>({
    queryKey: ["/api/datev-bookings", year],
    queryFn: async () => {
      const r = await fetch(`/api/datev-bookings/${year}`);
      if (!r.ok) throw new Error("Buchungen laden fehlgeschlagen");
      return r.json();
    },
    enabled: year !== null,
  });

  const { data: kontoMapping = [] } = useQuery<KontoMappingEntry[]>({
    queryKey: ["/api/datev-konto-mapping"],
  });

  const kontonameByKonto = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of kontoMapping) if (e.kontoname) m.set(e.konto, e.kontoname);
    return m;
  }, [kontoMapping]);

  // Gruppiert Buchungen nach E/A-Kategorie → Kontoname, berechnet Summen je Ebene.
  const groupedPivot = useMemo(() => {
    type AccountNode = {
      konto: string;
      kontoname: string;
      total: number;
      bookings: DatevBooking[];
    };
    type CatNode = {
      cat: PivotGroupKey;
      total: number;
      accounts: Map<string, AccountNode>;
    };
    const cats = new Map<PivotGroupKey, CatNode>();

    for (const b of bookings) {
      const key: PivotGroupKey | null =
        b.easCategory ?? (b.euerKonto === null ? null : "UNCLASSIFIED");
      if (!key) continue; // reine Bilanz-Buchungen überspringen
      let cat = cats.get(key);
      if (!cat) {
        cat = { cat: key, total: 0, accounts: new Map() };
        cats.set(key, cat);
      }
      cat.total += b.umsatz;

      const accKey = b.euerKonto ?? b.konto;
      let acc = cat.accounts.get(accKey);
      if (!acc) {
        acc = {
          konto: accKey,
          kontoname: kontonameByKonto.get(accKey) ?? `Konto ${accKey}`,
          total: 0,
          bookings: [],
        };
        cat.accounts.set(accKey, acc);
      }
      acc.total += b.umsatz;
      acc.bookings.push(b);
    }

    // sortiere Accounts nach Name, Buchungen nach Datum
    for (const c of cats.values()) {
      c.accounts = new Map(
        [...c.accounts.entries()].sort(([, a], [, b]) =>
          a.kontoname.localeCompare(b.kontoname, "de"),
        ),
      );
      for (const acc of c.accounts.values()) {
        acc.bookings.sort((a, b) => a.belegdatum.localeCompare(b.belegdatum));
      }
    }
    return cats;
  }, [bookings, kontonameByKonto]);

  const toggleCat = (cat: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };
  const toggleAccount = (key: string) => {
    setExpandedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const expandAll = () => {
    const cats = new Set<string>();
    const accs = new Set<string>();
    for (const [k, v] of groupedPivot) {
      cats.add(k);
      for (const acc of v.accounts.keys()) accs.add(`${k}:${acc}`);
    }
    setExpandedCats(cats);
    setExpandedAccounts(accs);
  };
  const collapseAll = () => {
    setExpandedCats(new Set());
    setExpandedAccounts(new Set());
  };

  const classifyMutation = useMutation({
    mutationFn: async ({ id, easCategory }: { id: number; easCategory: EasCategory }) => {
      const r = await fetch(`/api/datev-bookings/${id}/classify`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ easCategory }),
      });
      if (!r.ok) throw new Error("Klassifizierung fehlgeschlagen");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/datev-bookings", year] });
      qc.invalidateQueries({ queryKey: ["/api/datev-bookings", year, "pivot"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/datev-bookings/${year}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Löschen fehlgeschlagen");
      return r.json();
    },
    onSuccess: (data) => {
      toast({ title: `${data.deleted} Buchungen gelöscht` });
      qc.invalidateQueries({ queryKey: ["/api/datev-bookings"] });
      qc.invalidateQueries({ queryKey: ["/api/datev-bookings/years"] });
    },
  });

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append("files", f);
      const r = await fetch("/api/datev-bookings/upload", { method: "POST", body: fd });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error ?? "Upload fehlgeschlagen");
      }
      const data = await r.json();
      const total = data.results.reduce(
        (a: any, r: any) => ({
          inserted: a.inserted + r.inserted,
          skipped: a.skipped + r.skipped,
          unclassified: a.unclassified + r.unclassified,
        }),
        { inserted: 0, skipped: 0, unclassified: 0 },
      );
      toast({
        title: "DATEV-Import erfolgreich",
        description: `${total.inserted} neue, ${total.skipped} duplikate, ${total.unclassified} unklassifiziert`,
      });
      qc.invalidateQueries({ queryKey: ["/api/datev-bookings"] });
      qc.invalidateQueries({ queryKey: ["/api/datev-bookings/years"] });
      if (data.results[0]?.year) setSelectedYear(data.results[0].year);
    } catch (err: any) {
      toast({ title: "Upload fehlgeschlagen", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const filteredBookings = useMemo(() => {
    let rows = bookings;
    if (filterCat === "unclassified") {
      rows = rows.filter((b) => b.easCategory === null && b.euerKonto === null);
    } else if (filterCat !== "all") {
      rows = rows.filter((b) => b.easCategory === filterCat);
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      rows = rows.filter(
        (b) =>
          b.buchungstext?.toLowerCase().includes(q) ||
          b.konto.includes(q) ||
          b.gegenkonto.includes(q) ||
          b.belegfeld1?.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [bookings, filterCat, searchText]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (years.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>DATEV-Buchungsstapel importieren</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Lade ein oder mehrere DATEV DTVF-CSV-Dateien hoch (Buchungsstapel und
            Abschlussbuchungen). Die Buchungen werden automatisch nach E/A-Bereichen
            (A1…D2) klassifiziert.
          </p>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              multiple
              onChange={(e) => handleFileUpload(e.target.files)}
              className="hidden"
              data-testid="input-datev-upload"
            />
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} data-testid="button-datev-upload">
              {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              DTVF-CSV hochladen
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="datev-auswertung">
      {/* Header: Jahr + Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Select value={String(year ?? "")} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-28" data-testid="select-datev-year"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            {pivot?.bookingCount ?? 0} Buchungen
            {(pivot?.unclassifiedCount ?? 0) > 0 && (
              <Badge variant="outline" className="ml-2 text-yellow-700 border-yellow-400">
                {pivot?.unclassifiedCount} unklassifiziert
              </Badge>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            multiple
            onChange={(e) => handleFileUpload(e.target.files)}
            className="hidden"
          />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Weitere hochladen
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm(`Alle ${bookings.length} Buchungen für ${year} löschen?`)) {
                deleteMutation.mutate();
              }
            }}
            data-testid="button-datev-delete-year"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Jahr löschen
          </Button>
        </div>
      </div>

      {/* Pivot-Tabelle (hierarchisch, expandierbar) */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle>Pivot-Auswertung {year}</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={expandAll} data-testid="button-pivot-expand-all">
                Alle ausklappen
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll} data-testid="button-pivot-collapse-all">
                Alle einklappen
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">E/A</TableHead>
                <TableHead>Kontoname</TableHead>
                <TableHead>Buchung</TableHead>
                <TableHead className="text-right w-40">Ergebnis</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                const ordered: PivotGroupKey[] = [...EAS_CATEGORIES, "UNCLASSIFIED"];
                const rows: JSX.Element[] = [];
                for (const cat of ordered) {
                  const node = groupedPivot.get(cat);
                  if (!node) continue;
                  const isIncome = cat !== "UNCLASSIFIED" && cat.endsWith("1");
                  const isUnclass = cat === "UNCLASSIFIED";
                  const catExpanded = expandedCats.has(cat);
                  rows.push(
                    <TableRow
                      key={`cat-${cat}`}
                      className={`cursor-pointer hover:bg-muted/50 font-semibold ${isUnclass ? "bg-yellow-50/60 dark:bg-yellow-900/10" : ""}`}
                      onClick={() => toggleCat(cat)}
                      data-testid={`row-pivot-cat-${cat}`}
                    >
                      <TableCell className="font-mono">
                        <div className="flex items-center gap-1">
                          {catExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <span>{cat === "UNCLASSIFIED" ? "???" : cat}</span>
                        </div>
                      </TableCell>
                      <TableCell colSpan={2} className="text-muted-foreground font-normal">
                        {isUnclass ? "Unklassifiziert" : EAS_LABELS[cat as EasCategory]}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${
                          isUnclass
                            ? "text-yellow-700"
                            : isIncome
                              ? "text-green-700 dark:text-green-400"
                              : "text-red-700 dark:text-red-400"
                        }`}
                      >
                        {formatCurrency(node.total)}
                      </TableCell>
                    </TableRow>,
                  );
                  if (!catExpanded) continue;
                  for (const acc of node.accounts.values()) {
                    const accKey = `${cat}:${acc.konto}`;
                    const accExpanded = expandedAccounts.has(accKey);
                    rows.push(
                      <TableRow
                        key={`acc-${accKey}`}
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => toggleAccount(accKey)}
                        data-testid={`row-pivot-acc-${accKey}`}
                      >
                        <TableCell />
                        <TableCell colSpan={2}>
                          <div className="flex items-center gap-1 pl-4">
                            {accExpanded ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )}
                            <span className="font-medium">{acc.kontoname}</span>
                            <span className="text-xs text-muted-foreground font-mono ml-2">
                              {acc.konto}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatCurrency(acc.total)}
                        </TableCell>
                      </TableRow>,
                    );
                    if (!accExpanded) continue;
                    for (const b of acc.bookings) {
                      rows.push(
                        <TableRow
                          key={`bk-${b.id}`}
                          className="bg-muted/10 hover:bg-muted/20"
                          data-testid={`row-pivot-booking-${b.id}`}
                        >
                          <TableCell />
                          <TableCell />
                          <TableCell className="text-sm">
                            <div className="pl-8 flex items-center gap-2">
                              <span className="tabular-nums text-muted-foreground text-xs w-20">
                                {formatDate(b.belegdatum)}
                              </span>
                              <span className="flex-1">{b.buchungstext ?? "—"}</span>
                              {b.kost1 && (
                                <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono">
                                  K1:{b.kost1}
                                  {KOST1_LABEL[b.kost1] ? ` ${KOST1_LABEL[b.kost1]}` : ""}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {formatCurrency(b.umsatz)}
                          </TableCell>
                        </TableRow>,
                      );
                    }
                  }
                }
                return rows;
              })()}
              <TableRow className="bg-muted/50 font-bold border-t-2">
                <TableCell />
                <TableCell colSpan={2}>Gesamtergebnis</TableCell>
                <TableCell
                  className={`text-right tabular-nums ${
                    (pivot?.gesamt ?? 0) >= 0
                      ? "text-green-700 dark:text-green-400"
                      : "text-red-700 dark:text-red-400"
                  }`}
                  data-testid="cell-pivot-gesamt"
                >
                  {formatCurrency(pivot?.gesamt ?? 0)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail-Liste */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle>Buchungen ({filteredBookings.length})</CardTitle>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Suchen…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-48"
                data-testid="input-datev-search"
              />
              <Select value={filterCat} onValueChange={setFilterCat}>
                <SelectTrigger className="w-48" data-testid="select-datev-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Kategorien</SelectItem>
                  <SelectItem value="unclassified">Nur Unklassifizierte</SelectItem>
                  {EAS_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c} — {EAS_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[60vh]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-24">Datum</TableHead>
                  <TableHead className="w-16">Beleg</TableHead>
                  <TableHead>Buchungstext</TableHead>
                  <TableHead className="w-20">Konto</TableHead>
                  <TableHead className="w-20">Gegenko.</TableHead>
                  <TableHead className="text-right w-28">Umsatz</TableHead>
                  <TableHead className="w-12">S/H</TableHead>
                  <TableHead className="w-28">E/A</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBookings.map((b) => {
                  const isUnclass = b.easCategory === null && b.euerKonto === null;
                  return (
                    <TableRow key={b.id} className={isUnclass ? "bg-yellow-50/60 dark:bg-yellow-900/10" : ""}>
                      <TableCell className="text-sm tabular-nums">{formatDate(b.belegdatum)}</TableCell>
                      <TableCell className="text-sm font-mono">{b.belegfeld1 ?? ""}</TableCell>
                      <TableCell className="text-sm">{b.buchungstext ?? ""}</TableCell>
                      <TableCell className="text-sm font-mono">{b.konto}</TableCell>
                      <TableCell className="text-sm font-mono">{b.gegenkonto}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{formatCurrency(b.umsatz)}</TableCell>
                      <TableCell className="text-sm">{b.sollHaben}</TableCell>
                      <TableCell>
                        <Select
                          value={b.easCategory ?? ""}
                          onValueChange={(v) => classifyMutation.mutate({ id: b.id, easCategory: v as EasCategory })}
                        >
                          <SelectTrigger className="h-7 text-xs" data-testid={`select-classify-${b.id}`}>
                            <SelectValue placeholder={isUnclass ? "—" : ""} />
                          </SelectTrigger>
                          <SelectContent>
                            {EAS_CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
