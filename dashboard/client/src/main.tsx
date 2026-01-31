import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, createTheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./styles/global.css";

const theme = createTheme({
  primaryColor: "blue",
  defaultRadius: "md",
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  fontFamilyMonospace: "JetBrains Mono, Fira Code, monospace",
  colors: {
    // Custom dark palette optimized for data visualization
    dark: [
      "#C1C2C5", // 0 - text
      "#A6A7AB", // 1
      "#909296", // 2 - dimmed
      "#5c5f66", // 3
      "#373A40", // 4 - borders
      "#2C2E33", // 5 - card bg hover
      "#25262b", // 6 - card bg
      "#1A1B1E", // 7 - body bg
      "#141517", // 8 - darker bg
      "#101113", // 9 - darkest
    ],
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000, // 30 seconds
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <MantineProvider
        theme={theme}
        defaultColorScheme="dark"
        forceColorScheme="dark"
      >
        <Notifications position="top-right" />
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </MantineProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
