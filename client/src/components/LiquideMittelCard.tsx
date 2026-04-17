import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Plus, RefreshCw, Trash2, Pencil, Check, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { LiquideMittelChart, type LiquiditySnapshot } from "./LiquideMittelChart";

interface Props {
  title?: string;
  defaultHighlightYears?: number[];
}

interface RowEdit {
  darlehenZinslos: string;
  darlehen: string;
}

function toInputValue(n: number): string {
  if (n === 0) return "";
  return String(n);
}

function parseValue(s: string): number {
  if (!s.trim()) return 0;
  const normalized = s.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return isNaN(n) ? 0 : n;
}

export function LiquideMittelCard({ title = "Bestand liquide Mittel", defaultHighlightYears = [] }: Props) {
  const { toast } = useToast();
  const [editingYear, setEditingYear] = useState<number | null>(null);
  const [edit, setEdit] = useState<RowEdit>({ darlehenZinslos: "", darlehen: "" });
  const [newYear, setNewYear] = useState<string>("");
  const [showTable, setShowTable] = useState(false);

  const { data: snapshots = [], isLoading } = useQuery<LiquiditySnapshot[]>({
    queryKey: ["/api/liquidity"],
  });

  const sorted = useMemo(() => [...snapshots].sort((a, b) => a.year - b.year), [snapshots]);

  const upsertMutation = useMutation({
    mutationFn: async (body: LiquiditySnapshot) => {
      return apiRequest("POST", "/api/liquidity", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/liquidity"] });
      toast({ title: "Gespeichert" });
      setEditingYear(null);
    },
    onError: (err: any) => {
      toast({ title: "Fehler beim Speichern", description: err.message, variant: "destructive" });
    },
  });

  const recalcMutation = useMutation({
    mutationFn: async (year: number) => apiRequest("POST", `/api/liquidity/${year}/recalc`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/liquidity"] });
      toast({ title: "Neu berechnet aus Konten" });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (year: number) => apiRequest("DELETE", `/api/liquidity/${year}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/liquidity"] });
      toast({ title: "Jahr gelöscht" });
    },
  });

  const startEdit = (snap: LiquiditySnapshot) => {
    setEditingYear(snap.year);
    setEdit({
      darlehenZinslos: toInputValue(snap.darlehenZinslos),
      darlehen: toInputValue(snap.darlehen),
    });
  };

  const saveEdit = (year: number) => {
    const current = sorted.find(s => s.year === year);
    if (!current) return;
    // Bargeld + Festgelder bleiben auto-berechnet, nur Darlehen wird manuell uebernommen.
    upsertMutation.mutate({
      year,
      bargeld: current.bargeld,
      festgelder: current.festgelder,
      darlehenZinslos: parseValue(edit.darlehenZinslos),
      darlehen: parseValue(edit.darlehen),
      source: current.source,
    });
  };

  const addYear = () => {
    const y = parseInt(newYear, 10);
    if (!y || y < 1900 || y > 2100) {
      toast({ title: "Bitte gültiges Jahr eingeben", variant: "destructive" });
      return;
    }
    if (sorted.some(s => s.year === y)) {
      toast({ title: "Jahr existiert bereits", variant: "destructive" });
      return;
    }
    // Recalc legt das Jahr an und holt Bargeld + Festgelder automatisch aus den Konten.
    recalcMutation.mutate(y);
    setNewYear("");
    setShowTable(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-lg">{title}</CardTitle>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="Jahr"
            value={newYear}
            onChange={(e) => setNewYear(e.target.value)}
            className="w-24 h-8"
          />
          <Button size="sm" variant="outline" onClick={addYear} disabled={upsertMutation.isPending}>
            <Plus className="w-4 h-4 mr-1" />Jahr
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Lade Daten...</div>
        ) : (
          <LiquideMittelChart data={sorted} highlightYears={defaultHighlightYears} />
        )}

        <Collapsible open={showTable} onOpenChange={setShowTable}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="mt-3 gap-1 text-xs text-muted-foreground">
              {showTable ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              {showTable ? "Werte ausblenden" : "Werte anzeigen / bearbeiten"} ({sorted.length})
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Jahr</TableHead>
                    <TableHead className="text-right">Bargeld</TableHead>
                    <TableHead className="text-right">Festgelder</TableHead>
                    <TableHead className="text-right">Darlehen zinslos</TableHead>
                    <TableHead className="text-right">Darlehen</TableHead>
                    <TableHead className="text-right">Netto</TableHead>
                    <TableHead className="w-24">Quelle</TableHead>
                    <TableHead className="w-40 text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((snap) => {
                    const isEditing = editingYear === snap.year;
                    const netto = snap.bargeld + snap.festgelder + snap.darlehenZinslos + snap.darlehen;
                    return (
                      <TableRow key={snap.year}>
                        <TableCell className="font-medium">{snap.year}</TableCell>
                        {isEditing ? (
                          <>
                            <TableCell className="text-right tabular-nums text-muted-foreground" title="Aus Konten berechnet">{formatCurrency(snap.bargeld)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground" title="Aus Konten berechnet">{formatCurrency(snap.festgelder)}</TableCell>
                            <TableCell><Input className="h-7 text-right" placeholder="z.B. -15000" value={edit.darlehenZinslos} onChange={e => setEdit(p => ({ ...p, darlehenZinslos: e.target.value }))} /></TableCell>
                            <TableCell><Input className="h-7 text-right" placeholder="z.B. -80000" value={edit.darlehen} onChange={e => setEdit(p => ({ ...p, darlehen: e.target.value }))} /></TableCell>
                            <TableCell className="text-right text-muted-foreground">–</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{snap.source}</Badge></TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => saveEdit(snap.year)} disabled={upsertMutation.isPending}>
                                <Check className="w-4 h-4 text-green-600" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingYear(null)}>
                                <X className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="text-right tabular-nums">{formatCurrency(snap.bargeld)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCurrency(snap.festgelder)}</TableCell>
                            <TableCell className="text-right tabular-nums text-slate-600">{formatCurrency(snap.darlehenZinslos)}</TableCell>
                            <TableCell className="text-right tabular-nums text-rose-600">{formatCurrency(snap.darlehen)}</TableCell>
                            <TableCell className={`text-right tabular-nums font-semibold ${netto >= 0 ? "text-green-700" : "text-red-700"}`}>{formatCurrency(netto)}</TableCell>
                            <TableCell>
                              <Badge variant={snap.source === "auto" ? "default" : "outline"} className="text-xs">{snap.source}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(snap)} title="Bearbeiten">
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => recalcMutation.mutate(snap.year)} title="Aus Konten neu berechnen" disabled={recalcMutation.isPending}>
                                <RefreshCw className={`w-3.5 h-3.5 ${recalcMutation.isPending ? "animate-spin" : ""}`} />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                                if (confirm(`Jahr ${snap.year} wirklich loeschen?`)) deleteMutation.mutate(snap.year);
                              }} title="Loeschen">
                                <Trash2 className="w-3.5 h-3.5 text-red-600" />
                              </Button>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    );
                  })}
                  {sorted.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                        Noch kein Jahr angelegt. Oben Jahr eingeben und „Jahr" klicken.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground mt-2 px-1">
              <strong>Bargeld + Festgelder</strong> werden automatisch aus den Konten berechnet (erfordert Kontotyp-Zuordnung in Einstellungen → Konten). Beim Anlegen eines Jahres werden sie direkt geladen; mit <RefreshCw className="inline w-3 h-3" /> lassen sie sich jederzeit aktualisieren. <strong>Darlehen</strong> werden ueber <Pencil className="inline w-3 h-3" /> manuell eingetragen.
            </p>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
