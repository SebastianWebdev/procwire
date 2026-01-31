/**
 * Hook for managing benchmark run state with WebSocket updates.
 */

import { useState, useCallback } from "react";
import { useWebSocket, type WsMessage } from "./useWebSocket";
import type { ScenarioResult, BenchmarkSummary } from "../api/types";

export interface ScenarioProgress {
  current: number;
  total: number;
  currentTest?: {
    codec: string;
    size: string;
    mode: string;
  };
}

export interface RunState {
  runId: number | null;
  status: "idle" | "running" | "completed" | "failed";
  scenarioProgress: Record<string, ScenarioProgress>;
  latestResults: ScenarioResult[];
  summary: BenchmarkSummary | null;
  error: string | null;
  duration: number | null;
}

const initialState: RunState = {
  runId: null,
  status: "idle",
  scenarioProgress: {},
  latestResults: [],
  summary: null,
  error: null,
  duration: null,
};

export function useBenchmarkRun() {
  const [runState, setRunState] = useState<RunState>(initialState);

  const handleMessage = useCallback(
    (message: WsMessage) => {
      // Only process messages for current run
      setRunState((prev) => {
        if (prev.runId !== null && message.runId !== prev.runId) {
          return prev;
        }

        switch (message.type) {
          case "run:start":
            return {
              ...prev,
              status: "running",
            };

          case "scenario:start":
            return {
              ...prev,
              scenarioProgress: {
                ...prev.scenarioProgress,
                [message.scenarioId as string]: {
                  current: 0,
                  total: message.total as number,
                },
              },
            };

          case "scenario:progress":
            return {
              ...prev,
              scenarioProgress: {
                ...prev.scenarioProgress,
                [message.scenarioId as string]: {
                  current: message.current as number,
                  total: message.total as number,
                  currentTest: message.currentTest as
                    | ScenarioProgress["currentTest"]
                    | undefined,
                },
              },
            };

          case "result:complete":
            return {
              ...prev,
              latestResults: [
                ...prev.latestResults,
                message.result as ScenarioResult,
              ],
            };

          case "run:complete":
            return {
              ...prev,
              status: "completed",
              summary: message.summary as BenchmarkSummary,
              duration: message.duration as number,
            };

          case "run:error":
            return {
              ...prev,
              status: "failed",
              error: message.error as string,
            };

          default:
            return prev;
        }
      });
    },
    []
  );

  useWebSocket({
    onMessage: handleMessage,
    autoConnect: true,
  });

  const startRun = useCallback((runId: number) => {
    setRunState({
      ...initialState,
      runId,
      status: "running",
    });
  }, []);

  const resetRun = useCallback(() => {
    setRunState(initialState);
  }, []);

  return {
    runState,
    startRun,
    resetRun,
  };
}
