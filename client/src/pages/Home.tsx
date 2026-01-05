import { Layout } from "@/components/Layout";
import { useDashboardStats, useDashboardCharts } from "@/hooks/use-dashboard";
import { StatCard } from "@/components/StatCard";
import { 
  Euro, 
  TrendingUp, 
  TrendingDown, 
  Wallet,
  Loader2,
  PieChart as PieChartIcon,
  Filter,
  X
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import type { Account } from "@shared/schema";

interface TransactionWithDetails {
  id: number;
  date: Date;
  amount: number;
  description: string;
  categoryId: number | null;
  accountId: number | null;
  account: string | null;
  recurring: boolean | null;
  hash: string | null;
  createdAt: Date | null;
  categoryName?: string | null;
  categoryType?: string | null;
  accountName?: string | null;
}
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useYear } from "@/contexts/YearContext";

interface DrillDownData {
  month: string;
  type: "income" | "expenses" | "all";
}

export default function Home() {
  const { selectedYear: year, setSelectedYear: setYear } = useYear();
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [drillDown, setDrillDown] = useState<DrillDownData | null>(null);
  
  const { data: accounts } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });
  
  const { data: stats, isLoading: statsLoading } = useDashboardStats({ 
    year, 
    account: accountFilter !== "all" ? accountFilter : undefined 
  });
  const { data: charts, isLoading: chartsLoading } = useDashboardCharts({ 
    year, 
    account: accountFilter !== "all" ? accountFilter : undefined 
  });

  const buildTransactionsUrl = () => {
    const params = new URLSearchParams();
    params.set("year", String(year));
    if (accountFilter !== "all") {
      params.set("account", accountFilter);
    }
    return `/api/transactions?${params.toString()}`;
  };
  
  const { data: drillDownTransactions, isLoading: drillDownLoading } = useQuery<TransactionWithDetails[]>({
    queryKey: ["/api/transactions", year, accountFilter],
    queryFn: async () => {
      const res = await fetch(buildTransactionsUrl(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    enabled: !!drillDown,
  });

  const filteredTransactions = drillDownTransactions?.filter(tx => {
    if (!drillDown) return false;
    const txDate = new Date(tx.date);
    const txMonth = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
    if (txMonth !== drillDown.month) return false;
    
    if (drillDown.type === "income") return tx.amount > 0;
    if (drillDown.type === "expenses") return tx.amount < 0;
    return true;
  }) || [];

  const getMonthName = (monthStr: string) => {
    const [y, m] = monthStr.split('-');
    const date = new Date(Number(y), Number(m) - 1);
    return date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  };

  const handleBarClick = (data: any, type: "income" | "expenses") => {
    if (data && data.activePayload && data.activePayload[0]) {
      const monthData = data.activePayload[0].payload;
      const monthKey = charts?.incomeVsExpenses.find(
        (item: any) => item.month === monthData.month
      );
      if (monthKey) {
        const monthIndex = charts?.incomeVsExpenses.indexOf(monthKey);
        if (monthIndex !== undefined && monthIndex >= 0) {
          const fullMonth = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
          setDrillDown({ month: fullMonth, type });
        }
      }
    }
  };

  const COLORS = ['#0ea5e9', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e', '#f97316'];

  if (statsLoading || chartsLoading) {
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
            <h2 className="text-3xl font-bold font-display tracking-tight text-foreground">Finanzübersicht</h2>
            <p className="text-muted-foreground mt-1">Willkommen zurück. Hier ist die Zusammenfassung.</p>
          </div>
          <div className="flex gap-2">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[120px] rounded-lg">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {[2023, 2024, 2025].map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger className="w-[200px] rounded-lg" data-testid="select-account-filter">
                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Konto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Konten</SelectItem>
                {accounts?.map((acc) => (
                  <SelectItem key={acc.id} value={acc.iban} data-testid={`select-account-${acc.id}`}>
                    {acc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <StatCard
            title="Anfangssaldo"
            value={formatCurrency(stats?.openingBalance || 0)}
            icon={Wallet}
            description={`Jahresbeginn ${year}`}
          />
          <StatCard
            title="Kassenbestand"
            value={formatCurrency(stats?.cashPosition || 0)}
            icon={Wallet}
            className="border-primary/20 bg-primary/5"
            description="Aktueller Stand"
          />
          <StatCard
            title="Einnahmen"
            value={formatCurrency(stats?.totalIncome || 0)}
            icon={TrendingUp}
            trend="up"
            description="Summe Zuflüsse"
          />
          <StatCard
            title="Ausgaben"
            value={formatCurrency(stats?.totalExpenses || 0)}
            icon={TrendingDown}
            trend="down"
            description="Summe Abflüsse"
          />
          <StatCard
            title="Cashflow"
            value={formatCurrency(stats?.cashFlow || 0)}
            icon={Euro}
            trend={stats?.cashFlow && stats.cashFlow >= 0 ? "up" : "down"}
            description="Einnahmen - Ausgaben"
            className={stats?.cashFlow && stats.cashFlow < 0 ? "border-red-200 bg-red-50 dark:bg-red-900/10" : "border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10"}
          />
        </div>

        {/* Charts Section 1 */}
        <div className="grid gap-4 md:grid-cols-7">
          <Card className="col-span-4 rounded-xl shadow-sm border-border/60">
            <CardHeader>
              <CardTitle>Einnahmen vs Ausgaben</CardTitle>
              <CardDescription>Klicken Sie auf einen Balken für Details</CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={charts?.incomeVsExpenses}
                    onClick={(data) => {
                      if (data && data.activeTooltipIndex !== undefined) {
                        const monthIndex = data.activeTooltipIndex;
                        const fullMonth = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
                        setDrillDown({ month: fullMonth, type: "all" });
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                    <XAxis 
                      dataKey="month" 
                      stroke="#888888" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                    />
                    <YAxis
                      stroke="#888888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `€${value}`}
                    />
                    <Tooltip 
                      cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Bar 
                      dataKey="income" 
                      name="Einnahmen" 
                      fill="hsl(var(--primary))" 
                      radius={[4, 4, 0, 0]} 
                    />
                    <Bar 
                      dataKey="expenses" 
                      name="Ausgaben" 
                      fill="hsl(var(--destructive))" 
                      radius={[4, 4, 0, 0]} 
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-3 rounded-xl shadow-sm border-border/60">
            <CardHeader>
              <CardTitle>Kategorien-Verteilung</CardTitle>
              <CardDescription>Wohin fließt das Geld</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={charts?.categoryDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {charts?.categoryDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} 
                      formatter={(value: number) => formatCurrency(value)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                {charts?.categoryDistribution.slice(0, 6).map((entry, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="truncate text-muted-foreground">{entry.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section 2 */}
        <Card className="rounded-xl shadow-sm border-border/60">
            <CardHeader>
              <CardTitle>Kontostand-Verlauf</CardTitle>
              <CardDescription>Entwicklung des Kontostands über die Zeit</CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={charts?.balanceOverTime}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#888888" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(value) => new Date(value).toLocaleDateString('de-DE', { month: 'short', day: 'numeric' })}
                    />
                    <YAxis
                      stroke="#888888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `€${value}`}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      labelFormatter={(value) => new Date(value).toLocaleDateString('de-DE')}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="balance" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
      </div>

      {/* Drill-Down Dialog */}
      <Dialog open={!!drillDown} onOpenChange={(open) => !open && setDrillDown(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-4">
              <span>
                Buchungen {drillDown && getMonthName(drillDown.month)}
                {drillDown?.type === "income" && " - Einnahmen"}
                {drillDown?.type === "expenses" && " - Ausgaben"}
              </span>
            </DialogTitle>
            <DialogDescription>
              {filteredTransactions.length} Buchungen gefunden
              {drillDown?.type === "all" && (
                <span className="ml-2">
                  (Einnahmen: {formatCurrency(filteredTransactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0))}, 
                  Ausgaben: {formatCurrency(Math.abs(filteredTransactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)))})
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex gap-2 mb-4">
            <Button 
              variant={drillDown?.type === "all" ? "default" : "outline"} 
              size="sm"
              onClick={() => drillDown && setDrillDown({ ...drillDown, type: "all" })}
              data-testid="button-filter-all"
            >
              Alle
            </Button>
            <Button 
              variant={drillDown?.type === "income" ? "default" : "outline"} 
              size="sm"
              onClick={() => drillDown && setDrillDown({ ...drillDown, type: "income" })}
              data-testid="button-filter-income"
            >
              Nur Einnahmen
            </Button>
            <Button 
              variant={drillDown?.type === "expenses" ? "default" : "outline"} 
              size="sm"
              onClick={() => drillDown && setDrillDown({ ...drillDown, type: "expenses" })}
              data-testid="button-filter-expenses"
            >
              Nur Ausgaben
            </Button>
          </div>

          <ScrollArea className="h-[50vh]">
            {drillDownLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                Keine Buchungen gefunden
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTransactions
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((tx) => (
                  <div 
                    key={tx.id} 
                    className="flex items-start justify-between gap-4 p-3 rounded-lg border bg-card hover-elevate"
                    data-testid={`row-transaction-${tx.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {new Date(tx.date).toLocaleDateString('de-DE')}
                        </span>
                        {tx.categoryName && (
                          <Badge variant="secondary" className="text-xs">
                            {tx.categoryName}
                          </Badge>
                        )}
                        {tx.accountName && (
                          <Badge variant="outline" className="text-xs">
                            {tx.accountName}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {tx.description}
                      </p>
                    </div>
                    <div className={`text-sm font-semibold whitespace-nowrap ${tx.amount > 0 ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-500'}`}>
                      {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
