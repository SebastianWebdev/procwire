/**
 * Pass/fail indicator badge with target comparison.
 */

import { Badge, Tooltip } from "@mantine/core";
import type { ScenarioResult, PerformanceTarget } from "../api/types";

interface PassFailBadgeProps {
  target?: PerformanceTarget;
  result: ScenarioResult;
}

function PassFailBadge({ target, result }: PassFailBadgeProps) {
  if (!target) {
    return (
      <Badge color="gray" variant="light">
        -
      </Badge>
    );
  }

  const passed = result.throughputMBps >= target.targetMBps;
  const margin =
    ((result.throughputMBps - target.targetMBps) / target.targetMBps) * 100;

  return (
    <Tooltip
      label={`Target: ${target.targetMBps} MB/s, Actual: ${result.throughputMBps.toFixed(1)} MB/s`}
    >
      <Badge color={passed ? "green" : "red"} variant="filled">
        {passed ? "PASS" : "FAIL"} ({margin > 0 ? "+" : ""}
        {margin.toFixed(0)}%)
      </Badge>
    </Tooltip>
  );
}

export default PassFailBadge;
