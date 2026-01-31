/**
 * Hook for displaying regression alerts on run completion.
 */

import { useEffect } from "react";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router-dom";
import type { WsMessage } from "./useWebSocket";

interface RegressionSummary {
  hasRegressions: boolean;
  hasCriticalRegressions: boolean;
  regressionCount: number;
  criticalCount: number;
}

export function useRegressionAlerts(
  message: WsMessage | null,
  enabled: boolean = true
) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled || !message) return;

    // Only handle run:complete with regression data
    if (message.type !== "run:complete") return;

    const regressionSummary = message.regressionSummary as
      | RegressionSummary
      | undefined;
    if (!regressionSummary) {
      // No regression data - just show success
      notifications.show({
        id: `run-complete-${message.runId}`,
        title: "Benchmark Complete",
        message: "Benchmark run completed successfully.",
        color: "green",
        autoClose: 5000,
      });
      return;
    }

    const {
      hasRegressions,
      hasCriticalRegressions,
      regressionCount,
      criticalCount,
    } = regressionSummary;

    if (hasCriticalRegressions) {
      notifications.show({
        id: `regression-critical-${message.runId}`,
        title: "Critical Performance Regression",
        message: `${criticalCount} critical regression(s) detected (>25% drop). Click to compare.`,
        color: "red",
        autoClose: false,
        onClick: () => {
          navigate(`/compare?compare=${message.runId}`);
          notifications.hide(`regression-critical-${message.runId}`);
        },
      });
    } else if (hasRegressions) {
      notifications.show({
        id: `regression-warning-${message.runId}`,
        title: "Performance Regression Detected",
        message: `${regressionCount} regression(s) detected (>10% drop). Click to compare.`,
        color: "yellow",
        autoClose: 10000,
        onClick: () => {
          navigate(`/compare?compare=${message.runId}`);
          notifications.hide(`regression-warning-${message.runId}`);
        },
      });
    } else {
      notifications.show({
        id: `run-complete-${message.runId}`,
        title: "Benchmark Complete",
        message: "No performance regressions detected.",
        color: "green",
        autoClose: 5000,
      });
    }
  }, [message, enabled, navigate]);
}
