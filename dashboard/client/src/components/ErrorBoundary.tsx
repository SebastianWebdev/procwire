/**
 * Error boundary component for catching React errors.
 */

import { Component, type ReactNode } from "react";
import {
  Container,
  Paper,
  Title,
  Text,
  Button,
  Stack,
  Code,
  Group,
} from "@mantine/core";
import { IconAlertCircle, IconRefresh } from "@tabler/icons-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Container size="sm" py="xl">
          <Paper p="xl" withBorder>
            <Stack align="center" gap="md">
              <IconAlertCircle size={48} color="var(--mantine-color-red-5)" />
              <Title order={2}>Something went wrong</Title>
              <Text c="dimmed" ta="center">
                An unexpected error occurred. Please try refreshing the page.
              </Text>

              {this.state.error && (
                <Code block w="100%">
                  {this.state.error.message}
                </Code>
              )}

              <Group>
                <Button
                  leftSection={<IconRefresh size={16} />}
                  onClick={this.handleReload}
                >
                  Refresh Page
                </Button>
                <Button variant="light" onClick={this.handleReset}>
                  Try Again
                </Button>
              </Group>
            </Stack>
          </Paper>
        </Container>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
