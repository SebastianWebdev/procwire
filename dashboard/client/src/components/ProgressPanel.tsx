/**
 * Live progress display during benchmark execution.
 */

import {
  Paper,
  Stack,
  Progress,
  Text,
  Group,
  Badge,
  Table,
  ScrollArea,
} from "@mantine/core";
import type { RunState, ScenarioProgress } from "../hooks/useBenchmarkRun";
import type { ScenarioResult } from "../api/types";
import LiveMetrics from "./LiveMetrics";

interface ProgressPanelProps {
  runState: RunState;
}

function ProgressPanel({ runState }: ProgressPanelProps) {
  const { scenarioProgress, latestResults } = runState;

  // Calculate overall progress
  const entries = Object.values(scenarioProgress);
  const totalTests = entries.reduce((sum, s) => sum + s.total, 0);
  const completedTests = entries.reduce((sum, s) => sum + s.current, 0);
  const overallPercent = totalTests > 0 ? (completedTests / totalTests) * 100 : 0;

  return (
    <Stack gap="md">
      {/* Overall Progress */}
      <Paper p="md" withBorder>
        <Stack gap="sm">
          <Group justify="space-between">
            <Text size="sm" fw={500}>
              Overall Progress
            </Text>
            <Text size="sm">
              {completedTests} / {totalTests} tests
            </Text>
          </Group>
          <Progress
            value={overallPercent}
            size="lg"
            radius="md"
            color="blue"
            striped
            animated
          />
        </Stack>
      </Paper>

      {/* Per-Scenario Progress */}
      {Object.entries(scenarioProgress).map(([scenarioId, progress]) => (
        <ScenarioProgressCard
          key={scenarioId}
          scenarioId={scenarioId}
          progress={progress}
        />
      ))}

      {/* Live Metrics */}
      {latestResults.length > 0 && <LiveMetrics results={latestResults} />}

      {/* Latest Results Table */}
      {latestResults.length > 0 && (
        <LatestResultsTable results={latestResults} />
      )}
    </Stack>
  );
}

interface ScenarioProgressCardProps {
  scenarioId: string;
  progress: ScenarioProgress;
}

function ScenarioProgressCard({
  scenarioId,
  progress,
}: ScenarioProgressCardProps) {
  const percent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <Paper p="md" withBorder>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text size="sm" fw={500}>
            {scenarioId}
          </Text>
          <Text size="sm" c="dimmed">
            {progress.current} / {progress.total}
          </Text>
        </Group>
        <Progress value={percent} size="sm" radius="md" color="cyan" />
        {progress.currentTest && (
          <Group gap="xs">
            <Badge size="sm" variant="light" color="blue">
              {progress.currentTest.size}
            </Badge>
            <Badge size="sm" variant="light" color="green">
              {progress.currentTest.codec}
            </Badge>
            <Badge size="sm" variant="light" color="yellow">
              {progress.currentTest.mode}
            </Badge>
          </Group>
        )}
      </Stack>
    </Paper>
  );
}

interface LatestResultsTableProps {
  results: ScenarioResult[];
}

function LatestResultsTable({ results }: LatestResultsTableProps) {
  return (
    <Paper p="md" withBorder>
      <Text size="sm" fw={500} mb="sm">
        Latest Results
      </Text>
      <ScrollArea h={200}>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Size</Table.Th>
              <Table.Th>Codec</Table.Th>
              <Table.Th>Mode</Table.Th>
              <Table.Th>Throughput</Table.Th>
              <Table.Th>Latency P99</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {results
              .slice(-10)
              .reverse()
              .map((result, i) => (
                <Table.Tr key={i}>
                  <Table.Td>{result.size}</Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="light">
                      {result.codec}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="dot">
                      {result.mode}
                    </Badge>
                  </Table.Td>
                  <Table.Td ff="monospace">
                    {formatThroughput(result.throughputMBps)}
                  </Table.Td>
                  <Table.Td ff="monospace">
                    {result.latency.p99.toFixed(0)} us
                  </Table.Td>
                </Table.Tr>
              ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Paper>
  );
}

function formatThroughput(mbps: number): string {
  if (mbps >= 1000) {
    return `${(mbps / 1000).toFixed(2)} GB/s`;
  }
  return `${mbps.toFixed(1)} MB/s`;
}

export default ProgressPanel;
