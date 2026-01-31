/**
 * Time series chart for performance trends.
 */

import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { useMantineTheme, Skeleton, Text, Center } from "@mantine/core";

interface DataPoint {
  timestamp: string;
  value: number;
  runId: number;
  runName: string | null;
}

interface TrendChartProps {
  data: DataPoint[];
  loading: boolean;
  metric: "throughput" | "latency_p99" | "rps";
}

function TrendChart({ data, loading, metric }: TrendChartProps) {
  const theme = useMantineTheme();

  if (loading) {
    return <Skeleton height={400} radius="md" />;
  }

  if (data.length === 0) {
    return (
      <Center h={400}>
        <Text c="dimmed">No data available for the selected filters</Text>
      </Center>
    );
  }

  const formatValue = (value: number) => {
    switch (metric) {
      case "throughput":
        return value >= 1000
          ? `${(value / 1000).toFixed(1)} GB/s`
          : `${value.toFixed(0)} MB/s`;
      case "latency_p99":
        return `${value.toFixed(0)} us`;
      case "rps":
        return value >= 1000
          ? `${(value / 1000).toFixed(1)}k`
          : `${value.toFixed(0)}`;
      default:
        return String(value);
    }
  };

  const yAxisName = {
    throughput: "Throughput (MB/s)",
    latency_p99: "Latency P99 (us)",
    rps: "Requests/sec",
  }[metric];

  // Calculate average for reference line
  const average = data.reduce((sum, d) => sum + d.value, 0) / data.length;

  const option: EChartsOption = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: theme.colors.dark[7],
      borderColor: theme.colors.dark[4],
      textStyle: { color: theme.colors.dark[0] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (params: any) => {
        const p = params[0];
        const dataPoint = data[p.dataIndex];
        return `
          <strong>${new Date(p.name).toLocaleDateString()}</strong><br/>
          ${formatValue(p.value)}<br/>
          <small style="color: ${theme.colors.dark[2]}">
            Run #${dataPoint.runId}${dataPoint.runName ? ` - ${dataPoint.runName}` : ""}
          </small>
        `;
      },
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "15%",
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: data.map((d) => d.timestamp),
      axisLine: { lineStyle: { color: theme.colors.dark[4] } },
      axisLabel: {
        color: theme.colors.dark[2],
        rotate: 45,
        formatter: (value: string) => {
          const date = new Date(value);
          return `${date.getMonth() + 1}/${date.getDate()}`;
        },
      },
    },
    yAxis: {
      type: "value",
      name: yAxisName,
      nameTextStyle: { color: theme.colors.dark[2] },
      axisLine: { lineStyle: { color: theme.colors.dark[4] } },
      axisLabel: {
        color: theme.colors.dark[2],
        formatter: (value: number) => formatValue(value),
      },
      splitLine: { lineStyle: { color: theme.colors.dark[5] } },
    },
    dataZoom: [
      {
        type: "inside",
        start: 0,
        end: 100,
      },
      {
        type: "slider",
        start: 0,
        end: 100,
        height: 20,
        bottom: 10,
        borderColor: theme.colors.dark[4],
        backgroundColor: theme.colors.dark[7],
        fillerColor: "rgba(34, 139, 230, 0.2)",
        handleStyle: { color: theme.colors.blue[6] },
        textStyle: { color: theme.colors.dark[2] },
      },
    ],
    series: [
      {
        type: "line",
        data: data.map((d) => d.value),
        smooth: true,
        lineStyle: { color: theme.colors.blue[6], width: 2 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(34, 139, 230, 0.3)" },
              { offset: 1, color: "rgba(34, 139, 230, 0.05)" },
            ],
          },
        },
        symbol: "circle",
        symbolSize: 8,
        itemStyle: { color: theme.colors.blue[6] },
        markLine: {
          silent: true,
          lineStyle: { color: theme.colors.yellow[6], type: "dashed" },
          data: [
            {
              yAxis: average,
              label: {
                formatter: `Avg: ${formatValue(average)}`,
                color: theme.colors.yellow[6],
              },
            },
          ],
        },
      },
    ],
  };

  return (
    <ReactECharts
      option={option}
      style={{ height: "400px" }}
      opts={{ renderer: "svg" }}
    />
  );
}

export default TrendChart;
