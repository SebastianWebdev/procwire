/**
 * Real-time metrics display during benchmark execution.
 */

import { Paper, SimpleGrid, Text, Group, ThemeIcon } from "@mantine/core";
import { IconBolt, IconClock, IconDatabase } from "@tabler/icons-react";
import type { ScenarioResult } from "../api/types";

interface LiveMetricsProps {
  results: ScenarioResult[];
}

function LiveMetrics({ results }: LiveMetricsProps) {
  if (results.length === 0) return null;

  // Calculate aggregates from latest results
  const latestResults = results.slice(-10);
  const avgThroughput =
    latestResults.reduce((sum, r) => sum + r.throughputMBps, 0) / latestResults.length;
  const avgLatencyP99 =
    latestResults.reduce((sum, r) => sum + r.latency.p99, 0) / latestResults.length;
  const totalBytes = results.reduce((sum, r) => sum + r.totalBytes, 0);

  // Peak throughput from all results
  const peakThroughput = Math.max(...results.map((r) => r.throughputMBps));

  return (
    <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
      <MetricCard
        icon={IconBolt}
        color="blue"
        label="Peak Throughput"
        value={formatThroughput(peakThroughput)}
      />
      <MetricCard
        icon={IconBolt}
        color="cyan"
        label="Avg Throughput"
        value={formatThroughput(avgThroughput)}
      />
      <MetricCard
        icon={IconClock}
        color="yellow"
        label="Avg Latency P99"
        value={`${avgLatencyP99.toFixed(0)} us`}
      />
      <MetricCard
        icon={IconDatabase}
        color="green"
        label="Data Transferred"
        value={formatBytes(totalBytes)}
      />
    </SimpleGrid>
  );
}

interface MetricCardProps {
  icon: typeof IconBolt;
  color: string;
  label: string;
  value: string;
}

function MetricCard({ icon: Icon, color, label, value }: MetricCardProps) {
  return (
    <Paper p="md" withBorder>
      <Group gap="sm">
        <ThemeIcon color={color} variant="light" size="lg">
          <Icon size={20} />
        </ThemeIcon>
        <div>
          <Text size="xs" c="dimmed">
            {label}
          </Text>
          <Text size="lg" fw={600} ff="monospace">
            {value}
          </Text>
        </div>
      </Group>
    </Paper>
  );
}

function formatThroughput(mbps: number): string {
  if (mbps >= 1000) {
    return `${(mbps / 1000).toFixed(2)} GB/s`;
  }
  return `${mbps.toFixed(1)} MB/s`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${bytes} B`;
}

export default LiveMetrics;
