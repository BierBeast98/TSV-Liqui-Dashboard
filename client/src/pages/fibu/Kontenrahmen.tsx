import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search, BookOpen } from "lucide-react";
import { useMemo, useState } from "react";
import type { FibuAccount } from "@shared/schema";
import { useFibuAccounts } from "@/hooks/use-fibu-journal";

const FISCAL_AREA_LABEL: Record<FibuAccount["fiscalArea"], string> = {
  ideell: "Ideell",
  vermoegensverwaltung: "Vermögensverwaltung",
  zweckbetrieb: "Zweckbetrieb",
  wirtschaftlich: "Wirtschaftlich",
  neutral: "—",
};

const ACCOUNT_TYPE_LABEL: Record<FibuAccount["accountType"], string> = {
  asset: "Aktiva",
  liability: "Passiva",
  equity: "Eigenkapital",
  income: "Ertrag",
  expense: "Aufwand",
  neutral: "Neutral",
};

export default function FibuKontenrahmen() {
  const { data: accounts = [], isLoading, error } = useFibuAccounts();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) => a.konto.includes(q) || a.name.toLowerCase().includes(q),
    );
  }, [accounts, search]);

  const stats = useMemo(() => {
    const byType = new Map<string, number>();
    for (const a of accounts) {
      byType.set(a.accountType, (byType.get(a.accountType) ?? 0) + 1);
    }
    return {
      total: accounts.length,
      income: byType.get("income") ?? 0,
      expense: byType.get("expense") ?? 0,
      balanceSheet: accounts.filter((a) => a.isBalanceSheet).length,
    };
  }, [accounts]);

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <BookOpen className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold font-display">FiBu — Kontenrahmen</h1>
            <p className="text-sm text-muted-foreground">
              SKR49-Kontenstamm der Schatten-Buchhaltung (read-only)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Konten gesamt</CardTitle></CardHeader>
            <CardContent><span className="text-2xl font-bold">{stats.total}</span></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Erträge</CardTitle></CardHeader>
            <CardContent><span className="text-2xl font-bold text-emerald-600">{stats.income}</span></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Aufwendungen</CardTitle></CardHeader>
            <CardContent><span className="text-2xl font-bold text-rose-600">{stats.expense}</span></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Bilanzkonten</CardTitle></CardHeader>
            <CardContent><span className="text-2xl font-bold text-blue-600">{stats.balanceSheet}</span></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle>Konten</CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Konto oder Name filtern…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="flex items-center gap-2 text-muted-foreground py-8">
                <Loader2 className="w-4 h-4 animate-spin" /> Lade Konten…
              </div>
            )}
            {error && (
              <div className="text-rose-600 py-4">
                Fehler: {(error as Error).message}
              </div>
            )}
            {!isLoading && !error && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2 pr-3">Konto</th>
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">Klasse</th>
                      <th className="py-2 pr-3">Typ</th>
                      <th className="py-2 pr-3">Fiskalbereich</th>
                      <th className="py-2 pr-3">Bilanz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a) => (
                      <tr key={a.konto} className="border-b hover:bg-muted/30">
                        <td className="py-2 pr-3 font-mono">{a.konto}</td>
                        <td className="py-2 pr-3">{a.name}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{a.class}</td>
                        <td className="py-2 pr-3">
                          <Badge variant="outline">{ACCOUNT_TYPE_LABEL[a.accountType]}</Badge>
                        </td>
                        <td className="py-2 pr-3">{FISCAL_AREA_LABEL[a.fiscalArea]}</td>
                        <td className="py-2 pr-3">{a.isBalanceSheet ? "✓" : ""}</td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-muted-foreground">
                          Keine Konten gefunden.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
