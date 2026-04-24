import { useQuery } from "@tanstack/react-query";

export interface ReconcileArea {
  name: string;
  label: string;
  euer: { income: number; expenses: number } | null;
  tx: { income: number; expenses: number };
  delta: { income: number; expenses: number; net: number } | null;
}

export interface ReconcileResponse {
  year: number;
  hasEuer: boolean;
  sourceFileName?: string;
  uploadedAt?: string;
  areas: ReconcileArea[];
}

export function useReconciliation(year: number | null | undefined) {
  return useQuery<ReconcileResponse>({
    queryKey: ["/api/report/euer/reconcile", year],
    queryFn: async () => {
      const res = await fetch(`/api/report/euer/reconcile?year=${year}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch reconciliation");
      return res.json();
    },
    enabled: !!year,
  });
}
