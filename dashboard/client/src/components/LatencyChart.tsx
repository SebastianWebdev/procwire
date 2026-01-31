/**
 * ECharts line chart for latency percentiles.
 */

import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { useMantineTheme } from "@mantine/core";
import type { ScenarioResult } from "../api/types";

interface LatencyChartProps {
  results: ScenarioResult[];
}

const PERCENTILES = ["p50", "p75", "p90", "p95", "p99", "p999"] as const;
const PERCENTILE_LABELS = ["P50", "P75", "P90", "P95", "P99", "P99.9"];
const CODEC_COLORS: Record<string, string> = {
  raw: "#228be6",
  msgpack: "#40c057",
  arrow: "#fab005",
};

function LatencyChart({ results }: LatencyChartProps) {
  const theme = useMantineTheme();

  // Filter to 1KB, result mode for latency comparison
  const filteredResults = results.filter(
    (r) => r.size === "1KB" && r.mode === "result"
  );

  const codecs = [...new Set(filteredResults.map((r) => r.codec))];

  const series = codecs.map((codec) => {
    const result = filteredResults.find((r) => r.codec === codec);
    return {
      name: codec,
      type: "line" as const,
      smooth: true,
      data: PERCENTILES.map((p) => result?.latency[p] ?? 0),
      lineStyle: { width: 2, color: CODEC_COLORS[codec] },
      symbol: "circle",
      symbolSize: 6,
      itemStyle: { color: CODEC_COLORS[codec] },
    };
  });

  const option: EChartsOption = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: theme.colors.dark[7],
      borderColor: theme.colors.dark[4],
      textStyle: { color: theme.colors.dark[0] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (params: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lines = params.map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p: any) =>
            `${p.marker} ${p.seriesName}: <strong>${p.value.toFixed(0)} us</strong>`
        );
        return `${params[0].name}<br/>${lines.join("<br/>")}`;
      },
    },
    legend: {
      data: codecs,
      textStyle: { color: theme.colors.dark[0] },
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "3%",
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: PERCENTILE_LABELS,
      axisLine: { lineStyle: { color: theme.colors.dark[4] } },
      axisLabel: { color: theme.colors.dark[2] },
    },
    yAxis: {
      type: "value",
      name: "Latency (us)",
      nameTextStyle: { color: theme.colors.dark[2] },
      axisLine: { lineStyle: { color: theme.colors.dark[4] } },
      axisLabel: { color: theme.colors.dark[2] },
      splitLine: { lineStyle: { color: theme.colors.dark[5] } },
    },
    series,
  };

  return (
    <ReactECharts
      option={option}
      style={{ height: "400px" }}
      opts={{ renderer: "svg" }}
    />
  );
}

export default LatencyChart;
