/**
 * Filter panel for trends page with size/codec/mode/date filters.
 */

import { Group, Select, Stack, Text, SegmentedControl } from "@mantine/core";

interface Filters {
  size: string;
  codec: string;
  mode: string;
  days: number;
}

interface FilterPanelProps {
  filters: Filters;
  onChange: (key: keyof Filters, value: string | number) => void;
}

const SIZE_OPTIONS = [
  { value: "1KB", label: "1 KB" },
  { value: "10KB", label: "10 KB" },
  { value: "100KB", label: "100 KB" },
  { value: "1MB", label: "1 MB" },
  { value: "10MB", label: "10 MB" },
  { value: "100MB", label: "100 MB" },
];

const CODEC_OPTIONS = [
  { value: "raw", label: "Raw" },
  { value: "msgpack", label: "MessagePack" },
  { value: "arrow", label: "Arrow" },
];

const MODE_OPTIONS = [
  { value: "result", label: "Result" },
  { value: "stream", label: "Stream" },
  { value: "ack", label: "Ack" },
];

const DAYS_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

function FilterPanel({ filters, onChange }: FilterPanelProps) {
  return (
    <Stack gap="md">
      <Text size="sm" fw={500} c="dimmed">
        Filters
      </Text>
      <Group grow>
        <Select
          label="Payload Size"
          data={SIZE_OPTIONS}
          value={filters.size}
          onChange={(v) => v && onChange("size", v)}
        />
        <Select
          label="Codec"
          data={CODEC_OPTIONS}
          value={filters.codec}
          onChange={(v) => v && onChange("codec", v)}
        />
        <Select
          label="Response Mode"
          data={MODE_OPTIONS}
          value={filters.mode}
          onChange={(v) => v && onChange("mode", v)}
        />
      </Group>
      <div>
        <Text size="sm" mb="xs">
          Time Range
        </Text>
        <SegmentedControl
          data={DAYS_OPTIONS}
          value={String(filters.days)}
          onChange={(v) => onChange("days", parseInt(v, 10))}
        />
      </div>
    </Stack>
  );
}

export default FilterPanel;
