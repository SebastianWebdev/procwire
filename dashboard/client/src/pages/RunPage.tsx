/**
 * Run Page - Configure and execute benchmark runs with real-time progress.
 */

import { useState } from "react";
import {
  Container,
  Stack,
  Title,
  Button,
  Group,
  Divider,
  Alert,
} from "@mantine/core";
import { IconRocket, IconAlertCircle } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import ScenarioSelector from "../components/ScenarioSelector";
import OptionsForm from "../components/OptionsForm";
import ProgressPanel from "../components/ProgressPanel";
import RunSummaryCard from "../components/RunSummaryCard";
import { useScenarios, useCreateRun } from "../hooks/useApi";
import { useBenchmarkRun } from "../hooks/useBenchmarkRun";
import type { CreateRunRequest } from "../api/types";

interface RunOptions {
  quick: boolean;
  concurrency: number;
  codecs: string[];
  sizes: string[];
  modes: string[];
}

function RunPage() {
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>([]);
  const [options, setOptions] = useState<RunOptions>({
    quick: false,
    concurrency: 1,
    codecs: [],
    sizes: [],
    modes: [],
  });

  const { data: scenariosData, isLoading: scenariosLoading } = useScenarios();
  const createRun = useCreateRun();
  const { runState, startRun, resetRun } = useBenchmarkRun();

  const isRunning = runState.status === "running";
  const isComplete =
    runState.status === "completed" || runState.status === "failed";

  const handleRun = async () => {
    if (selectedScenarios.length === 0) {
      notifications.show({
        title: "No scenarios selected",
        message: "Please select at least one scenario to run",
        color: "yellow",
      });
      return;
    }

    const request: CreateRunRequest = {
      scenarios: selectedScenarios,
      options: {
        quick: options.quick,
        concurrency: options.concurrency,
        codecs: options.codecs.length > 0 ? (options.codecs as ("raw" | "msgpack" | "arrow")[]) : undefined,
        sizes: options.sizes.length > 0 ? (options.sizes as ("1KB" | "10KB" | "100KB" | "1MB" | "10MB" | "100MB")[]) : undefined,
        modes: options.modes.length > 0 ? (options.modes as ("result" | "stream" | "ack")[]) : undefined,
      },
    };

    try {
      const response = await createRun.mutateAsync(request);
      startRun(response.id);
    } catch (error) {
      notifications.show({
        title: "Failed to start benchmark",
        message: error instanceof Error ? error.message : "Unknown error",
        color: "red",
      });
    }
  };

  const handleNewRun = () => {
    resetRun();
  };

  return (
    <Container size="lg">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Title order={2}>Run Benchmark</Title>
          {isComplete && (
            <Button variant="light" onClick={handleNewRun}>
              New Run
            </Button>
          )}
        </Group>

        {/* Scenario Selection */}
        {!isRunning && !isComplete && (
          <>
            <ScenarioSelector
              scenarios={scenariosData?.scenarios || []}
              selected={selectedScenarios}
              onChange={setSelectedScenarios}
              loading={scenariosLoading}
            />

            <Divider />

            {/* Options */}
            <OptionsForm options={options} onChange={setOptions} />

            <Divider />

            {/* Run Button */}
            <Group justify="center">
              <Button
                size="lg"
                leftSection={<IconRocket size={20} />}
                onClick={handleRun}
                loading={createRun.isPending}
                disabled={selectedScenarios.length === 0}
              >
                Run Benchmark
              </Button>
            </Group>
          </>
        )}

        {/* Progress Panel */}
        {isRunning && <ProgressPanel runState={runState} />}

        {/* Completion Summary */}
        {isComplete && runState.summary && (
          <RunSummaryCard
            runId={runState.runId!}
            summary={runState.summary}
            status={runState.status as "completed" | "failed"}
            duration={runState.duration}
          />
        )}

        {/* Error Display */}
        {runState.error && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            title="Benchmark Failed"
            color="red"
          >
            {runState.error}
          </Alert>
        )}
      </Stack>
    </Container>
  );
}

export default RunPage;
