/**
 * Radio selector for metric type (throughput/latency/rps).
 */

import { Stack, Text, Radio, Group } from "@mantine/core";
import { IconBolt, IconClock, IconActivity } from "@tabler/icons-react";

type Metric = "throughput" | "latency_p99" | "rps";

interface MetricSelectorProps {
  value: Metric;
  onChange: (metric: Metric) => void;
}

function MetricSelector({ value, onChange }: MetricSelectorProps) {
  return (
    <Stack gap="md">
      <Text size="sm" fw={500} c="dimmed">
        Metric
      </Text>
      <Radio.Group value={value} onChange={(v) => onChange(v as Metric)}>
        <Stack gap="sm">
          <Radio
            value="throughput"
            label={
              <Group gap="xs">
                <IconBolt size={16} />
                <span>Throughput (MB/s)</span>
              </Group>
            }
          />
          <Radio
            value="latency_p99"
            label={
              <Group gap="xs">
                <IconClock size={16} />
                <span>Latency P99 (us)</span>
              </Group>
            }
          />
          <Radio
            value="rps"
            label={
              <Group gap="xs">
                <IconActivity size={16} />
                <span>Requests/sec</span>
              </Group>
            }
          />
        </Stack>
      </Radio.Group>
    </Stack>
  );
}

export default MetricSelector;
