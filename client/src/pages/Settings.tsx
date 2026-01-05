import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Wallet } from "lucide-react";
import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";
import type { Account } from "@shared/schema";

interface AccountBalance {
  id: number;
  accountId: number;
  year: number;
  openingBalance: number;
  accountName: string;
  iban: string;
}

export default function Settings() {
  const { toast } = useToast();
  const [year, setYear] = useState<number>(2024);
  const [balanceInputs, setBalanceInputs] = useState<Record<number, string>>({});

  const { data: accounts, isLoading: accountsLoading } = useQuery<Account[]>({
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

  const saveMutation = useMutation({
    mutationFn: async ({ accountId, openingBalance }: { accountId: number; openingBalance: number }) => {
      return apiRequest("POST", "/api/account-balances", { accountId, year, openingBalance });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/account-balances", year] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Gespeichert",
        description: "Der Anfangssaldo wurde aktualisiert.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Konnte den Saldo nicht speichern.",
        variant: "destructive",
      });
    },
  });

  const handleSave = (accountId: number) => {
    const value = parseFloat(balanceInputs[accountId] || "0");
    if (!isNaN(value)) {
      saveMutation.mutate({ accountId, openingBalance: value });
    }
  };

  const handleInputChange = (accountId: number, value: string) => {
    setBalanceInputs((prev) => ({
      ...prev,
      [accountId]: value,
    }));
  };

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
            <h2 className="text-3xl font-bold font-display tracking-tight text-foreground">
              Einstellungen
            </h2>
            <p className="text-muted-foreground mt-1">
              Anfangssalden und Kontoverwaltung
            </p>
          </div>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[120px]" data-testid="select-year">
              <SelectValue placeholder="Jahr" />
            </SelectTrigger>
            <SelectContent>
              {[2023, 2024, 2025].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              Anfangssalden {year}
            </CardTitle>
            <CardDescription>
              Legen Sie den Kontostand zu Jahresbeginn für jedes Konto fest. Dies wird für die Berechnung des Kassenbestands verwendet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!accounts || accounts.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Keine Konten vorhanden. Importieren Sie zuerst Buchungen um Konten anzulegen.
              </p>
            ) : (
              <div className="space-y-4">
                {accounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border bg-card"
                    data-testid={`account-balance-row-${account.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{account.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{account.iban}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`balance-${account.id}`} className="sr-only">
                        Anfangssaldo
                      </Label>
                      <div className="relative">
                        <Input
                          id={`balance-${account.id}`}
                          type="number"
                          step="0.01"
                          value={balanceInputs[account.id] || "0"}
                          onChange={(e) => handleInputChange(account.id, e.target.value)}
                          className="w-[150px] pr-8"
                          data-testid={`input-balance-${account.id}`}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          EUR
                        </span>
                      </div>
                      <Button
                        size="icon"
                        onClick={() => handleSave(account.id)}
                        disabled={saveMutation.isPending}
                        data-testid={`button-save-${account.id}`}
                      >
                        {saveMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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
                  <span>
                    {formatCurrency(balances.reduce((sum, b) => sum + (b.openingBalance || 0), 0))}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
