import {
  Checkbox,
  Card,
  Text,
  Group,
  Badge,
  Stack,
  Skeleton,
  SimpleGrid,
} from "@mantine/core";
import type { ScenarioInfo } from "../api/types";

interface ScenarioSelectorProps {
  scenarios: ScenarioInfo[];
  selected: string[];
  onChange: (ids: string[]) => void;
  loading?: boolean;
}

function ScenarioSelector({
  scenarios,
  selected,
  onChange,
  loading,
}: ScenarioSelectorProps) {
  const handleToggle = (id: string, checked: boolean) => {
    if (checked) {
      onChange([...selected, id]);
    } else {
      onChange(selected.filter((s) => s !== id));
    }
  };

  if (loading) {
    return (
      <Stack gap="sm">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} height={80} radius="md" />
        ))}
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      <Text size="sm" fw={500} c="dimmed">
        Select Scenarios
      </Text>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
        {scenarios.map((scenario) => (
          <Card
            key={scenario.id}
            withBorder
            padding="sm"
            style={{
              cursor: "pointer",
              borderColor: selected.includes(scenario.id)
                ? "var(--mantine-color-blue-6)"
                : undefined,
              backgroundColor: selected.includes(scenario.id)
                ? "var(--mantine-color-blue-light)"
                : undefined,
            }}
            onClick={() =>
              handleToggle(scenario.id, !selected.includes(scenario.id))
            }
          >
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Group gap="sm" wrap="nowrap" align="flex-start">
                <Checkbox
                  checked={selected.includes(scenario.id)}
                  onChange={(e) =>
                    handleToggle(scenario.id, e.currentTarget.checked)
                  }
                  onClick={(e) => e.stopPropagation()}
                  mt={4}
                />
                <div>
                  <Text fw={500} size="sm">
                    {scenario.name}
                  </Text>
                  <Text size="xs" c="dimmed" lineClamp={2}>
                    {scenario.description}
                  </Text>
                </div>
              </Group>

              <Group gap={4} wrap="nowrap">
                <Badge size="xs" variant="light" color="blue">
                  {scenario.sizes.length} sizes
                </Badge>
                <Badge size="xs" variant="light" color="green">
                  {scenario.codecs.length} codecs
                </Badge>
              </Group>
            </Group>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

export default ScenarioSelector;
