import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Wallet, RefreshCw, CheckCircle2, AlertTriangle, Pencil, Trash2, ArrowRightLeft, Settings2, Download } from "lucide-react";
import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";
import type { AccountWithTxCount } from "@shared/schema";

interface AccountBalance {
  id: number;
  accountId: number;
  year: number;
  openingBalance: number;
  accountName: string;
  iban: string;
}

interface SyncResult {
  synced: { accountId: number; accountName: string; datevKonto: string; amount: number }[];
  skipped: { accountName: string; reason: string }[];
}

export default function Settings() {
  const { toast } = useToast();
  const [year, setYear] = useState<number>(2024);
  const [balanceInputs, setBalanceInputs] = useState<Record<number, string>>({});
  const [datevInputs, setDatevInputs] = useState<Record<number, string>>({});
  const [syncSourceYear, setSyncSourceYear] = useState<number | null>(null);
  const [syncTargetYear, setSyncTargetYear] = useState<number | null>(null);
  const [syncPreview, setSyncPreview] = useState<SyncResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Kontoverwaltung state
  const [renameInputs, setRenameInputs] = useState<Record<number, string>>({});
  const [mergeSource, setMergeSource] = useState<AccountWithTxCount | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState<AccountWithTxCount | null>(null);

  const { data: accounts, isLoading: accountsLoading } = useQuery<AccountWithTxCount[]>({
    queryKey: ["/api/accounts"],
  });

  const { data: balances, isLoading: balancesLoading } = useQuery<AccountBalance[]>({
    queryKey: ["/api/account-balances", year],
    queryFn: async () => {
      const res = await fetch(`/api/account-balances/${year}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch balances");
      return res.json();
    },
  });

  const { data: summenSaldenYears } = useQuery<number[]>({
    queryKey: ["/api/summen-salden/years"],
    queryFn: async () => {
      const res = await fetch("/api/summen-salden/years", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  useEffect(() => {
    if (balances && accounts) {
      const inputs: Record<number, string> = {};
      accounts.forEach((acc) => {
        const balance = balances.find((b) => b.accountId === acc.id);
        inputs[acc.id] = balance ? String(balance.openingBalance) : "0";
      });
      setBalanceInputs(inputs);
    }
  }, [balances, accounts]);

  useEffect(() => {
    if (accounts) {
      const datev: Record<number, string> = {};
      const rename: Record<number, string> = {};
      accounts.forEach((acc) => {
        datev[acc.id] = acc.datevKonto ?? "";
        rename[acc.id] = acc.name;
      });
      setDatevInputs(datev);
      setRenameInputs(rename);
    }
  }, [accounts]);

  useEffect(() => {
    if (summenSaldenYears && summenSaldenYears.length > 0 && syncSourceYear === null) {
      setSyncSourceYear(summenSaldenYears[0]);
      setSyncTargetYear(summenSaldenYears[0] + 1);
    }
  }, [summenSaldenYears, syncSourceYear]);

  useEffect(() => {
    if (!syncSourceYear || !syncTargetYear) return;
    let cancelled = false;
    setPreviewLoading(true);
    setSyncPreview(null);
    fetch(`/api/account-balances/sync-from-summen-salden`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ sourceYear: syncSourceYear, targetYear: syncTargetYear, previewOnly: true }),
    })
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setSyncPreview(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [syncSourceYear, syncTargetYear]);

  const saveMutation = useMutation({
    mutationFn: async ({ accountId, openingBalance, datevKonto }: { accountId: number; openingBalance: number; datevKonto: string }) => {
      await apiRequest("POST", "/api/account-balances", { accountId, year, openingBalance });
      await apiRequest("PATCH", `/api/accounts/${accountId}`, { datevKonto: datevKonto || null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/account-balances", year] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Gespeichert", description: "Saldo und DATEV-Konto wurden aktualisiert." });
    },
    onError: () => {
      toast({ title: "Fehler", description: "Konnte nicht speichern.", variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (): Promise<SyncResult> => {
      const res = await apiRequest("POST", "/api/account-balances/sync-from-summen-salden", {
        sourceYear: syncSourceYear,
        targetYear: syncTargetYear,
      });
      return res.json();
    },
    onSuccess: (data: SyncResult) => {
      queryClient.invalidateQueries({ queryKey: ["/api/account-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setSyncPreview(data);
      toast({
        title: `${data.synced.length} Konten synchronisiert`,
        description: data.skipped.length > 0 ? `${data.skipped.length} Konto(en) übersprungen.` : "Alle zugeordneten Konten wurden übernommen.",
      });
    },
    onError: () => {
      toast({ title: "Fehler", description: "Synchronisierung fehlgeschlagen.", variant: "destructive" });
    },
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) =>
      apiRequest("PATCH", `/api/accounts/${id}/rename`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      toast({ title: "Umbenannt", description: "Kontoname wurde aktualisiert." });
    },
    onError: () => toast({ title: "Fehler", description: "Umbenennen fehlgeschlagen.", variant: "destructive" }),
  });

  const mergeMutation = useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: number; targetId: number }) =>
      apiRequest("POST", `/api/accounts/${sourceId}/merge`, { targetId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/account-balances", year] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setMergeSource(null);
      setMergeTargetId("");
      toast({ title: "Zusammengeführt", description: "Alle Buchungen wurden übertragen." });
    },
    onError: () => toast({ title: "Fehler", description: "Zusammenführen fehlgeschlagen.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/accounts/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/account-balances", year] });
      setDeleteConfirm(null);
      toast({ title: "Gelöscht", description: "Konto wurde entfernt." });
    },
    onError: (e: any) => toast({ title: "Fehler", description: e?.message ?? "Löschen fehlgeschlagen.", variant: "destructive" }),
  });

  const importMutation = useMutation({
    mutationFn: async (importYear: number) => {
      const res = await fetch("/api/accounts/import-from-summen-salden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ year: importYear }),
      });
      if (!res.ok) throw new Error("Import fehlgeschlagen");
      return res.json() as Promise<{ created: any[]; skipped: string[] }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      if (data.created.length > 0) {
        toast({ title: `${data.created.length} Konten importiert`, description: data.created.map((a) => a.name).join(", ") });
      } else {
        toast({ title: "Keine neuen Konten", description: "Alle Saldenliste-Konten sind bereits vorhanden." });
      }
    },
    onError: () => toast({ title: "Fehler", description: "Import fehlgeschlagen.", variant: "destructive" }),
  });

  const handleSave = (accountId: number) => {
    const value = parseFloat(balanceInputs[accountId] || "0");
    if (!isNaN(value)) {
      saveMutation.mutate({ accountId, openingBalance: value, datevKonto: datevInputs[accountId] ?? "" });
    }
  };

  const mergeTarget = accounts?.find((a) => a.id === Number(mergeTargetId));

  if (accountsLoading || balancesLoading) {
    return (
      <Layout>
        <div className="flex h-[80vh] items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold font-display tracking-tight text-foreground">Einstellungen</h2>
            <p className="text-muted-foreground mt-1">Anfangssalden und Kontoverwaltung</p>
          </div>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Jahr" />
            </SelectTrigger>
            <SelectContent>
              {[2023, 2024, 2025, 2026].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ── Kontoverwaltung ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="w-5 h-5" />
                  Kontoverwaltung
                </CardTitle>
                <CardDescription className="mt-1">
                  Konten umbenennen, zusammenführen oder löschen. Beim Zusammenführen werden alle Buchungen auf das Zielkonto übertragen.
                </CardDescription>
              </div>
              {summenSaldenYears && summenSaldenYears.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={importMutation.isPending}
                  onClick={() => importMutation.mutate(summenSaldenYears[0])}
                >
                  {importMutation.isPending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    : <Download className="w-3.5 h-3.5 mr-1.5" />}
                  Aus Saldenliste importieren
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!accounts || accounts.length === 0 ? (
              <p className="text-muted-foreground text-sm">Keine Konten vorhanden.</p>
            ) : (
              <div className="space-y-2">
                {accounts.map((account) => (
                  <div key={account.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border bg-card">
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{account.name}</p>
                        <Badge variant={account.txCount > 0 ? "default" : "secondary"} className="text-xs shrink-0">
                          {account.txCount} Buchungen
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate font-mono">{account.iban}</p>
                    </div>

                    {/* Rename input */}
                    <div className="flex items-center gap-2">
                      <Input
                        value={renameInputs[account.id] ?? account.name}
                        onChange={(e) => setRenameInputs((prev) => ({ ...prev, [account.id]: e.target.value }))}
                        className="w-48 text-sm"
                        placeholder="Kontoname"
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => renameMutation.mutate({ id: account.id, name: renameInputs[account.id] ?? account.name })}
                        disabled={renameMutation.isPending || (renameInputs[account.id] ?? account.name) === account.name}
                        title="Umbenennen"
                      >
                        {renameMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                      </Button>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setMergeSource(account); setMergeTargetId(""); }}
                        title="Zusammenführen mit..."
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" />
                        Zuordnen
                      </Button>
                      {account.txCount === 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setDeleteConfirm(account)}
                          title="Löschen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Anfangssalden ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              Anfangssalden {year}
            </CardTitle>
            <CardDescription>
              Anfangsbestand zu Jahresbeginn und optionale Zuordnung zum DATEV-Konto (für automatische Synchronisierung).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!accounts || accounts.length === 0 ? (
              <p className="text-muted-foreground text-sm">Keine Konten vorhanden.</p>
            ) : (
              <div className="space-y-3">
                <div className="hidden sm:grid sm:grid-cols-[1fr_130px_130px_40px] gap-3 px-4 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <span>Konto</span>
                  <span>DATEV Konto</span>
                  <span>Anfangssaldo</span>
                  <span></span>
                </div>
                {accounts.map((account) => (
                  <div
                    key={account.id}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_130px_130px_40px] gap-3 items-center p-4 rounded-lg border bg-card"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{account.name}</p>
                      <p className="text-xs text-muted-foreground truncate font-mono">{account.iban}</p>
                    </div>
                    <div>
                      <Input
                        type="text"
                        placeholder="z.B. 1800"
                        value={datevInputs[account.id] ?? ""}
                        onChange={(e) => setDatevInputs((prev) => ({ ...prev, [account.id]: e.target.value }))}
                        className="w-full font-mono text-sm"
                      />
                    </div>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.01"
                        value={balanceInputs[account.id] || "0"}
                        onChange={(e) => setBalanceInputs((prev) => ({ ...prev, [account.id]: e.target.value }))}
                        className="w-full pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
                    </div>
                    <Button
                      size="icon"
                      onClick={() => handleSave(account.id)}
                      disabled={saveMutation.isPending}
                    >
                      {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Sync card ────────────────────────────────────────────────────── */}
        {summenSaldenYears && summenSaldenYears.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5" />
                Anfangssalden synchronisieren
              </CardTitle>
              <CardDescription>
                Endbestände aus der Summen-/Saldenliste als Anfangssaldo des Folgejahres übernehmen. Voraussetzung: DATEV-Konto oben eingetragen.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Quell-Jahr</span>
                  <Select
                    value={syncSourceYear ? String(syncSourceYear) : ""}
                    onValueChange={(v) => { const y = Number(v); setSyncSourceYear(y); setSyncTargetYear(y + 1); }}
                  >
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {summenSaldenYears.map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <span className="text-muted-foreground">→</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Ziel-Jahr</span>
                  <Select
                    value={syncTargetYear ? String(syncTargetYear) : ""}
                    onValueChange={(v) => setSyncTargetYear(Number(v))}
                  >
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[2024, 2025, 2026, 2027].map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {previewLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Vorschau wird geladen…
                </div>
              )}
              {syncPreview && !previewLoading && (
                <div className="rounded-lg border overflow-hidden text-sm">
                  {syncPreview.synced.length > 0 && (
                    <table className="w-full">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Konto</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground font-mono">DATEV</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">Endbestand {syncSourceYear}</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">→ Anfangssaldo {syncTargetYear}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {syncPreview.synced.map((row) => (
                          <tr key={row.accountId} className="border-t">
                            <td className="px-4 py-2 font-medium">{row.accountName}</td>
                            <td className="px-4 py-2 font-mono text-muted-foreground">{row.datevKonto}</td>
                            <td className="px-4 py-2 text-right">{formatCurrency(row.amount)}</td>
                            <td className="px-4 py-2 text-right">
                              <span className="inline-flex items-center gap-1 text-green-600">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {formatCurrency(row.amount)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {syncPreview.skipped.length > 0 && (
                    <div className="border-t px-4 py-3 bg-amber-50/50 dark:bg-amber-900/10 space-y-1">
                      {syncPreview.skipped.map((s, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span><strong>{s.accountName}:</strong> {s.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {syncPreview.synced.length === 0 && syncPreview.skipped.length === 0 && (
                    <p className="px-4 py-3 text-sm text-muted-foreground">
                      Keine Konten mit DATEV-Zuordnung gefunden. Tragen Sie oben die DATEV-Kontonummern ein.
                    </p>
                  )}
                </div>
              )}
              <Button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending || !syncPreview || syncPreview.synced.length === 0}
              >
                {syncMutation.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Wird synchronisiert…</>
                  : <><RefreshCw className="w-4 h-4 mr-2" />Synchronisieren</>}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Balance overview ─────────────────────────────────────────────── */}
        {balances && balances.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Übersicht Anfangssalden {year}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {balances.map((b) => (
                  <div key={b.id} className="flex justify-between items-center py-2 border-b last:border-0">
                    <span className="font-medium">{b.accountName}</span>
                    <span className={b.openingBalance >= 0 ? "text-emerald-600" : "text-red-600"}>
                      {formatCurrency(b.openingBalance)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2 font-bold">
                  <span>Gesamt</span>
                  <span>{formatCurrency(balances.reduce((sum, b) => sum + (b.openingBalance || 0), 0))}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Merge Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={!!mergeSource} onOpenChange={(o) => { if (!o) { setMergeSource(null); setMergeTargetId(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Konto zuordnen / zusammenführen</DialogTitle>
            <DialogDescription>
              Alle Buchungen von <strong>{mergeSource?.name}</strong> werden auf das Zielkonto übertragen. Das Quellkonto wird danach gelöscht.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Quellkonto</span>
                <Badge variant="default">{mergeSource?.txCount} Buchungen</Badge>
              </div>
              <p className="font-medium mt-1">{mergeSource?.name}</p>
              <p className="text-xs text-muted-foreground font-mono">{mergeSource?.iban}</p>
            </div>

            <div className="space-y-1.5">
              <Label>Zielkonto</Label>
              <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Konto auswählen…" />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.filter((a) => a.id !== mergeSource?.id).map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name} — {a.txCount} Buchungen
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {mergeTarget && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm space-y-1">
                <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Nicht rückgängig machbar
                </div>
                <p className="text-amber-700/80 dark:text-amber-400/80">
                  <strong>{mergeSource?.txCount}</strong> Buchungen werden von <em>{mergeSource?.name}</em> → <em>{mergeTarget.name}</em> übertragen. Danach wird <em>{mergeSource?.name}</em> gelöscht.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMergeSource(null); setMergeTargetId(""); }}>Abbrechen</Button>
            <Button
              disabled={!mergeTargetId || mergeMutation.isPending}
              onClick={() => mergeSource && mergeMutation.mutate({ sourceId: mergeSource.id, targetId: Number(mergeTargetId) })}
            >
              {mergeMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Wird zusammengeführt…</> : "Zusammenführen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ─────────────────────────────────────────── */}
      <Dialog open={!!deleteConfirm} onOpenChange={(o) => { if (!o) setDeleteConfirm(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Konto löschen</DialogTitle>
            <DialogDescription>
              <strong>{deleteConfirm?.name}</strong> wird dauerhaft gelöscht. Dieser Vorgang kann nicht rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Abbrechen</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
