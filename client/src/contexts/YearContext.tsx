import { type ReactNode } from "react";
import { FilterProvider, useFilter } from "./FilterContext";

/**
 * Compatibility shim over FilterContext. YearProvider is kept so existing
 * imports (App.tsx, useYear() callers) keep working; new code should use
 * FilterProvider + useFilter() directly.
 */

export function YearProvider({ children }: { children: ReactNode }) {
  return <FilterProvider>{children}</FilterProvider>;
}

export function useYear() {
  const { year, setYear } = useFilter();
  return { selectedYear: year, setSelectedYear: setYear };
}
