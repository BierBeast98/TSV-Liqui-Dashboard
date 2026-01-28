import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertTransaction } from "@shared/schema";

export function useTransactions(params?: { 
  year?: number; 
  years?: number[];  // Multiple years support
  categoryId?: number;
  categoryIds?: number[];  // Multiple categories support
  accountId?: number;
  accountIds?: number[];  // Multiple accounts support
  type?: 'income' | 'expense'; 
  search?: string;
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
}) {
  const queryString = params ? '?' + new URLSearchParams(
    Object.entries(params).reduce((acc, [key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        // Convert arrays to comma-separated strings
        if (Array.isArray(val)) {
          if (val.length > 0) acc[key] = val.join(',');
        } else {
          acc[key] = String(val);
        }
      }
      return acc;
    }, {} as Record<string, string>)
  ).toString() : '';

  return useQuery({
    queryKey: [api.transactions.list.path, params],
    queryFn: async () => {
      const res = await fetch(api.transactions.list.path + queryString, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return api.transactions.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(api.transactions.create.path, {
        method: api.transactions.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 400) {
           const err = api.transactions.create.responses[400].parse(await res.json());
           throw new Error(err.message);
        }
        throw new Error("Failed to create transaction");
      }
      return api.transactions.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.transactions.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.dashboard.stats.path] });
      queryClient.invalidateQueries({ queryKey: [api.dashboard.charts.path] });
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & any) => {
      const url = buildUrl(api.transactions.update.path, { id });
      
      const res = await fetch(url, {
        method: api.transactions.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      
      if (!res.ok) {
         if (res.status === 404) throw new Error("Transaction not found");
         throw new Error("Failed to update transaction");
      }
      return api.transactions.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.transactions.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.dashboard.stats.path] });
      queryClient.invalidateQueries({ queryKey: [api.dashboard.charts.path] });
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.transactions.delete.path, { id });
      const res = await fetch(url, { method: api.transactions.delete.method, credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete transaction");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.transactions.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.dashboard.stats.path] });
      queryClient.invalidateQueries({ queryKey: [api.dashboard.charts.path] });
    },
  });
}

export function useAutoCategorize() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(api.transactions.autoCategorize.path, {
        method: api.transactions.autoCategorize.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to auto-categorize");
      return api.transactions.autoCategorize.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.transactions.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.dashboard.stats.path] });
      queryClient.invalidateQueries({ queryKey: [api.dashboard.charts.path] });
    },
  });
}

export function useUploadTransactions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch(api.transactions.upload.path, {
        method: api.transactions.upload.method,
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 400) {
             const err = api.transactions.upload.responses[400].parse(await res.json());
             throw new Error(err.message);
        }
        throw new Error("Failed to upload file");
      }
      return api.transactions.upload.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.transactions.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.dashboard.stats.path] });
      queryClient.invalidateQueries({ queryKey: [api.dashboard.charts.path] });
    },
  });
}
