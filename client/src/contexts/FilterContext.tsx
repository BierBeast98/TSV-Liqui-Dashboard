import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useSearch } from "wouter";

interface FilterState {
  year: number;
  compareYear: number | null;
  selectedAccounts: number[];
}

interface FilterContextType extends FilterState {
  setYear: (year: number) => void;
  setCompareYear: (year: number | null) => void;
  setSelectedAccounts: (accounts: number[]) => void;
}

const FilterContext = createContext<FilterContextType | null>(null);

const STORAGE_KEY = "app_filterState";

function readFromStorage(): Partial<FilterState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      year: typeof parsed.year === "number" ? parsed.year : undefined,
      compareYear: parsed.compareYear === null || typeof parsed.compareYear === "number" ? parsed.compareYear : undefined,
      selectedAccounts: Array.isArray(parsed.selectedAccounts) ? parsed.selectedAccounts : undefined,
    };
  } catch {
    return {};
  }
}

function writeToStorage(state: FilterState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function parseNumberList(value: string | null): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map(v => parseInt(v.trim(), 10))
    .filter(n => !isNaN(n));
}

export function FilterProvider({ children }: { children: ReactNode }) {
  const stored = readFromStorage();
  const currentYear = new Date().getFullYear();

  const search = useSearch();
  const [, setLocation] = useLocation();

  const searchParams = useMemo(() => new URLSearchParams(search), [search]);

  const urlYear = searchParams.get("year");
  const urlCompareYear = searchParams.get("compareYear");
  const urlAccounts = searchParams.get("accounts");

  const [year, setYearState] = useState<number>(() => {
    if (urlYear && !isNaN(Number(urlYear))) return Number(urlYear);
    if (stored.year) return stored.year;
    return currentYear;
  });

  const [compareYear, setCompareYearState] = useState<number | null>(() => {
    if (urlCompareYear !== null) {
      if (urlCompareYear === "") return null;
      const n = Number(urlCompareYear);
      if (!isNaN(n)) return n;
    }
    return stored.compareYear ?? null;
  });

  const [selectedAccounts, setSelectedAccountsState] = useState<number[]>(() => {
    if (urlAccounts !== null) return parseNumberList(urlAccounts);
    return stored.selectedAccounts ?? [];
  });

  // Adopt URL changes when the user navigates with back/forward buttons.
  useEffect(() => {
    if (urlYear !== null && !isNaN(Number(urlYear))) {
      const n = Number(urlYear);
      if (n !== year) setYearState(n);
    }
    if (urlCompareYear !== null) {
      const n = urlCompareYear === "" ? null : Number(urlCompareYear);
      if (n !== compareYear) setCompareYearState(isNaN(n as number) ? null : n);
    }
    if (urlAccounts !== null) {
      const next = parseNumberList(urlAccounts);
      if (next.join(",") !== selectedAccounts.join(",")) setSelectedAccountsState(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlYear, urlCompareYear, urlAccounts]);

  // Persist to localStorage.
  useEffect(() => {
    writeToStorage({ year, compareYear, selectedAccounts });
  }, [year, compareYear, selectedAccounts]);

  const updateUrl = (updates: Partial<{ year: number; compareYear: number | null; selectedAccounts: number[] }>) => {
    const next = new URLSearchParams(search);
    if ("year" in updates && updates.year !== undefined) next.set("year", String(updates.year));
    if ("compareYear" in updates) {
      if (updates.compareYear === null) next.delete("compareYear");
      else if (updates.compareYear !== undefined) next.set("compareYear", String(updates.compareYear));
    }
    if ("selectedAccounts" in updates && updates.selectedAccounts !== undefined) {
      if (updates.selectedAccounts.length === 0) next.delete("accounts");
      else next.set("accounts", updates.selectedAccounts.join(","));
    }
    const qs = next.toString();
    const path = window.location.pathname;
    setLocation(qs ? `${path}?${qs}` : path, { replace: true });
  };

  const setYear = (y: number) => {
    setYearState(y);
    updateUrl({ year: y });
  };
  const setCompareYear = (y: number | null) => {
    setCompareYearState(y);
    updateUrl({ compareYear: y });
  };
  const setSelectedAccounts = (a: number[]) => {
    setSelectedAccountsState(a);
    updateUrl({ selectedAccounts: a });
  };

  return (
    <FilterContext.Provider
      value={{ year, compareYear, selectedAccounts, setYear, setCompareYear, setSelectedAccounts }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilter must be used within a FilterProvider");
  return ctx;
}
