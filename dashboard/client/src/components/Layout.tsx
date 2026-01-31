import { AppShell, Group, Title, useMantineTheme } from "@mantine/core";
import { IconActivity } from "@tabler/icons-react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import ConnectionStatus from "./ConnectionStatus";

function Layout() {
  const theme = useMantineTheme();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 220, breakpoint: "sm" }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <IconActivity size={28} color={theme.colors.blue[5]} />
            <Title order={3}>Procwire Benchmark</Title>
          </Group>
          <ConnectionStatus />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <Sidebar />
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}

export default Layout;
