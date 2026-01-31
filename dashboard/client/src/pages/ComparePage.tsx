/**
 * Compare Page - Side-by-side analysis of two benchmark runs.
 */

import { useState, useEffect } from "react";
import {
  Container,
  Stack,
  Title,
  Paper,
  Group,
  Text,
  Skeleton,
  Alert,
  Tabs,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useSearchParams } from "react-router-dom";
import RunSelector from "../components/RunSelector";
import ComparisonSummary from "../components/ComparisonSummary";
import CompareTable from "../components/CompareTable";
import OverlayChart from "../components/OverlayChart";
import { useRuns, useCompare } from "../hooks/useApi";

function ComparePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [baselineId, setBaselineId] = useState<number | null>(
    searchParams.get("baseline")
      ? parseInt(searchParams.get("baseline")!, 10)
      : null
  );
  const [compareId, setCompareId] = useState<number | null>(
    searchParams.get("compare")
      ? parseInt(searchParams.get("compare")!, 10)
      : null
  );

  const { data: runsData, isLoading: runsLoading } = useRuns();
  const {
    data: compareData,
    isLoading: compareLoading,
    error: compareError,
  } = useCompare(baselineId ?? undefined, compareId ?? undefined);

  // Update URL when selections change
  useEffect(() => {
    const params = new URLSearchParams();
    if (baselineId) params.set("baseline", String(baselineId));
    if (compareId) params.set("compare", String(compareId));
    setSearchParams(params, { replace: true });
  }, [baselineId, compareId, setSearchParams]);

  // Auto-select baseline if one is set
  useEffect(() => {
    if (!baselineId && runsData?.runs) {
      const baseline = runsData.runs.find((r) => r.isBaseline);
      if (baseline) {
        setBaselineId(baseline.id);
      }
    }
  }, [baselineId, runsData]);

  const completedRuns =
    runsData?.runs.filter((r) => r.status === "completed") || [];

  return (
    <Container size="xl">
      <Stack gap="lg">
        <Title order={2}>Compare Runs</Title>

        {/* Run Selectors */}
        <Paper p="md" withBorder>
          <Group grow>
            <RunSelector
              label="Baseline Run"
              runs={completedRuns}
              loading={runsLoading}
              value={baselineId}
              onChange={setBaselineId}
              excludeId={compareId}
              highlightBaseline
            />
            <RunSelector
              label="Compare Run"
              runs={completedRuns}
              loading={runsLoading}
              value={compareId}
              onChange={setCompareId}
              excludeId={baselineId}
            />
          </Group>
        </Paper>

        {/* Loading State */}
        {compareLoading && (
          <Stack gap="md">
            <Skeleton height={100} radius="md" />
            <Skeleton height={400} radius="md" />
          </Stack>
        )}

        {/* Error State */}
        {compareError && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            color="red"
            title="Error"
          >
            {compareError instanceof Error
              ? compareError.message
              : "Failed to load comparison data"}
          </Alert>
        )}

        {/* No Selection */}
        {!baselineId || !compareId ? (
          <Paper p="xl" withBorder>
            <Text c="dimmed" ta="center">
              Select both a baseline and a compare run to see the comparison
            </Text>
          </Paper>
        ) : null}

        {/* Comparison Results */}
        {compareData && (
          <>
            {/* Summary */}
            <ComparisonSummary summary={compareData.summary} />

            {/* Tabs for Table and Charts */}
            <Paper p="md" withBorder>
              <Tabs defaultValue="table">
                <Tabs.List>
                  <Tabs.Tab value="table">Comparison Table</Tabs.Tab>
                  <Tabs.Tab value="throughput">Throughput Overlay</Tabs.Tab>
                  <Tabs.Tab value="latency">Latency Overlay</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="table" pt="md">
                  <CompareTable comparisons={compareData.comparisons} />
                </Tabs.Panel>

                <Tabs.Panel value="throughput" pt="md">
                  <OverlayChart
                    type="throughput"
                    comparisons={compareData.comparisons}
                    baselineName={`Run #${compareData.baseline.id}`}
                    compareName={`Run #${compareData.compare.id}`}
                  />
                </Tabs.Panel>

                <Tabs.Panel value="latency" pt="md">
                  <OverlayChart
                    type="latency"
                    comparisons={compareData.comparisons}
                    baselineName={`Run #${compareData.baseline.id}`}
                    compareName={`Run #${compareData.compare.id}`}
                  />
                </Tabs.Panel>
              </Tabs>
            </Paper>
          </>
        )}
      </Stack>
    </Container>
  );
}

export default ComparePage;
