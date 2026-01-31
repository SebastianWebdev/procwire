/**
 * ECharts bar chart for throughput by size and codec.
 */

import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { useMantineTheme } from "@mantine/core";
import type { ScenarioResult } from "../api/types";

interface ThroughputChartProps {
  results: ScenarioResult[];
}

const SIZES = ["1KB", "10KB", "100KB", "1MB", "10MB", "100MB"];
const CODECS = ["raw", "msgpack", "arrow"];
const CODEC_COLORS: Record<string, string> = {
  raw: "#228be6",
  msgpack: "#40c057",
  arrow: "#fab005",
};

function ThroughputChart({ results }: ThroughputChartProps) {
  const theme = useMantineTheme();

  // Filter to 'result' mode only for clarity
  const filteredResults = results.filter((r) => r.mode === "result");

  // Build series data
  const series = CODECS.map((codec) => ({
    name: codec,
    type: "bar" as const,
    data: SIZES.map((size) => {
      const result = filteredResults.find((r) => r.codec === codec && r.size === size);
      return result?.throughputMBps ?? 0;
    }),
    itemStyle: {
      color: CODEC_COLORS[codec],
      borderRadius: [4, 4, 0, 0],
    },
  }));

  const option: EChartsOption = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: theme.colors.dark[7],
      borderColor: theme.colors.dark[4],
      textStyle: { color: theme.colors.dark[0] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (params: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lines = params.map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p: any) => `${p.marker} ${p.seriesName}: <strong>${formatThroughput(p.value)}</strong>`,
        );
        return `${params[0].name}<br/>${lines.join("<br/>")}`;
      },
    },
    legend: {
      data: CODECS,
      textStyle: { color: theme.colors.dark[0] },
      top: 0,
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "3%",
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: SIZES,
      axisLine: { lineStyle: { color: theme.colors.dark[4] } },
      axisLabel: { color: theme.colors.dark[2] },
    },
    yAxis: {
      type: "value",
      name: "MB/s",
      nameTextStyle: { color: theme.colors.dark[2] },
      axisLine: { lineStyle: { color: theme.colors.dark[4] } },
      axisLabel: {
        color: theme.colors.dark[2],
        formatter: (value: number) => formatThroughput(value),
      },
      splitLine: { lineStyle: { color: theme.colors.dark[5] } },
    },
    series,
  };

  return <ReactECharts option={option} style={{ height: "400px" }} opts={{ renderer: "svg" }} />;
}

function formatThroughput(mbps: number): string {
  if (mbps >= 1000) {
    return `${(mbps / 1000).toFixed(1)} GB/s`;
  }
  return `${mbps.toFixed(0)} MB/s`;
}

export default ThroughputChart;
