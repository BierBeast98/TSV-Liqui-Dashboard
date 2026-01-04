import { Layout } from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useState } from "react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from "recharts";

interface FiscalAreaSummary {
  name: string;
  label: string;
  income: number;
  expenses: number;
  net: number;
  categories: { name: string; amount: number; type: string }[];
}

interface FiscalAreaReport {
  year: number;
  areas: FiscalAreaSummary[];
  totalIncome: number;
  totalExpenses: number;
  totalNet: number;
}

const AREA_COLORS: Record<string, string> = {
  ideell: 'hsl(var(--primary))',
  vermoegensverwaltung: 'hsl(210, 80%, 55%)',
  zweckbetrieb: 'hsl(142, 70%, 45%)',
  wirtschaftlich: 'hsl(38, 90%, 50%)'
};

export default function EuerReport() {
  const [year, setYear] = useState<number>(2024);

  const { data: report, isLoading } = useQuery<FiscalAreaReport>({
    queryKey: ['/api/report/euer', year],
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="flex h-[80vh] items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" data-testid="loader-euer" />
        </div>
      </Layout>
    );
  }

  const chartData = report?.areas.map(area => ({
    name: area.label.split('.')[0] + '.',
    fullName: area.label,
    income: area.income,
    expenses: area.expenses,
    net: area.net
  })) || [];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold font-display tracking-tight text-foreground" data-testid="text-euer-title">
              Einnahmen-Überschussrechnung
            </h2>
            <p className="text-muted-foreground mt-1">
              Zusammenfassung nach den 4 Tätigkeitsbereichen gem. EÜR
            </p>
          </div>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[120px] rounded-lg" data-testid="select-year">
              <SelectValue placeholder="Jahr" />
            </SelectTrigger>
            <SelectContent>
              {[2023, 2024, 2025].map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card className="rounded-xl shadow-sm border-border/60">
          <CardHeader>
            <CardTitle>Übersicht nach Tätigkeitsbereichen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
                  <XAxis 
                    type="number"
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(value) => formatCurrency(value)}
                  />
                  <YAxis 
                    type="category"
                    dataKey="name" 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    formatter={(value: number) => formatCurrency(value)}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  />
                  <Bar dataKey="income" name="Einnahmen" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="expenses" name="Ausgaben" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {report?.areas.map((area) => (
            <Card key={area.name} className="rounded-xl shadow-sm border-border/60" data-testid={`card-area-${area.name}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center justify-between gap-2">
                  <span>{area.label}</span>
                  <span className={`text-base font-semibold flex items-center gap-1 ${area.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {area.net >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    {formatCurrency(area.net)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                    <div className="text-xs text-muted-foreground mb-1">Einnahmen</div>
                    <div className="text-lg font-semibold text-green-700 dark:text-green-400" data-testid={`text-income-${area.name}`}>
                      {formatCurrency(area.income)}
                    </div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
                    <div className="text-xs text-muted-foreground mb-1">Ausgaben</div>
                    <div className="text-lg font-semibold text-red-700 dark:text-red-400" data-testid={`text-expenses-${area.name}`}>
                      {formatCurrency(area.expenses)}
                    </div>
                  </div>
                </div>
                
                {area.categories.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Kategorien</div>
                    <div className="space-y-1 max-h-[150px] overflow-y-auto">
                      {area.categories.map((cat, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm py-1 border-b border-border/40 last:border-0">
                          <span className="text-muted-foreground truncate mr-2">{cat.name}</span>
                          <span className={`font-medium tabular-nums ${cat.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {cat.type === 'income' ? '+' : '-'}{formatCurrency(cat.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {area.categories.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    Keine Buchungen in diesem Bereich
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="rounded-xl shadow-sm border-border/60 bg-muted/30">
          <CardContent className="pt-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Gesamteinnahmen</div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-total-income">
                  {formatCurrency(report?.totalIncome || 0)}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Gesamtausgaben</div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="text-total-expenses">
                  {formatCurrency(report?.totalExpenses || 0)}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Jahresergebnis</div>
                <div className={`text-2xl font-bold flex items-center justify-center gap-2 ${(report?.totalNet || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} data-testid="text-total-net">
                  {(report?.totalNet || 0) >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                  {formatCurrency(report?.totalNet || 0)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
