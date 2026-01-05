import { createContext, useContext, useState, type ReactNode } from "react";

interface YearContextType {
  selectedYear: number;
  setSelectedYear: (year: number) => void;
}

const YearContext = createContext<YearContextType | null>(null);

export function YearProvider({ children }: { children: ReactNode }) {
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  
  return (
    <YearContext.Provider value={{ selectedYear, setSelectedYear }}>
      {children}
    </YearContext.Provider>
  );
}

export function useYear() {
  const context = useContext(YearContext);
  if (!context) {
    throw new Error("useYear must be used within a YearProvider");
  }
  return context;
}
