/**
 * Dropdown selector for choosing benchmark runs.
 */

import { Select, Text, Group, Badge } from "@mantine/core";
import { IconStar } from "@tabler/icons-react";
import type { RunSummary } from "../api/types";

interface RunSelectorProps {
  label: string;
  runs: RunSummary[];
  loading: boolean;
  value: number | null;
  onChange: (id: number | null) => void;
  excludeId?: number | null;
  highlightBaseline?: boolean;
}

interface RunOption {
  value: string;
  label: string;
  run: RunSummary;
}

function RunSelector({
  label,
  runs,
  loading,
  value,
  onChange,
  excludeId,
  highlightBaseline,
}: RunSelectorProps) {
  const options: RunOption[] = runs
    .filter((r) => r.id !== excludeId)
    .map((run) => ({
      value: String(run.id),
      label: formatRunLabel(run),
      run,
    }));

  return (
    <Select
      label={label}
      placeholder="Select a run..."
      data={options.map((o) => ({
        value: o.value,
        label: o.label,
      }))}
      value={value ? String(value) : null}
      onChange={(v) => onChange(v ? parseInt(v, 10) : null)}
      disabled={loading}
      searchable
      clearable
      renderOption={({ option }) => {
        const runOption = options.find((o) => o.value === option.value);
        if (!runOption) return <Text size="sm">{option.label}</Text>;

        const run = runOption.run;
        return (
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm">{option.label}</Text>
            <Group gap="xs">
              {highlightBaseline && run.isBaseline && (
                <IconStar
                  size={14}
                  color="var(--mantine-color-yellow-5)"
                  fill="var(--mantine-color-yellow-5)"
                />
              )}
              {run.peakThroughputMBps && (
                <Badge size="xs" variant="light">
                  {formatThroughput(run.peakThroughputMBps)}
                </Badge>
              )}
            </Group>
          </Group>
        );
      }}
    />
  );
}

function formatRunLabel(run: RunSummary): string {
  const date = new Date(run.startedAt).toLocaleDateString();
  const name = run.name ? ` - ${run.name}` : "";
  return `#${run.id}${name} (${date})`;
}

function formatThroughput(mbps: number): string {
  if (mbps >= 1000) {
    return `${(mbps / 1000).toFixed(1)} GB/s`;
  }
  return `${mbps.toFixed(0)} MB/s`;
}

export default RunSelector;
