/**
 * API client for the dashboard.
 */

import type {
  ScenariosResponse,
  ListRunsParams,
  ListRunsResponse,
  RunDetailResponse,
  RunResultsResponse,
  CreateRunRequest,
  CreateRunResponse,
  SetBaselineResponse,
  CompareResponse,
  TrendsParams,
  TrendsResponse,
} from "./types";

const API_BASE = "/api";

export interface ApiError {
  error: string;
  statusCode: number;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      error: response.statusText,
      statusCode: response.status,
    }));
    throw new Error(error.error);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const api = {
  // Scenarios
  getScenarios: () => request<ScenariosResponse>("/scenarios"),

  // Runs
  getRuns: (params?: ListRunsParams) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));
    if (params?.status) searchParams.set("status", params.status);
    if (params?.scenario) searchParams.set("scenario", params.scenario);
    const query = searchParams.toString();
    return request<ListRunsResponse>(`/runs${query ? `?${query}` : ""}`);
  },

  getRun: (id: number) => request<RunDetailResponse>(`/runs/${id}`),

  getRunResults: (id: number) =>
    request<RunResultsResponse>(`/runs/${id}/results`),

  createRun: (data: CreateRunRequest) =>
    request<CreateRunResponse>("/runs", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteRun: (id: number) =>
    request<void>(`/runs/${id}`, { method: "DELETE" }),

  setBaseline: (id: number, isBaseline: boolean) =>
    request<SetBaselineResponse>(`/runs/${id}/baseline`, {
      method: "PUT",
      body: JSON.stringify({ isBaseline }),
    }),

  // Compare
  compare: (baselineId: number, compareId: number) =>
    request<CompareResponse>(
      `/compare?baseline=${baselineId}&compare=${compareId}`
    ),

  // Trends
  getTrends: (params: TrendsParams) => {
    const searchParams = new URLSearchParams({
      metric: params.metric,
      size: params.size,
    });
    if (params.codec) searchParams.set("codec", params.codec);
    if (params.mode) searchParams.set("mode", params.mode);
    if (params.days) searchParams.set("days", String(params.days));
    return request<TrendsResponse>(`/trends?${searchParams}`);
  },
};
