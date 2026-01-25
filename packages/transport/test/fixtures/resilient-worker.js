#!/usr/bin/env node
/**
 * Test fixture worker for resilience integration tests.
 *
 * Supports:
 * - echo: Returns params unchanged
 * - sleep: Waits for specified ms, then returns { ok: true }
 * - __heartbeat_ping__: Responds with __heartbeat_pong__ notification
 * - __shutdown__: Acknowledges shutdown and exits gracefully
 */

import readline from "readline";

// Setup line reader from stdin
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

let pendingRequests = 0;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let shuttingDown = false;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let shutdownTimeout = null;

/**
 * Sends a JSON-RPC notification to stdout.
 */
function sendNotification(method, params) {
  const notification = {
    jsonrpc: "2.0",
    method,
    params,
  };
  process.stdout.write(JSON.stringify(notification) + "\n");
}

/**
 * Sends a JSON-RPC response to stdout.
 */
function sendResponse(id, result) {
  const response = {
    jsonrpc: "2.0",
    id,
    result,
  };
  process.stdout.write(JSON.stringify(response) + "\n");
}

/**
 * Sends a JSON-RPC error response to stdout.
 */
function sendError(id, code, message) {
  const response = {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  };
  process.stdout.write(JSON.stringify(response) + "\n");
}

/**
 * Handles incoming JSON-RPC request.
 */
async function handleRequest(request) {
  const { id, method, params } = request;

  // Handle requests
  if (id !== undefined) {
    try {
      switch (method) {
        case "echo": {
          pendingRequests++;
          sendResponse(id, params);
          pendingRequests--;
          break;
        }

        case "sleep": {
          pendingRequests++;
          const ms = params?.ms ?? 0;
          await new Promise((resolve) => setTimeout(resolve, ms));
          sendResponse(id, { ok: true });
          pendingRequests--;
          break;
        }

        case "__shutdown__": {
          // Acknowledge shutdown
          shuttingDown = true;
          const timeoutMs = params?.timeout_ms ?? 5000;

          sendResponse(id, {
            status: "shutting_down",
            pending_requests: pendingRequests,
          });

          // Start graceful shutdown
          if (pendingRequests === 0) {
            sendNotification("__shutdown_complete__", { exit_code: 0 });
            process.exit(0);
          } else {
            // Wait for pending requests with timeout
            shutdownTimeout = setTimeout(() => {
              sendNotification("__shutdown_complete__", { exit_code: 1 });
              process.exit(1);
            }, timeoutMs);
          }
          break;
        }

        default:
          sendError(id, -32601, `Method not found: ${method}`);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      sendError(id, -32603, error.message);
    }
  }
}

/**
 * Handles incoming JSON-RPC notification.
 */
function handleNotification(notification) {
  const { method, params } = notification;

  switch (method) {
    case "__heartbeat_ping__": {
      // Respond with pong
      sendNotification("__heartbeat_pong__", {
        timestamp: params?.timestamp ?? Date.now(),
        seq: params?.seq ?? 0,
      });
      break;
    }
  }
}

// Process incoming lines
rl.on("line", (line) => {
  try {
    const message = JSON.parse(line);

    if (message.id !== undefined) {
      // Request
      handleRequest(message);
    } else if (message.method !== undefined) {
      // Notification
      handleNotification(message);
    }
  } catch {
    // Invalid JSON - send parse error
    sendError(null, -32700, "Parse error");
  }
});

// Handle errors
rl.on("error", (error) => {
  process.stderr.write(`Worker error: ${error.message}\n`);
  process.exit(1);
});

// Send ready notification on startup
sendNotification("runtime.ready", { pid: process.pid });
