import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

export interface LiquiditySnapshot {
  year: number;
  bargeld: number;
  festgelder: number;
  darlehenZinslos: number;
  darlehen: number;
  source: "manual" | "auto";
}

interface Props {
  data: LiquiditySnapshot[];
  height?: number;
  highlightYears?: number[]; // z.B. [2024, 2025] – werden leicht hervorgehoben
}

const COLORS = {
  bargeld: "hsl(217 91% 60%)",        // sky-500
  festgelder: "hsl(160 84% 39%)",     // emerald-500
  darlehenZinslos: "hsl(215 14% 55%)",// slate-400
  darlehen: "hsl(346 77% 50%)",       // rose-500
  netto: "hsl(262 83% 58%)",          // violet-500
};

const compactFormatter = (v: number) =>
  new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 1 }).format(v);

export function LiquideMittelChart({ data, height = 340, highlightYears }: Props) {
  const rows = data.map(d => ({
    year: d.year,
    bargeld: d.bargeld,
    festgelder: d.festgelder,
    darlehenZinslos: d.darlehenZinslos,
    darlehen: d.darlehen,
    netto: d.bargeld + d.festgelder + d.darlehenZinslos + d.darlehen,
  }));

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        Keine Daten vorhanden. Neues Jahr anlegen, um zu starten.
      </div>
    );
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} stackOffset="sign" margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
          <XAxis
            dataKey="year"
            tick={({ x, y, payload }) => {
              const isHighlight = highlightYears?.includes(payload.value);
              return (
                <text x={x} y={y + 14} textAnchor="middle" fontSize={12}
                  fontWeight={isHighlight ? 700 : 400}
                  className={isHighlight ? "fill-foreground" : "fill-muted-foreground"}>
                  {payload.value}
                </text>
              );
            }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            tickFormatter={v => compactFormatter(v) + " €"}
            tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={70}
          />
          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
          <Tooltip
            formatter={(v: number, name: string) => [formatCurrency(v), name]}
            labelFormatter={(l) => `Jahr ${l}`}
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.5rem",
              fontSize: "0.85rem",
            }}
          />
          <Legend wrapperStyle={{ paddingTop: "8px", fontSize: "0.85rem" }} />
          <Bar dataKey="bargeld" name="Bargeld" stackId="liq" fill={COLORS.bargeld} radius={[0, 0, 0, 0]} />
          <Bar dataKey="festgelder" name="Festgelder" stackId="liq" fill={COLORS.festgelder} radius={[4, 4, 0, 0]} />
          <Bar dataKey="darlehenZinslos" name="Darlehen zinslos" stackId="liq" fill={COLORS.darlehenZinslos} radius={[0, 0, 0, 0]} />
          <Bar dataKey="darlehen" name="Darlehen" stackId="liq" fill={COLORS.darlehen} radius={[0, 0, 4, 4]} />
          <Line
            type="monotone" dataKey="netto" name="Netto-Saldo"
            stroke={COLORS.netto} strokeWidth={2.5}
            dot={{ r: 4, fill: COLORS.netto, strokeWidth: 0 }}
            activeDot={{ r: 6 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
