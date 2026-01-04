import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useDashboardStats(year?: number) {
  const queryString = year ? `?year=${year}` : '';
  return useQuery({
    queryKey: [api.dashboard.stats.path, year],
    queryFn: async () => {
      const res = await fetch(api.dashboard.stats.path + queryString, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch dashboard stats");
      return api.dashboard.stats.responses[200].parse(await res.json());
    },
  });
}

export function useDashboardCharts(year?: number) {
  const queryString = year ? `?year=${year}` : '';
  return useQuery({
    queryKey: [api.dashboard.charts.path, year],
    queryFn: async () => {
      const res = await fetch(api.dashboard.charts.path + queryString, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch dashboard charts");
      return api.dashboard.charts.responses[200].parse(await res.json());
    },
  });
}

export function useForecast() {
  return useQuery({
    queryKey: [api.dashboard.forecast.path],
    queryFn: async () => {
      const res = await fetch(api.dashboard.forecast.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch forecast");
      return api.dashboard.forecast.responses[200].parse(await res.json());
    },
  });
}
