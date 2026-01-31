/**
 * Export button with JSON/CSV download options.
 */

import { Menu, Button } from "@mantine/core";
import { IconDownload, IconFileText, IconTable } from "@tabler/icons-react";
import type { RunSummary } from "../api/types";

interface ExportButtonProps {
  data?: Array<{
    timestamp: string;
    value: number;
    runId: number;
    runName: string | null;
  }>;
  runs?: RunSummary[];
  filters: {
    size: string;
    codec: string;
    mode: string;
    days: number;
  };
}

function ExportButton({ data, runs, filters }: ExportButtonProps) {
  const handleExportJSON = () => {
    const exportData = {
      exportedAt: new Date().toISOString(),
      filters,
      trendData: data,
      runs,
    };

    downloadFile(
      JSON.stringify(exportData, null, 2),
      `benchmark-trends-${Date.now()}.json`,
      "application/json"
    );
  };

  const handleExportCSV = () => {
    if (!data?.length) return;

    const headers = ["Timestamp", "Value", "Run ID", "Run Name"];
    const rows = data.map((d) => [
      d.timestamp,
      d.value,
      d.runId,
      d.runName || "",
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((r) => r.map((v) => `"${v}"`).join(",")),
    ].join("\n");

    downloadFile(csv, `benchmark-trends-${Date.now()}.csv`, "text/csv");
  };

  const handleExportRunsCSV = () => {
    if (!runs?.length) return;

    const headers = [
      "ID",
      "Date",
      "Status",
      "Peak Throughput (MB/s)",
      "Passed",
      "Scenarios",
    ];
    const rows = runs.map((r) => [
      r.id,
      r.startedAt,
      r.status,
      r.peakThroughputMBps ?? "",
      r.passed ?? "",
      r.scenariosRun.join(";"),
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((r) => r.map((v) => `"${v}"`).join(",")),
    ].join("\n");

    downloadFile(csv, `benchmark-runs-${Date.now()}.csv`, "text/csv");
  };

  return (
    <Menu shadow="md" width={200}>
      <Menu.Target>
        <Button variant="light" leftSection={<IconDownload size={16} />}>
          Export
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>Trend Data</Menu.Label>
        <Menu.Item
          leftSection={<IconFileText size={16} />}
          onClick={handleExportJSON}
          disabled={!data?.length}
        >
          Export as JSON
        </Menu.Item>
        <Menu.Item
          leftSection={<IconTable size={16} />}
          onClick={handleExportCSV}
          disabled={!data?.length}
        >
          Export as CSV
        </Menu.Item>

        <Menu.Divider />

        <Menu.Label>Run History</Menu.Label>
        <Menu.Item
          leftSection={<IconTable size={16} />}
          onClick={handleExportRunsCSV}
          disabled={!runs?.length}
        >
          Export Runs as CSV
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default ExportButton;
