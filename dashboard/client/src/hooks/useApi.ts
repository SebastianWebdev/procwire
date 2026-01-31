/**
 * React Query hooks for API data fetching.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "../api/client";
import type {
  ListRunsParams,
  CreateRunRequest,
  TrendsParams,
} from "../api/types";

// Query keys
export const queryKeys = {
  scenarios: ["scenarios"] as const,
  runs: (params?: ListRunsParams) => ["runs", params] as const,
  run: (id: number) => ["run", id] as const,
  runResults: (id: number) => ["runResults", id] as const,
  compare: (baselineId: number, compareId: number) =>
    ["compare", baselineId, compareId] as const,
  trends: (params: TrendsParams) => ["trends", params] as const,
};

// Hooks
export function useScenarios() {
  return useQuery({
    queryKey: queryKeys.scenarios,
    queryFn: () => api.getScenarios(),
  });
}

export function useRuns(params?: ListRunsParams) {
  return useQuery({
    queryKey: queryKeys.runs(params),
    queryFn: () => api.getRuns(params),
  });
}

export function useRun(id: number | undefined) {
  return useQuery({
    queryKey: queryKeys.run(id!),
    queryFn: () => api.getRun(id!),
    enabled: id !== undefined,
  });
}

export function useRunResults(id: number | undefined) {
  return useQuery({
    queryKey: queryKeys.runResults(id!),
    queryFn: () => api.getRunResults(id!),
    enabled: id !== undefined,
  });
}

export function useCreateRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateRunRequest) => api.createRun(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}

export function useDeleteRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.deleteRun(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}

export function useSetBaseline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isBaseline }: { id: number; isBaseline: boolean }) =>
      api.setBaseline(id, isBaseline),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}

export function useCompare(
  baselineId: number | undefined,
  compareId: number | undefined
) {
  return useQuery({
    queryKey: queryKeys.compare(baselineId!, compareId!),
    queryFn: () => api.compare(baselineId!, compareId!),
    enabled: baselineId !== undefined && compareId !== undefined,
  });
}

export function useTrends(params: TrendsParams | undefined) {
  return useQuery({
    queryKey: queryKeys.trends(params!),
    queryFn: () => api.getTrends(params!),
    enabled: params !== undefined,
  });
}
