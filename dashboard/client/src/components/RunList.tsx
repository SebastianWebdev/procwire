/**
 * List of benchmark runs with selection support.
 */

import { Stack, Card, Text, Badge, Group, Skeleton, ScrollArea } from "@mantine/core";
import { IconStar } from "@tabler/icons-react";
import type { RunSummary } from "../api/types";

interface RunListProps {
  runs: RunSummary[];
  loading: boolean;
  selectedId?: number;
  onSelect: (id: number) => void;
}

function RunList({ runs, loading, selectedId, onSelect }: RunListProps) {
  if (loading) {
    return (
      <Stack gap="sm">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} height={70} radius="md" />
        ))}
      </Stack>
    );
  }

  if (runs.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No benchmark runs yet
      </Text>
    );
  }

  return (
    <ScrollArea h="calc(100vh - 200px)">
      <Stack gap="sm">
        {runs.map((run) => (
          <Card
            key={run.id}
            padding="sm"
            withBorder
            style={{
              cursor: "pointer",
              borderColor: selectedId === run.id ? "var(--mantine-color-blue-6)" : undefined,
              backgroundColor:
                selectedId === run.id ? "var(--mantine-color-blue-light)" : undefined,
            }}
            onClick={() => onSelect(run.id)}
          >
            <Group justify="space-between" wrap="nowrap">
              <div style={{ minWidth: 0 }}>
                <Group gap="xs">
                  <Text size="sm" fw={500} truncate="end">
                    #{run.id}
                  </Text>
                  {run.isBaseline && (
                    <IconStar
                      size={14}
                      color="var(--mantine-color-yellow-5)"
                      fill="var(--mantine-color-yellow-5)"
                    />
                  )}
                </Group>
                <Text size="xs" c="dimmed" truncate="end">
                  {new Date(run.startedAt).toLocaleDateString()}
                </Text>
              </div>

              <Stack gap={4} align="flex-end">
                <Badge size="xs" color={getStatusColor(run.status, run.passed)}>
                  {run.status === "running" ? "Running" : run.passed ? "PASS" : "FAIL"}
                </Badge>
                {run.peakThroughputMBps && (
                  <Text size="xs" ff="monospace" c="dimmed">
                    {formatThroughput(run.peakThroughputMBps)}
                  </Text>
                )}
              </Stack>
            </Group>
          </Card>
        ))}
      </Stack>
    </ScrollArea>
  );
}

function getStatusColor(status: string, passed: boolean | null): string {
  if (status === "running") return "blue";
  if (status === "failed") return "red";
  return passed ? "green" : "red";
}

function formatThroughput(mbps: number): string {
  if (mbps >= 1000) {
    return `${(mbps / 1000).toFixed(1)} GB/s`;
  }
  return `${mbps.toFixed(0)} MB/s`;
}

export default RunList;
