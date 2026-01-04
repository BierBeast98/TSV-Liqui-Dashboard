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
  Filter
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

export default function Home() {
  const [year, setYear] = useState<number>(2024);
  const [accountFilter, setAccountFilter] = useState<string>("all");
  
  const { data: stats, isLoading: statsLoading } = useDashboardStats({ 
    year, 
    account: accountFilter !== "all" ? accountFilter : undefined 
  });
  const { data: charts, isLoading: chartsLoading } = useDashboardCharts({ 
    year, 
    account: accountFilter !== "all" ? accountFilter : undefined 
  });

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
            <h2 className="text-3xl font-bold font-display tracking-tight text-foreground">Dashboard Overview</h2>
            <p className="text-muted-foreground mt-1">Welcome back. Here's your financial summary.</p>
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
              <SelectTrigger className="w-[180px] rounded-lg">
                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Konto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Konten</SelectItem>
                <SelectItem value="Hauptkonto">Hauptkonto</SelectItem>
                <SelectItem value="Sparkonto">Sparkonto</SelectItem>
                <SelectItem value="Handkasse">Handkasse</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Current Balance"
            value={formatCurrency(stats?.currentBalance || 0)}
            icon={Wallet}
            className="border-primary/20 bg-primary/5"
            description="Total available funds"
          />
          <StatCard
            title="Total Income (YTD)"
            value={formatCurrency(stats?.totalIncome || 0)}
            icon={TrendingUp}
            trend="up"
            trendValue="+12%" // Ideally dynamic
            description="vs last year"
          />
          <StatCard
            title="Total Expenses (YTD)"
            value={formatCurrency(stats?.totalExpenses || 0)}
            icon={TrendingDown}
            trend="down"
            trendValue="+4%"
            description="vs last year"
          />
          <StatCard
            title="Net Result"
            value={formatCurrency(stats?.netResult || 0)}
            icon={Euro}
            trend={stats?.netResult && stats.netResult >= 0 ? "up" : "down"}
            description="Income - Expenses"
            className={stats?.netResult && stats.netResult < 0 ? "border-red-200 bg-red-50 dark:bg-red-900/10" : "border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10"}
          />
        </div>

        {/* Charts Section 1 */}
        <div className="grid gap-4 md:grid-cols-7">
          <Card className="col-span-4 rounded-xl shadow-sm border-border/60">
            <CardHeader>
              <CardTitle>Income vs Expenses</CardTitle>
              <CardDescription>Monthly comparison for the current year</CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts?.incomeVsExpenses}>
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
                      cursor={{ fill: 'transparent' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Bar dataKey="income" name="Income" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name="Expenses" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-3 rounded-xl shadow-sm border-border/60">
            <CardHeader>
              <CardTitle>Category Distribution</CardTitle>
              <CardDescription>Where your money goes</CardDescription>
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
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
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
              <CardTitle>Balance Trend</CardTitle>
              <CardDescription>Account balance evolution over time</CardDescription>
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
                      tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
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
                      labelFormatter={(value) => new Date(value).toLocaleDateString()}
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
    </Layout>
  );
}
