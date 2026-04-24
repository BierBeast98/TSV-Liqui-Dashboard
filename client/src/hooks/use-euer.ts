import { useQuery } from "@tanstack/react-query";

export interface FiscalAreaSummary {
  name: string;
  label: string;
  income: number;
  expenses: number;
  net: number;
  categories?: { name: string; amount: number; type: string }[];
}

export interface FiscalAreaReport {
  year: number;
  source: "pdf" | "transactions" | "none";
  sourceFileName?: string;
  uploadedAt?: string;
  areas: FiscalAreaSummary[];
  totalIncome: number;
  totalExpenses: number;
  totalNet: number;
}

export interface EuerLineItem {
  id: number;
  fiscalArea: string;
  type: string;
  accountNumber: string;
  description: string;
  amount: number;
}

export const euerReportKey = (year: number | null | undefined) =>
  ["/api/report/euer", year] as const;
export const euerItemsKey = (
  year: number | null | undefined,
  fiscalArea?: string | null,
) =>
  fiscalArea
    ? (["/api/euer-reports", year, "items", fiscalArea] as const)
    : (["/api/euer-reports", year, "items"] as const);

export function useEuerReport(year: number | null | undefined, options?: { enabled?: boolean }) {
  return useQuery<FiscalAreaReport>({
    queryKey: euerReportKey(year),
    queryFn: async () => {
      const res = await fetch(`/api/report/euer?year=${year}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch report");
      return res.json();
    },
    enabled: (options?.enabled ?? true) && !!year,
  });
}

export function useEuerItems(
  year: number | null | undefined,
  fiscalArea?: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery<EuerLineItem[]>({
    queryKey: euerItemsKey(year, fiscalArea),
    queryFn: async () => {
      if (!year) return [];
      const url = fiscalArea
        ? `/api/euer-reports/${year}/items?fiscalArea=${fiscalArea}`
        : `/api/euer-reports/${year}/items`;
      const res = await fetch(url, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: (options?.enabled ?? true) && !!year,
  });
}
