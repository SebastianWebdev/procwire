/**
 * Results Page - View benchmark runs and detailed results.
 */

import {
  Container,
  Grid,
  Stack,
  Title,
  Paper,
  Tabs,
  Group,
  Button,
  Skeleton,
  Text,
} from "@mantine/core";
import { IconStar, IconStarFilled } from "@tabler/icons-react";
import { useParams, useNavigate } from "react-router-dom";
import { notifications } from "@mantine/notifications";
import RunList from "../components/RunList";
import SummaryCards from "../components/SummaryCards";
import ThroughputChart from "../components/ThroughputChart";
import LatencyChart from "../components/LatencyChart";
import ResultsTable from "../components/ResultsTable";
import {
  useRuns,
  useRun,
  useRunResults,
  useSetBaseline,
} from "../hooks/useApi";

function ResultsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const selectedId = id ? parseInt(id, 10) : undefined;

  const { data: runsData, isLoading: runsLoading } = useRuns();
  const { data: runDetail, isLoading: runLoading } = useRun(selectedId);
  const { data: resultsData, isLoading: resultsLoading } =
    useRunResults(selectedId);
  const setBaseline = useSetBaseline();

  const handleSelectRun = (runId: number) => {
    navigate(`/results/${runId}`);
  };

  const handleToggleBaseline = async () => {
    if (!selectedId || !runDetail) return;

    try {
      await setBaseline.mutateAsync({
        id: selectedId,
        isBaseline: !runDetail.isBaseline,
      });
      notifications.show({
        title: runDetail.isBaseline ? "Baseline removed" : "Set as baseline",
        message: runDetail.isBaseline
          ? "This run is no longer the baseline"
          : "This run will be used for comparisons",
        color: "blue",
      });
    } catch (error) {
      notifications.show({
        title: "Failed to update baseline",
        message: error instanceof Error ? error.message : "Unknown error",
        color: "red",
      });
    }
  };

  return (
    <Container size="xl">
      <Grid gutter="md">
        {/* Left: Run List */}
        <Grid.Col span={{ base: 12, md: 4, lg: 3 }}>
          <Paper p="md" withBorder h="calc(100vh - 120px)">
            <Stack gap="md">
              <Title order={4}>Benchmark Runs</Title>
              <RunList
                runs={runsData?.runs || []}
                loading={runsLoading}
                selectedId={selectedId}
                onSelect={handleSelectRun}
              />
            </Stack>
          </Paper>
        </Grid.Col>

        {/* Right: Run Details */}
        <Grid.Col span={{ base: 12, md: 8, lg: 9 }}>
          {!selectedId ? (
            <Paper p="xl" withBorder>
              <Text c="dimmed" ta="center">
                Select a run from the list to view details
              </Text>
            </Paper>
          ) : runLoading || resultsLoading ? (
            <Stack gap="md">
              <Skeleton height={100} radius="md" />
              <Skeleton height={300} radius="md" />
              <Skeleton height={400} radius="md" />
            </Stack>
          ) : runDetail && resultsData ? (
            <Stack gap="md">
              {/* Header */}
              <Group justify="space-between">
                <div>
                  <Title order={3}>
                    Run #{runDetail.id}
                    {runDetail.name && ` - ${runDetail.name}`}
                  </Title>
                  <Text size="sm" c="dimmed">
                    {new Date(runDetail.startedAt).toLocaleString()}
                  </Text>
                </div>
                <Button
                  variant={runDetail.isBaseline ? "filled" : "light"}
                  color="yellow"
                  leftSection={
                    runDetail.isBaseline ? (
                      <IconStarFilled size={16} />
                    ) : (
                      <IconStar size={16} />
                    )
                  }
                  onClick={handleToggleBaseline}
                  loading={setBaseline.isPending}
                >
                  {runDetail.isBaseline ? "Baseline" : "Set as Baseline"}
                </Button>
              </Group>

              {/* Summary Cards */}
              {runDetail.summary && (
                <SummaryCards summary={runDetail.summary} meta={runDetail.meta} />
              )}

              {/* Charts & Table Tabs */}
              <Paper p="md" withBorder>
                <Tabs defaultValue="throughput">
                  <Tabs.List>
                    <Tabs.Tab value="throughput">Throughput</Tabs.Tab>
                    <Tabs.Tab value="latency">Latency</Tabs.Tab>
                    <Tabs.Tab value="table">All Results</Tabs.Tab>
                  </Tabs.List>

                  <Tabs.Panel value="throughput" pt="md">
                    <ThroughputChart results={resultsData.results} />
                  </Tabs.Panel>

                  <Tabs.Panel value="latency" pt="md">
                    <LatencyChart results={resultsData.results} />
                  </Tabs.Panel>

                  <Tabs.Panel value="table" pt="md">
                    <ResultsTable
                      results={resultsData.results}
                      targets={runDetail.summary?.performanceTargets}
                    />
                  </Tabs.Panel>
                </Tabs>
              </Paper>
            </Stack>
          ) : (
            <Paper p="xl" withBorder>
              <Text c="dimmed" ta="center">
                Run not found
              </Text>
            </Paper>
          )}
        </Grid.Col>
      </Grid>
    </Container>
  );
}

export default ResultsPage;
