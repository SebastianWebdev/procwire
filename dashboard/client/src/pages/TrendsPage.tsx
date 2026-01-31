/**
 * Trends Page - Historical analysis and visualization.
 */

import { useState, useMemo } from "react";
import {
  Container,
  Stack,
  Title,
  Paper,
  Grid,
  Group,
  Tabs,
} from "@mantine/core";
import FilterPanel from "../components/FilterPanel";
import MetricSelector from "../components/MetricSelector";
import TrendChart from "../components/TrendChart";
import HistoryTable from "../components/HistoryTable";
import ExportButton from "../components/ExportButton";
import { useRuns, useTrends } from "../hooks/useApi";
import type { TrendsParams, PayloadSize, CodecType, ResponseMode } from "../api/types";

type Metric = "throughput" | "latency_p99" | "rps";

interface Filters {
  size: string;
  codec: string;
  mode: string;
  days: number;
}

function TrendsPage() {
  const [metric, setMetric] = useState<Metric>("throughput");
  const [filters, setFilters] = useState<Filters>({
    size: "1KB",
    codec: "raw",
    mode: "result",
    days: 30,
  });

  const { data: runsData, isLoading: runsLoading } = useRuns({ limit: 100 });

  const trendsParams: TrendsParams = useMemo(
    () => ({
      metric,
      size: filters.size as PayloadSize,
      codec: filters.codec as CodecType,
      mode: filters.mode as ResponseMode,
      days: filters.days,
    }),
    [metric, filters]
  );

  const { data: trendsData, isLoading: trendsLoading } = useTrends(trendsParams);

  const handleFilterChange = (key: keyof Filters, value: string | number) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Container size="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={2}>Performance Trends</Title>
          <ExportButton
            data={trendsData?.dataPoints}
            runs={runsData?.runs}
            filters={filters}
          />
        </Group>

        {/* Filters */}
        <Paper p="md" withBorder>
          <Grid gutter="md">
            <Grid.Col span={{ base: 12, md: 8 }}>
              <FilterPanel filters={filters} onChange={handleFilterChange} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <MetricSelector value={metric} onChange={setMetric} />
            </Grid.Col>
          </Grid>
        </Paper>

        {/* Content Tabs */}
        <Paper p="md" withBorder>
          <Tabs defaultValue="chart">
            <Tabs.List>
              <Tabs.Tab value="chart">Trend Chart</Tabs.Tab>
              <Tabs.Tab value="history">Run History</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="chart" pt="md">
              <TrendChart
                data={trendsData?.dataPoints || []}
                loading={trendsLoading}
                metric={metric}
              />
            </Tabs.Panel>

            <Tabs.Panel value="history" pt="md">
              <HistoryTable runs={runsData?.runs || []} loading={runsLoading} />
            </Tabs.Panel>
          </Tabs>
        </Paper>
      </Stack>
    </Container>
  );
}

export default TrendsPage;
