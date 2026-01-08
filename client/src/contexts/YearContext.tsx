import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface YearContextType {
  selectedYear: number;
  setSelectedYear: (year: number) => void;
}

const YearContext = createContext<YearContextType | null>(null);

const STORAGE_KEY = 'app_selectedYear';

export function YearProvider({ children }: { children: ReactNode }) {
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? Number(saved) : new Date().getFullYear();
  });
  
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(selectedYear));
  }, [selectedYear]);
  
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
