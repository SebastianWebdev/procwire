/**
 * WebSocket integration for real-time benchmark updates.
 */

import type { FastifyInstance } from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import type { WebSocket } from "ws";

// Store for active connections
const connections = new Set<WebSocket>();

/**
 * WebSocket message types sent from server to client.
 */
export interface WsMessage {
  type: string;
  runId?: number;
  timestamp: string;
  [key: string]: unknown;
}

export interface RunStartMessage extends WsMessage {
  type: "run:start";
  runId: number;
  scenarios: string[];
}

export interface ScenarioStartMessage extends WsMessage {
  type: "scenario:start";
  runId: number;
  scenarioId: string;
  total: number;
}

export interface ScenarioProgressMessage extends WsMessage {
  type: "scenario:progress";
  runId: number;
  scenarioId: string;
  current: number;
  total: number;
  currentTest: {
    codec: string;
    size: string;
    mode: string;
  };
}

export interface ResultCompleteMessage extends WsMessage {
  type: "result:complete";
  runId: number;
  scenarioId: string;
  result: import("../db/types.js").ScenarioResult;
}

export interface RunCompleteMessage extends WsMessage {
  type: "run:complete";
  runId: number;
  summary: import("../db/types.js").BenchmarkSummary;
  duration: number;
  regressionSummary?: {
    hasRegressions: boolean;
    hasCriticalRegressions: boolean;
    regressionCount: number;
    criticalCount: number;
  } | null;
}

export interface RunErrorMessage extends WsMessage {
  type: "run:error";
  runId: number;
  error: string;
}

export type WsServerMessage =
  | RunStartMessage
  | ScenarioStartMessage
  | ScenarioProgressMessage
  | ResultCompleteMessage
  | RunCompleteMessage
  | RunErrorMessage;

// Extend Fastify types
declare module "fastify" {
  interface FastifyInstance {
    broadcast: (message: WsServerMessage) => void;
    wsConnections: Set<WebSocket>;
  }
}

/**
 * Register WebSocket support.
 */
export async function registerWebSocket(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifyWebsocket);

  // Make connections accessible
  fastify.decorate("wsConnections", connections);

  // Decorate with broadcast function
  fastify.decorate("broadcast", (message: WsServerMessage) => {
    const payload = JSON.stringify(message);
    for (const socket of connections) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    }
  });

  // WebSocket endpoint
  fastify.get("/ws", { websocket: true }, (socket, request) => {
    // Add to connections
    connections.add(socket);
    fastify.log.info(`WebSocket client connected. Total: ${connections.size}`);

    // Handle disconnect
    socket.on("close", () => {
      connections.delete(socket);
      fastify.log.info(`WebSocket client disconnected. Total: ${connections.size}`);
    });

    // Handle errors
    socket.on("error", (err) => {
      fastify.log.error(err, "WebSocket error");
      connections.delete(socket);
    });

    // Send welcome message
    socket.send(
      JSON.stringify({
        type: "connected",
        timestamp: new Date().toISOString(),
        message: "Connected to Procwire Benchmark Dashboard",
      }),
    );
  });
}

/**
 * Get current connection count.
 */
export function getConnectionCount(): number {
  return connections.size;
}
