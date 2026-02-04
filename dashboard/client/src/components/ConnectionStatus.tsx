import { Badge } from "@mantine/core";
import { useState, useEffect } from "react";

type Status = "connecting" | "connected" | "disconnected";

function ConnectionStatus() {
  const [status, setStatus] = useState<Status>("connecting");

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const response = await fetch("/api/scenarios");
        if (response.ok) {
          setStatus("connected");
        } else {
          setStatus("disconnected");
        }
      } catch {
        setStatus("disconnected");
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30_000);

    return () => clearInterval(interval);
  }, []);

  const color = status === "connected" ? "green" : status === "connecting" ? "yellow" : "red";
  const label =
    status === "connected"
      ? "Connected"
      : status === "connecting"
        ? "Connecting..."
        : "Disconnected";

  return (
    <Badge color={color} variant="dot" size="lg">
      {label}
    </Badge>
  );
}

export default ConnectionStatus;
