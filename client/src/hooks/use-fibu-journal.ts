import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FibuAccount, FibuJournalEntry, FibuJournalLine } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export type FibuJournalEntryWithLines = FibuJournalEntry & {
  lines: FibuJournalLine[];
  totalAmount: number;
};

export const FIBU_ACCOUNTS_KEY = ["/api/fibu/accounts"] as const;

export function fibuJournalKey(year?: number) {
  return year !== undefined
    ? (["/api/fibu/journal", { year }] as const)
    : (["/api/fibu/journal"] as const);
}

export function useFibuAccounts() {
  return useQuery<FibuAccount[]>({
    queryKey: FIBU_ACCOUNTS_KEY,
    queryFn: async () => {
      const res = await fetch("/api/fibu/accounts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch FiBu-Konten");
      return res.json();
    },
  });
}

export function useFibuJournal(year?: number) {
  return useQuery<FibuJournalEntryWithLines[]>({
    queryKey: fibuJournalKey(year),
    queryFn: async () => {
      const url = year !== undefined ? `/api/fibu/journal?year=${year}` : "/api/fibu/journal";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch FiBu-Journal");
      return res.json();
    },
  });
}

export interface CreateEntryInput {
  bookingDate: string; // ISO yyyy-mm-dd
  fiscalYear: number;
  description: string;
  docRef?: string | null;
  sourceRef?: string | null;
  lines: Array<{
    konto: string;
    debit?: number;
    credit?: number;
    lineText?: string | null;
    costCenter?: string | null;
  }>;
}

export interface TransactionSuggestion {
  id: number;
  date: string;
  amount: number;
  description: string;
  counterparty: string | null;
  accountId: number | null;
  accountName: string | null;
  bankKonto: string | null;
  categoryName: string | null;
  fiscalArea: string | null;
  alreadyBooked: boolean;
  sourceRef: string;
}

export function useFibuTransactionSuggestions(year?: number) {
  return useQuery<TransactionSuggestion[]>({
    queryKey: year !== undefined
      ? (["/api/fibu/transaction-suggestions", { year }] as const)
      : (["/api/fibu/transaction-suggestions"] as const),
    queryFn: async () => {
      const url = year !== undefined
        ? `/api/fibu/transaction-suggestions?year=${year}`
        : "/api/fibu/transaction-suggestions";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch transaction suggestions");
      return res.json();
    },
  });
}

function invalidateFibu(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["/api/fibu/journal"] });
  // Suggestions-Liste wird nach Buchung aktualisiert, damit "schon verbucht"-Flag aktuell bleibt
  qc.invalidateQueries({ queryKey: ["/api/fibu/transaction-suggestions"] });
}

export function useCreateFibuEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateEntryInput) => {
      const res = await apiRequest("POST", "/api/fibu/journal", input);
      return (await res.json()) as FibuJournalEntryWithLines;
    },
    onSuccess: () => invalidateFibu(qc),
  });
}

export function useLockFibuEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/fibu/journal/${id}/lock`);
      return (await res.json()) as FibuJournalEntry;
    },
    onSuccess: () => invalidateFibu(qc),
  });
}

export function useDeleteFibuEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/fibu/journal/${id}`);
      return { id };
    },
    onSuccess: () => invalidateFibu(qc),
  });
}

export function useReverseFibuEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; description?: string }) => {
      const res = await apiRequest("POST", `/api/fibu/journal/${vars.id}/reverse`, {
        description: vars.description,
      });
      return (await res.json()) as FibuJournalEntryWithLines;
    },
    onSuccess: () => invalidateFibu(qc),
  });
}
