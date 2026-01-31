/**
 * Overlay chart comparing two runs side-by-side.
 */

import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { useMantineTheme } from "@mantine/core";
import type { ComparisonRow } from "../api/types";

interface OverlayChartProps {
  type: "throughput" | "latency";
  comparisons: ComparisonRow[];
  baselineName: string;
  compareName: string;
}

const SIZES = ["1KB", "10KB", "100KB", "1MB", "10MB", "100MB"];

function OverlayChart({ type, comparisons, baselineName, compareName }: OverlayChartProps) {
  const theme = useMantineTheme();

  // Filter to raw codec, result mode for clean comparison
  const filtered = comparisons.filter((c) => c.codec === "raw" && c.mode === "result");

  const getBaselineData = () =>
    SIZES.map((size) => {
      const row = filtered.find((c) => c.size === size);
      if (!row?.baseline) return 0;
      return type === "throughput" ? row.baseline.throughputMBps : row.baseline.latencyP99;
    });

  const getCompareData = () =>
    SIZES.map((size) => {
      const row = filtered.find((c) => c.size === size);
      if (!row?.compare) return 0;
      return type === "throughput" ? row.compare.throughputMBps : row.compare.latencyP99;
    });

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
        const lines = params.map((p: any) => {
          const value =
            type === "throughput" ? formatThroughput(p.value) : `${p.value.toFixed(0)} us`;
          return `${p.marker} ${p.seriesName}: <strong>${value}</strong>`;
        });
        return `${params[0].name}<br/>${lines.join("<br/>")}`;
      },
    },
    legend: {
      data: [baselineName, compareName],
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
      name: type === "throughput" ? "MB/s" : "Latency (us)",
      nameTextStyle: { color: theme.colors.dark[2] },
      axisLine: { lineStyle: { color: theme.colors.dark[4] } },
      axisLabel: {
        color: theme.colors.dark[2],
        formatter: (value: number) =>
          type === "throughput" ? formatThroughput(value) : `${value}`,
      },
      splitLine: { lineStyle: { color: theme.colors.dark[5] } },
    },
    series: [
      {
        name: baselineName,
        type: "bar",
        data: getBaselineData(),
        itemStyle: {
          color: theme.colors.gray[6],
          borderRadius: [4, 4, 0, 0],
        },
        barGap: "10%",
      },
      {
        name: compareName,
        type: "bar",
        data: getCompareData(),
        itemStyle: {
          color: theme.colors.blue[6],
          borderRadius: [4, 4, 0, 0],
        },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: "400px" }} opts={{ renderer: "svg" }} />;
}

function formatThroughput(mbps: number): string {
  if (mbps >= 1000) {
    return `${(mbps / 1000).toFixed(1)} GB/s`;
  }
  return `${mbps.toFixed(0)} MB/s`;
}

export default OverlayChart;
