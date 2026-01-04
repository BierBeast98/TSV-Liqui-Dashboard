import { Layout } from "@/components/Layout";
import { useForecast } from "@/hooks/use-dashboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, TrendingUp, Target } from "lucide-react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";
import { Loader2 } from "lucide-react";

export default function Forecast() {
  const { data: forecast, isLoading } = useForecast();

  if (isLoading) {
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
        <div>
          <h2 className="text-3xl font-bold font-display tracking-tight">Financial Forecast</h2>
          <p className="text-muted-foreground mt-1">Projected balance until year-end based on recurring transactions.</p>
        </div>

        {forecast?.warning && (
          <Alert variant="destructive" className="bg-destructive/5 border-destructive/20 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Warning: Low Balance Projected</AlertTitle>
            <AlertDescription>
              {forecast.warning}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-2 rounded-xl shadow-sm border-border/60">
            <CardHeader>
              <CardTitle>Balance Projection</CardTitle>
              <CardDescription>Estimated account balance evolution</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={forecast?.data}>
                    <defs>
                      <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
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
                      labelFormatter={(label) => new Date(label).toLocaleDateString()}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(value: number) => [formatCurrency(value), "Projected Balance"]}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="balance" 
                      stroke="hsl(var(--primary))" 
                      fillOpacity={1} 
                      fill="url(#colorBalance)" 
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="rounded-xl border-border/60 shadow-md bg-primary text-primary-foreground overflow-hidden relative">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Target className="w-24 h-24" />
              </div>
              <CardHeader>
                <CardTitle className="text-primary-foreground/90 font-medium text-sm uppercase tracking-wider">Projected Year End</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold font-display">
                  {formatCurrency(forecast?.projectedYearEndBalance || 0)}
                </div>
                <p className="text-primary-foreground/70 mt-2 text-sm">
                  Estimated balance on Dec 31st based on current recurring income and expenses.
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-xl border-border/60">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Forecast Insight</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground/80 leading-relaxed">
                  Your balance is projected to <span className="font-semibold text-primary">{forecast?.projectedYearEndBalance && forecast.projectedYearEndBalance > 0 ? 'remain positive' : 'drop below zero'}</span> by the end of the year. 
                  Consider reviewing your recurring expenses to optimize your cash flow.
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <TrendingUp className="w-4 h-4" />
                  <span>Projections update automatically as you add transactions.</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
