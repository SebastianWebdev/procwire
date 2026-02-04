/**
 * Summary card displayed after benchmark completion.
 */

import {
  Paper,
  Stack,
  Title,
  Text,
  Group,
  Badge,
  Button,
  SimpleGrid,
  ThemeIcon,
} from "@mantine/core";
import {
  IconCheck,
  IconX,
  IconBolt,
  IconClock,
  IconDatabase,
  IconArrowRight,
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import type { BenchmarkSummary } from "../api/types";

interface RunSummaryCardProps {
  runId: number;
  summary: BenchmarkSummary;
  status: "completed" | "failed";
  duration: number | null;
}

function RunSummaryCard({ runId, summary, status, duration }: RunSummaryCardProps) {
  const navigate = useNavigate();
  const isSuccess = status === "completed" && summary.passed;

  return (
    <Paper p="lg" withBorder>
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between">
          <Group gap="sm">
            <ThemeIcon size="xl" radius="xl" color={isSuccess ? "green" : "red"} variant="light">
              {isSuccess ? <IconCheck size={24} /> : <IconX size={24} />}
            </ThemeIcon>
            <div>
              <Title order={3}>Benchmark {isSuccess ? "Completed" : "Failed"}</Title>
              {duration && (
                <Text size="sm" c="dimmed">
                  Duration: {formatDuration(duration)}
                </Text>
              )}
            </div>
          </Group>
          <Badge size="lg" color={isSuccess ? "green" : "red"}>
            {summary.passed ? "PASS" : "FAIL"}
          </Badge>
        </Group>

        {/* Metrics */}
        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
          <MetricItem
            icon={IconBolt}
            color="blue"
            label="Peak Throughput"
            value={formatThroughput(summary.peakThroughputMBps)}
          />
          <MetricItem
            icon={IconDatabase}
            color="green"
            label="Total Data"
            value={formatBytes(summary.totalBytes)}
          />
          <MetricItem
            icon={IconClock}
            color="yellow"
            label="Total Requests"
            value={summary.totalRequests.toLocaleString()}
          />
          <MetricItem
            icon={IconClock}
            color="cyan"
            label="Test Duration"
            value={formatDuration(summary.totalDurationMs)}
          />
        </SimpleGrid>

        {/* Failed Targets */}
        {summary.failedTargets.length > 0 && (
          <div>
            <Text size="sm" fw={500} c="red" mb="xs">
              Failed Targets:
            </Text>
            <Group gap="xs">
              {summary.failedTargets.map((target) => (
                <Badge key={target} color="red" variant="light">
                  {target}
                </Badge>
              ))}
            </Group>
          </div>
        )}

        {/* Actions */}
        <Group justify="flex-end">
          <Button
            variant="light"
            rightSection={<IconArrowRight size={16} />}
            onClick={() => navigate(`/results/${runId}`)}
          >
            View Detailed Results
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

interface MetricItemProps {
  icon: typeof IconBolt;
  color: string;
  label: string;
  value: string;
}

function MetricItem({ icon: Icon, color, label, value }: MetricItemProps) {
  return (
    <div>
      <Group gap="xs" mb={4}>
        <ThemeIcon size="sm" color={color} variant="light">
          <Icon size={14} />
        </ThemeIcon>
        <Text size="xs" c="dimmed">
          {label}
        </Text>
      </Group>
      <Text size="lg" fw={600} ff="monospace">
        {value}
      </Text>
    </div>
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
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${ms}ms`;
}

export default RunSummaryCard;
