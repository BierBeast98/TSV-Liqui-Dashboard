import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  description?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  className?: string;
}

export function StatCard({ title, value, icon: Icon, description, trend, trendValue, className }: StatCardProps) {
  return (
    <Card className={`overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border-border/60 ${className}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-display tracking-tight">{value}</div>
        {(description || trendValue) && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            {trendValue && (
              <span className={`font-medium ${
                trend === 'up' ? 'text-emerald-500' : 
                trend === 'down' ? 'text-rose-500' : 'text-muted-foreground'
              }`}>
                {trendValue}
              </span>
            )}
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
