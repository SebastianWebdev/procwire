/**
 * Detailed results table with sorting and filtering.
 */

import { useState, useMemo } from "react";
import {
  Table,
  Badge,
  Group,
  TextInput,
  Select,
  Stack,
  ScrollArea,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import type { ScenarioResult, PerformanceTarget } from "../api/types";
import PassFailBadge from "./PassFailBadge";

interface ResultsTableProps {
  results: ScenarioResult[];
  targets?: PerformanceTarget[];
}

type SortField = "size" | "codec" | "mode" | "throughput" | "latency";
type SortOrder = "asc" | "desc";

const SIZE_ORDER = ["1KB", "10KB", "100KB", "1MB", "10MB", "100MB"];

function ResultsTable({ results, targets }: ResultsTableProps) {
  const [search, setSearch] = useState("");
  const [codecFilter, setCodecFilter] = useState<string | null>(null);
  const [modeFilter, setModeFilter] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("size");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const targetMap = useMemo(() => {
    const map = new Map<string, PerformanceTarget>();
    targets?.forEach((t) => {
      map.set(t.size, t);
    });
    return map;
  }, [targets]);

  const filteredResults = useMemo(() => {
    let filtered = results;

    if (search) {
      const lower = search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.scenarioId.toLowerCase().includes(lower) ||
          r.codec.toLowerCase().includes(lower) ||
          r.size.toLowerCase().includes(lower)
      );
    }

    if (codecFilter) {
      filtered = filtered.filter((r) => r.codec === codecFilter);
    }

    if (modeFilter) {
      filtered = filtered.filter((r) => r.mode === modeFilter);
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "size":
          cmp = SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size);
          break;
        case "codec":
          cmp = a.codec.localeCompare(b.codec);
          break;
        case "mode":
          cmp = a.mode.localeCompare(b.mode);
          break;
        case "throughput":
          cmp = a.throughputMBps - b.throughputMBps;
          break;
        case "latency":
          cmp = a.latency.p99 - b.latency.p99;
          break;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return filtered;
  }, [results, search, codecFilter, modeFilter, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const codecs = [...new Set(results.map((r) => r.codec))];
  const modes = [...new Set(results.map((r) => r.mode))];

  return (
    <Stack gap="md">
      {/* Filters */}
      <Group>
        <TextInput
          placeholder="Search..."
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Select
          placeholder="All codecs"
          data={codecs.map((c) => ({ value: c, label: c }))}
          value={codecFilter}
          onChange={setCodecFilter}
          clearable
          w={120}
        />
        <Select
          placeholder="All modes"
          data={modes.map((m) => ({ value: m, label: m }))}
          value={modeFilter}
          onChange={setModeFilter}
          clearable
          w={120}
        />
      </Group>

      {/* Table */}
      <ScrollArea>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th
                style={{ cursor: "pointer" }}
                onClick={() => handleSort("size")}
              >
                Size {sortField === "size" && (sortOrder === "asc" ? "↑" : "↓")}
              </Table.Th>
              <Table.Th
                style={{ cursor: "pointer" }}
                onClick={() => handleSort("codec")}
              >
                Codec{" "}
                {sortField === "codec" && (sortOrder === "asc" ? "↑" : "↓")}
              </Table.Th>
              <Table.Th
                style={{ cursor: "pointer" }}
                onClick={() => handleSort("mode")}
              >
                Mode {sortField === "mode" && (sortOrder === "asc" ? "↑" : "↓")}
              </Table.Th>
              <Table.Th
                style={{ cursor: "pointer" }}
                onClick={() => handleSort("throughput")}
              >
                Throughput{" "}
                {sortField === "throughput" && (sortOrder === "asc" ? "↑" : "↓")}
              </Table.Th>
              <Table.Th
                style={{ cursor: "pointer" }}
                onClick={() => handleSort("latency")}
              >
                Latency P99{" "}
                {sortField === "latency" && (sortOrder === "asc" ? "↑" : "↓")}
              </Table.Th>
              <Table.Th>Requests</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filteredResults.map((result, i) => {
              const target = targetMap.get(result.size);
              return (
                <Table.Tr key={i}>
                  <Table.Td>
                    <Badge variant="light">{result.size}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="outline" color={getCodecColor(result.codec)}>
                      {result.codec}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="dot" color={getModeColor(result.mode)}>
                      {result.mode}
                    </Badge>
                  </Table.Td>
                  <Table.Td ff="monospace">
                    {formatThroughput(result.throughputMBps)}
                  </Table.Td>
                  <Table.Td ff="monospace">
                    {result.latency.p99.toFixed(0)} us
                  </Table.Td>
                  <Table.Td ff="monospace">
                    {result.requestCount.toLocaleString()}
                  </Table.Td>
                  <Table.Td>
                    <PassFailBadge target={target} result={result} />
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
}

function getCodecColor(codec: string): string {
  switch (codec) {
    case "raw":
      return "blue";
    case "msgpack":
      return "green";
    case "arrow":
      return "yellow";
    default:
      return "gray";
  }
}

function getModeColor(mode: string): string {
  switch (mode) {
    case "result":
      return "blue";
    case "stream":
      return "green";
    case "ack":
      return "yellow";
    default:
      return "gray";
  }
}

function formatThroughput(mbps: number): string {
  if (mbps >= 1000) {
    return `${(mbps / 1000).toFixed(2)} GB/s`;
  }
  return `${mbps.toFixed(1)} MB/s`;
}

export default ResultsTable;
