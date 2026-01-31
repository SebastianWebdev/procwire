import {
  Paper,
  Stack,
  Text,
  Switch,
  Slider,
  MultiSelect,
  Group,
  Tooltip,
  ActionIcon,
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";

interface RunOptions {
  quick: boolean;
  concurrency: number;
  codecs: string[];
  sizes: string[];
  modes: string[];
}

interface OptionsFormProps {
  options: RunOptions;
  onChange: (options: RunOptions) => void;
}

const CODEC_OPTIONS = [
  { value: "raw", label: "Raw (Buffer)" },
  { value: "msgpack", label: "MessagePack" },
  { value: "arrow", label: "Apache Arrow" },
];

const SIZE_OPTIONS = [
  { value: "1KB", label: "1 KB" },
  { value: "10KB", label: "10 KB" },
  { value: "100KB", label: "100 KB" },
  { value: "1MB", label: "1 MB" },
  { value: "10MB", label: "10 MB" },
  { value: "100MB", label: "100 MB" },
];

const MODE_OPTIONS = [
  { value: "result", label: "Result (request-response)" },
  { value: "stream", label: "Stream (chunked)" },
  { value: "ack", label: "Ack (fire-and-forget)" },
];

function OptionsForm({ options, onChange }: OptionsFormProps) {
  const update = <K extends keyof RunOptions>(key: K, value: RunOptions[K]) => {
    onChange({ ...options, [key]: value });
  };

  return (
    <Paper p="md" withBorder>
      <Stack gap="md">
        <Text size="sm" fw={500} c="dimmed">
          Options
        </Text>

        {/* Quick Mode */}
        <Group justify="space-between">
          <Group gap="xs">
            <Text size="sm">Quick Mode</Text>
            <Tooltip label="Reduced iterations for faster results (10x fewer)">
              <ActionIcon variant="subtle" size="sm">
                <IconInfoCircle size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <Switch
            checked={options.quick}
            onChange={(e) => update("quick", e.currentTarget.checked)}
          />
        </Group>

        {/* Concurrency */}
        <div>
          <Group justify="space-between" mb="xs">
            <Group gap="xs">
              <Text size="sm">Concurrency</Text>
              <Tooltip label="Number of parallel requests (pipelining)">
                <ActionIcon variant="subtle" size="sm">
                  <IconInfoCircle size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
            <Text size="sm" fw={500}>
              {options.concurrency === 1
                ? "Sequential"
                : `${options.concurrency}x`}
            </Text>
          </Group>
          <Slider
            value={options.concurrency}
            onChange={(v) => update("concurrency", v)}
            min={1}
            max={64}
            step={1}
            marks={[
              { value: 1, label: "1" },
              { value: 8, label: "8" },
              { value: 16, label: "16" },
              { value: 32, label: "32" },
              { value: 64, label: "64" },
            ]}
          />
        </div>

        {/* Filters */}
        <Group grow>
          <MultiSelect
            label="Filter Codecs"
            placeholder="All codecs"
            data={CODEC_OPTIONS}
            value={options.codecs}
            onChange={(v) => update("codecs", v)}
            clearable
          />
          <MultiSelect
            label="Filter Sizes"
            placeholder="All sizes"
            data={SIZE_OPTIONS}
            value={options.sizes}
            onChange={(v) => update("sizes", v)}
            clearable
          />
          <MultiSelect
            label="Filter Modes"
            placeholder="All modes"
            data={MODE_OPTIONS}
            value={options.modes}
            onChange={(v) => update("modes", v)}
            clearable
          />
        </Group>
      </Stack>
    </Paper>
  );
}

export default OptionsForm;
