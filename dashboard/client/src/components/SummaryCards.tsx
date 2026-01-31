/**
 * Summary metric cards for benchmark results.
 */

import { SimpleGrid, Paper, Text, Group, ThemeIcon } from "@mantine/core";
import {
  IconBolt,
  IconClock,
  IconDatabase,
  IconCpu,
  IconCheck,
  IconX,
} from "@tabler/icons-react";
import type { BenchmarkSummary, SystemMeta } from "../api/types";

interface SummaryCardsProps {
  summary: BenchmarkSummary;
  meta: SystemMeta;
}

function SummaryCards({ summary, meta }: SummaryCardsProps) {
  return (
    <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="sm">
      <MetricCard
        icon={summary.passed ? IconCheck : IconX}
        color={summary.passed ? "green" : "red"}
        label="Status"
        value={summary.passed ? "PASS" : "FAIL"}
      />
      <MetricCard
        icon={IconBolt}
        color="blue"
        label="Peak Throughput"
        value={formatThroughput(summary.peakThroughputMBps)}
      />
      <MetricCard
        icon={IconDatabase}
        color="cyan"
        label="Total Data"
        value={formatBytes(summary.totalBytes)}
      />
      <MetricCard
        icon={IconClock}
        color="yellow"
        label="Total Requests"
        value={summary.totalRequests.toLocaleString()}
      />
      <MetricCard
        icon={IconClock}
        color="grape"
        label="Duration"
        value={formatDuration(summary.totalDurationMs)}
      />
      <MetricCard
        icon={IconCpu}
        color="orange"
        label="CPU"
        value={`${meta.cpuCores} cores`}
        subValue={meta.cpuModel.split(" ").slice(0, 3).join(" ")}
      />
    </SimpleGrid>
  );
}

interface MetricCardProps {
  icon: typeof IconBolt;
  color: string;
  label: string;
  value: string;
  subValue?: string;
}

function MetricCard({
  icon: Icon,
  color,
  label,
  value,
  subValue,
}: MetricCardProps) {
  return (
    <Paper p="sm" withBorder>
      <Group gap="xs" mb={4}>
        <ThemeIcon size="sm" color={color} variant="light">
          <Icon size={14} />
        </ThemeIcon>
        <Text size="xs" c="dimmed">
          {label}
        </Text>
      </Group>
      <Text size="md" fw={600} ff="monospace">
        {value}
      </Text>
      {subValue && (
        <Text size="xs" c="dimmed" truncate="end">
          {subValue}
        </Text>
      )}
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
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number): string {
  if (ms >= 60000) {
    const mins = Math.floor(ms / 60000);
    const secs = Math.round((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

export default SummaryCards;
