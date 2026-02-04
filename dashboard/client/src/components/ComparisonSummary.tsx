/**
 * Summary of comparison results showing improvements/regressions.
 */

import { Paper, SimpleGrid, Text, Group, ThemeIcon, RingProgress } from "@mantine/core";
import { IconTrendingUp, IconTrendingDown, IconMinus } from "@tabler/icons-react";

interface ComparisonSummaryProps {
  summary: {
    improvements: number;
    regressions: number;
    unchanged: number;
    overallDeltaPercent: number;
  };
}

function ComparisonSummary({ summary }: ComparisonSummaryProps) {
  const total = summary.improvements + summary.regressions + summary.unchanged;
  const isOverallBetter = summary.overallDeltaPercent > 0;

  return (
    <Paper p="md" withBorder>
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
        <Group gap="md">
          <ThemeIcon size="xl" color="green" variant="light">
            <IconTrendingUp size={24} />
          </ThemeIcon>
          <div>
            <Text size="xs" c="dimmed">
              Improvements
            </Text>
            <Text size="xl" fw={700} c="green">
              {summary.improvements}
            </Text>
          </div>
        </Group>

        <Group gap="md">
          <ThemeIcon size="xl" color="red" variant="light">
            <IconTrendingDown size={24} />
          </ThemeIcon>
          <div>
            <Text size="xs" c="dimmed">
              Regressions
            </Text>
            <Text size="xl" fw={700} c="red">
              {summary.regressions}
            </Text>
          </div>
        </Group>

        <Group gap="md">
          <ThemeIcon size="xl" color="gray" variant="light">
            <IconMinus size={24} />
          </ThemeIcon>
          <div>
            <Text size="xs" c="dimmed">
              Unchanged
            </Text>
            <Text size="xl" fw={700} c="dimmed">
              {summary.unchanged}
            </Text>
          </div>
        </Group>

        <Group gap="md">
          <RingProgress
            size={60}
            thickness={6}
            roundCaps
            sections={[
              {
                value: total > 0 ? (summary.improvements / total) * 100 : 0,
                color: "green",
              },
              {
                value: total > 0 ? (summary.regressions / total) * 100 : 0,
                color: "red",
              },
              {
                value: total > 0 ? (summary.unchanged / total) * 100 : 0,
                color: "gray",
              },
            ]}
            label={
              <Text size="xs" ta="center" fw={700}>
                {total}
              </Text>
            }
          />
          <div>
            <Text size="xs" c="dimmed">
              Overall
            </Text>
            <Text
              size="xl"
              fw={700}
              c={isOverallBetter ? "green" : summary.overallDeltaPercent < 0 ? "red" : "dimmed"}
            >
              {isOverallBetter ? "+" : ""}
              {summary.overallDeltaPercent.toFixed(1)}%
            </Text>
          </div>
        </Group>
      </SimpleGrid>
    </Paper>
  );
}

export default ComparisonSummary;
