import { useQuery } from "@tanstack/react-query";

export interface SummenSaldenEntry {
  id: number;
  year: number;
  konto: string;
  sub: string;
  beschriftung: string;
  ebWert: number | null;
  ebSeite: string | null;
  kumSoll: number | null;
  kumHaben: number | null;
  saldo: number | null;
  saldoSeite: string | null;
}

export interface LiquideMittelDetail {
  konto: string;
  sub: string;
  beschriftung: string;
  ebWert: number;
  ebSeite: string | null;
  saldo: number;
  saldoSeite: string | null;
}

export interface LiquideMittel {
  year: number;
  anfangsbestand: number;
  endbestand: number;
  veraenderung: number;
  details: LiquideMittelDetail[];
}

export const SUMMEN_SALDEN_YEARS_KEY = ["/api/summen-salden/years"] as const;
export const summenSaldenKey = (year: number | null | undefined) =>
  ["/api/summen-salden", year] as const;
export const liquideMittelKey = (year: number | null | undefined) =>
  ["/api/summen-salden", year, "liquide-mittel"] as const;

export function useSummenSaldenYears() {
  return useQuery<number[]>({
    queryKey: SUMMEN_SALDEN_YEARS_KEY,
    queryFn: async () => {
      const res = await fetch("/api/summen-salden/years", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

export function useSummenSalden(year: number | null | undefined) {
  return useQuery<SummenSaldenEntry[]>({
    queryKey: summenSaldenKey(year),
    queryFn: async () => {
      if (!year) return [];
      const res = await fetch(`/api/summen-salden/${year}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!year,
  });
}

export function useLiquideMittel(year: number | null | undefined) {
  return useQuery<LiquideMittel | null>({
    queryKey: liquideMittelKey(year),
    queryFn: async () => {
      if (!year) return null;
      const res = await fetch(`/api/summen-salden/${year}/liquide-mittel`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!year,
  });
}
