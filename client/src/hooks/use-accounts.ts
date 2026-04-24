import { useQuery } from "@tanstack/react-query";
import type { AccountWithTxCount } from "@shared/schema";

export const ACCOUNTS_QUERY_KEY = ["/api/accounts"] as const;

export function useAccounts() {
  return useQuery<AccountWithTxCount[]>({
    queryKey: ACCOUNTS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/accounts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch accounts");
      return res.json();
    },
  });
}
