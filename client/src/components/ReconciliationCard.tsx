import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, FileText, Info } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useReconciliation } from "@/hooks/use-reconciliation";

const TOLERANCE_EUR = 50;

function severity(deltaAbs: number): "ok" | "warn" | "bad" {
  if (deltaAbs <= TOLERANCE_EUR) return "ok";
  if (deltaAbs <= 500) return "warn";
  return "bad";
}

function DeltaCell({ value }: { value: number }) {
  const abs = Math.abs(value);
  const sev = severity(abs);
  const cls =
    sev === "ok"
      ? "text-muted-foreground"
      : sev === "warn"
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";
  const sign = value > 0 ? "+" : "";
  return (
    <span className={`font-medium ${cls}`}>
      {sign}
      {formatCurrency(value)}
    </span>
  );
}

export function ReconciliationCard({ year }: { year: number }) {
  const { data, isLoading } = useReconciliation(year);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Abgleich EÜR ↔ Buchungen</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Lade…</CardContent>
      </Card>
    );
  }

  if (!data) return null;

  if (!data.hasEuer) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Abgleich EÜR ↔ Buchungen</CardTitle>
          </div>
          <CardDescription>Für {year} liegt noch keine EÜR-PDF vor.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Sobald die EÜR für {year} hochgeladen ist, vergleicht diese Karte die
            Jahresabschluss-Werte (Wahrheit) mit den Summen aus den laufenden Buchungen
            und zeigt Abweichungen pro Tätigkeitsbereich.
          </span>
        </CardContent>
      </Card>
    );
  }

  const allOk = data.areas.every(a => !a.delta || Math.abs(a.delta.net) <= TOLERANCE_EUR);
  const totalDelta = data.areas.reduce((sum, a) => sum + (a.delta?.net ?? 0), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Abgleich EÜR ↔ Buchungen</CardTitle>
          </div>
          {allOk ? (
            <Badge variant="outline" className="text-green-700 border-green-300 dark:text-green-400 dark:border-green-700 gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Stimmig
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-700 gap-1">
              <AlertTriangle className="w-3 h-3" />
              Abweichungen
            </Badge>
          )}
        </div>
        <CardDescription>
          EÜR {year} ist die Wahrheit. Buchungen sind der operative Stand — Abweichungen weisen auf
          unvollständige Kategorisierung, fehlende Perioden oder Umbuchungen hin.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-2 font-normal">Bereich</th>
                <th className="py-2 px-2 font-normal text-right">EÜR Netto</th>
                <th className="py-2 px-2 font-normal text-right">Buchungen Netto</th>
                <th className="py-2 pl-2 font-normal text-right">Delta</th>
              </tr>
            </thead>
            <tbody>
              {data.areas.map(area => {
                const euerNet = area.euer ? area.euer.income - area.euer.expenses : null;
                const txNet = area.tx.income - area.tx.expenses;
                return (
                  <tr key={area.name} className="border-b last:border-b-0">
                    <td className="py-2 pr-2">
                      <div className="font-medium">{area.label.split(".")[0]}.</div>
                      <div className="text-xs text-muted-foreground">
                        {area.label.split(".").slice(1).join(".").trim()}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {euerNet !== null ? formatCurrency(euerNet) : "—"}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                      {formatCurrency(txNet)}
                    </td>
                    <td className="py-2 pl-2 text-right tabular-nums">
                      {area.delta ? <DeltaCell value={area.delta.net} /> : "—"}
                    </td>
                  </tr>
                );
              })}
              <tr className="font-semibold">
                <td className="py-2 pr-2">Gesamt</td>
                <td className="py-2 px-2 text-right tabular-nums">
                  {formatCurrency(
                    data.areas.reduce(
                      (sum, a) => sum + (a.euer ? a.euer.income - a.euer.expenses : 0),
                      0,
                    ),
                  )}
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                  {formatCurrency(
                    data.areas.reduce((sum, a) => sum + (a.tx.income - a.tx.expenses), 0),
                  )}
                </td>
                <td className="py-2 pl-2 text-right tabular-nums">
                  <DeltaCell value={totalDelta} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-xs text-muted-foreground flex items-start gap-2">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Toleranz für „stimmig": {formatCurrency(TOLERANCE_EUR)} Abweichung pro Bereich.
            Größere Differenzen prüfen: fehlen Kategorisierungen? Sind Interne Umbuchungen korrekt gekennzeichnet?
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
