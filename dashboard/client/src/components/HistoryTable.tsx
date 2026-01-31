/**
 * Paginated run history table.
 */

import { useState } from "react";
import {
  Table,
  Badge,
  Text,
  Group,
  Pagination,
  ScrollArea,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import { IconEye, IconStar } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import type { RunSummary } from "../api/types";

interface HistoryTableProps {
  runs: RunSummary[];
  loading: boolean;
}

const PAGE_SIZE = 10;

function HistoryTable({ runs, loading }: HistoryTableProps) {
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const totalPages = Math.ceil(runs.length / PAGE_SIZE);
  const paginatedRuns = runs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading) {
    return <Text c="dimmed">Loading...</Text>;
  }

  if (runs.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No benchmark runs yet
      </Text>
    );
  }

  return (
    <>
      <ScrollArea>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Date</Table.Th>
              <Table.Th>Scenarios</Table.Th>
              <Table.Th>Peak Throughput</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Duration</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {paginatedRuns.map((run) => (
              <Table.Tr key={run.id}>
                <Table.Td>
                  <Group gap="xs">
                    <Text size="sm" fw={500}>
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
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{new Date(run.startedAt).toLocaleDateString()}</Text>
                  <Text size="xs" c="dimmed">
                    {new Date(run.startedAt).toLocaleTimeString()}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    {run.scenariosRun.slice(0, 2).map((s) => (
                      <Badge key={s} size="xs" variant="light">
                        {s}
                      </Badge>
                    ))}
                    {run.scenariosRun.length > 2 && (
                      <Badge size="xs" variant="outline">
                        +{run.scenariosRun.length - 2}
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td ff="monospace">
                  {run.peakThroughputMBps ? formatThroughput(run.peakThroughputMBps) : "-"}
                </Table.Td>
                <Table.Td>
                  <Badge color={getStatusColor(run.status, run.passed)}>
                    {run.status === "running" ? "Running" : run.passed ? "PASS" : "FAIL"}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {run.completedAt && run.startedAt
                    ? formatDuration(
                        new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime(),
                      )
                    : "-"}
                </Table.Td>
                <Table.Td>
                  <Tooltip label="View Details">
                    <ActionIcon variant="light" onClick={() => navigate(`/results/${run.id}`)}>
                      <IconEye size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      {totalPages > 1 && (
        <Group justify="center" mt="md">
          <Pagination total={totalPages} value={page} onChange={setPage} />
        </Group>
      )}
    </>
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

function formatDuration(ms: number): string {
  if (ms >= 60000) {
    const mins = Math.floor(ms / 60000);
    const secs = Math.round((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

export default HistoryTable;
