import { Layout } from "@/components/Layout";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  useSummenSalden,
  useSummenSaldenYears,
  summenSaldenKey,
  SUMMEN_SALDEN_YEARS_KEY,
} from "@/hooks/use-summen-salden";
import { useFilter } from "@/contexts/FilterContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, Search, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

import type { SummenSaldenEntry } from "@/hooks/use-summen-salden";

const KONTO_KLASSEN: Record<string, string> = {
  '0': 'Anlagevermögen',
  '1': 'Umlaufvermögen / Liquidität',
  '3': 'Verbindlichkeiten / Steuern',
  '4': 'Betriebliche Erträge',
  '5': 'Wareneinsatz',
  '6': 'Betriebliche Aufwendungen',
  '7': 'Finanzergebnis',
  '9': 'Kapitalkonten',
};

function kontoKlasse(konto: string): string {
  return KONTO_KLASSEN[konto[0]] ?? 'Sonstige';
}

function signedValue(val: number | null, seite: string | null): number {
  if (!val) return 0;
  if (seite === 'S') return val;
  if (seite === 'H') return -val;
  return 0;
}

export default function Kontenübersicht() {
  const { year, setYear, compareYear, setCompareYear } = useFilter();
  const currentYear = new Date().getFullYear();
  const [search, setSearch] = useState('');
  const [filterKlasse, setFilterKlasse] = useState<string>('all');
  const { toast } = useToast();

  const { data: availableYears = [] } = useSummenSaldenYears();
  const { data: entries = [], isLoading } = useSummenSalden(year);
  const { data: compareEntries = [] } = useSummenSalden(compareYear);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('pdf', file);
      const res = await fetch(`/api/summen-salden/${year}/upload-pdf`, { method: 'POST', body: fd });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Upload fehlgeschlagen'); }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: summenSaldenKey(year) });
      queryClient.invalidateQueries({ queryKey: SUMMEN_SALDEN_YEARS_KEY });
      toast({ title: 'Importiert', description: data.message });
    },
    onError: (e: Error) => toast({ title: 'Fehler', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/summen-salden/${year}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Löschen fehlgeschlagen');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: summenSaldenKey(year) });
      queryClient.invalidateQueries({ queryKey: SUMMEN_SALDEN_YEARS_KEY });
      toast({ title: 'Gelöscht', description: `Daten für ${year} wurden gelöscht.` });
    },
  });

  // Filtered entries
  const filtered = entries.filter(e => {
    const matchSearch = search === '' ||
      e.konto.includes(search) ||
      e.beschriftung.toLowerCase().includes(search.toLowerCase());
    const matchKlasse = filterKlasse === 'all' || e.konto.startsWith(filterKlasse);
    return matchSearch && matchKlasse;
  });

  // Group by Kontenklasse
  const grouped = filtered.reduce<Record<string, SummenSaldenEntry[]>>((acc, e) => {
    const k = kontoKlasse(e.konto);
    if (!acc[k]) acc[k] = [];
    acc[k].push(e);
    return acc;
  }, {});

  // Lookup für Vergleichsjahr
  const compareMap = new Map(compareEntries.map(e => [`${e.konto}-${e.sub}`, e]));

  const yearOptions = Array.from(new Set([
    ...availableYears,
    currentYear - 1,
    currentYear,
  ])).sort((a, b) => b - a);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Kontenübersicht</h2>
            <p className="text-muted-foreground mt-1">
              Anfangsbestände und Jahressalden aus der Summen-/Saldenliste
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={compareYear ? String(compareYear) : 'none'}
              onValueChange={v => setCompareYear(v === 'none' ? null : Number(v))}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Vergleichsjahr" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Kein Vergleich</SelectItem>
                {yearOptions.filter(y => y !== year).map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <label className="cursor-pointer">
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate(f); e.target.value = ''; }}
              />
              <Button variant="outline" asChild disabled={uploadMutation.isPending}>
                <span>
                  {uploadMutation.isPending
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    : <Upload className="w-4 h-4 mr-2" />}
                  PDF hochladen
                </span>
              </Button>
            </label>

            {entries.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => { if (confirm(`Alle Konten für ${year} löschen?`)) deleteMutation.mutate(); }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Filter */}
        {entries.length > 0 && (
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Kontonummer oder Bezeichnung..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterKlasse} onValueChange={setFilterKlasse}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Alle Kontenklassen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Klassen</SelectItem>
                {Object.entries(KONTO_KLASSEN).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{k} – {label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : entries.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Keine Daten für {year}</h3>
              <p className="text-muted-foreground mb-4">
                Lade die Summen-/Saldenliste als PDF hoch (DATEV Kanzlei-Rechnungswesen).
              </p>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate(f); e.target.value = ''; }}
                />
                <Button asChild disabled={uploadMutation.isPending}>
                  <span>
                    {uploadMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    PDF hochladen
                  </span>
                </Button>
              </label>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([klasse, items]) => (
              <Card key={klasse}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>{klasse}</span>
                    <Badge variant="secondary">{items.length} Konten</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground w-20">Konto</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Bezeichnung</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                            EB {year}
                          </th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                            Saldo {year}
                          </th>
                          {compareYear && (
                            <>
                              <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                                EB {compareYear}
                              </th>
                              <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                                Saldo {compareYear}
                              </th>
                            </>
                          )}
                          {!compareYear && (
                            <th className="text-right px-4 py-2 font-medium text-muted-foreground w-32">
                              Veränderung
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {items.map((e, i) => {
                          const eb = e.ebWert ?? 0;
                          const sal = e.saldo ?? 0;
                          const diff = sal - eb;
                          const cmp = compareMap.get(`${e.konto}-${e.sub}`);

                          return (
                            <tr key={i} className="hover:bg-muted/20">
                              <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                                {e.konto}{e.sub !== '0' ? `.${e.sub}` : ''}
                              </td>
                              <td className="px-4 py-2">{e.beschriftung}</td>
                              <td className="px-4 py-2 text-right tabular-nums">
                                {eb > 0 ? (
                                  <span className={e.ebSeite === 'H' ? 'text-red-600 dark:text-red-400' : ''}>
                                    {formatCurrency(eb)}
                                    {e.ebSeite && <span className="text-xs text-muted-foreground ml-1">{e.ebSeite}</span>}
                                  </span>
                                ) : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums font-medium">
                                {sal > 0 ? (
                                  <span className={e.saldoSeite === 'H' ? 'text-red-600 dark:text-red-400' : ''}>
                                    {formatCurrency(sal)}
                                    {e.saldoSeite && <span className="text-xs text-muted-foreground ml-1">{e.saldoSeite}</span>}
                                  </span>
                                ) : <span className="text-muted-foreground">0,00</span>}
                              </td>
                              {compareYear && cmp ? (
                                <>
                                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                                    {cmp.ebWert ? formatCurrency(cmp.ebWert) : '—'}
                                  </td>
                                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                                    {cmp.saldo ? formatCurrency(cmp.saldo) : '—'}
                                  </td>
                                </>
                              ) : compareYear ? (
                                <><td className="px-4 py-2 text-right text-muted-foreground">—</td><td className="px-4 py-2 text-right text-muted-foreground">—</td></>
                              ) : (
                                <td className="px-4 py-2 text-right tabular-nums">
                                  {diff !== 0 ? (
                                    <span className={`flex items-center justify-end gap-1 ${diff > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                      {diff > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                      {formatCurrency(Math.abs(diff))}
                                    </span>
                                  ) : <span className="text-muted-foreground">—</span>}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
