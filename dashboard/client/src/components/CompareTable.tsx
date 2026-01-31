/**
 * Side-by-side comparison table with delta highlighting.
 */

import { Table, Badge, ScrollArea } from "@mantine/core";
import DeltaCell from "./DeltaCell";
import type { ComparisonRow } from "../api/types";

interface CompareTableProps {
  comparisons: ComparisonRow[];
}

const SIZE_ORDER = ["1KB", "10KB", "100KB", "1MB", "10MB", "100MB"];

function CompareTable({ comparisons }: CompareTableProps) {
  // Sort by size, then codec, then mode
  const sorted = [...comparisons].sort((a, b) => {
    const sizeA = SIZE_ORDER.indexOf(a.size);
    const sizeB = SIZE_ORDER.indexOf(b.size);
    if (sizeA !== sizeB) return sizeA - sizeB;

    const codecCmp = a.codec.localeCompare(b.codec);
    if (codecCmp !== 0) return codecCmp;

    return a.mode.localeCompare(b.mode);
  });

  return (
    <ScrollArea>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Size</Table.Th>
            <Table.Th>Codec</Table.Th>
            <Table.Th>Mode</Table.Th>
            <Table.Th>Baseline</Table.Th>
            <Table.Th>Compare</Table.Th>
            <Table.Th>Delta Throughput</Table.Th>
            <Table.Th>Delta Latency P99</Table.Th>
            <Table.Th>Status</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sorted.map((row, i) => (
            <Table.Tr
              key={i}
              style={{
                backgroundColor: row.delta.isRegression
                  ? "rgba(250, 82, 82, 0.1)"
                  : undefined,
              }}
            >
              <Table.Td>
                <Badge variant="light">{row.size}</Badge>
              </Table.Td>
              <Table.Td>
                <Badge variant="outline" color={getCodecColor(row.codec)}>
                  {row.codec}
                </Badge>
              </Table.Td>
              <Table.Td>
                <Badge variant="dot" color={getModeColor(row.mode)}>
                  {row.mode}
                </Badge>
              </Table.Td>
              <Table.Td ff="monospace">
                {row.baseline
                  ? formatThroughput(row.baseline.throughputMBps)
                  : "-"}
              </Table.Td>
              <Table.Td ff="monospace">
                {row.compare
                  ? formatThroughput(row.compare.throughputMBps)
                  : "-"}
              </Table.Td>
              <Table.Td>
                <DeltaCell
                  value={row.delta.throughputMBps}
                  percent={row.delta.throughputPercent}
                  higherIsBetter={true}
                />
              </Table.Td>
              <Table.Td>
                <DeltaCell
                  value={row.delta.latencyP99}
                  percent={row.delta.latencyPercent}
                  higherIsBetter={false}
                  unit="us"
                />
              </Table.Td>
              <Table.Td>
                {row.delta.isRegression ? (
                  <Badge color="red" variant="filled">
                    Regression
                  </Badge>
                ) : row.delta.throughputPercent > 5 ? (
                  <Badge color="green" variant="filled">
                    Improved
                  </Badge>
                ) : (
                  <Badge color="gray" variant="light">
                    Same
                  </Badge>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea>
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

export default CompareTable;
