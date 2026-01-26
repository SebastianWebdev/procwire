#!/usr/bin/env node
/**
 * Simple echo worker fixture for integration tests.
 * Uses basic JSON-RPC without full SDK initialization.
 *
 * This simpler worker is used to test the ProcessManager integration
 * without requiring tsx compilation.
 */

import readline from "readline";

// Setup line reader from stdin
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

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

  try {
    switch (method) {
      // Handshake - return worker info
      case "__handshake__": {
        sendResponse(id, {
          protocol_version: params?.protocol_version ?? "1.0",
          worker_name: "simple-echo-worker",
          worker_capabilities: ["heartbeat"],
          worker_version: "1.0.0",
        });
        break;
      }

      // Shutdown - acknowledge and exit
      case "__shutdown__": {
        sendResponse(id, {
          acknowledged: true,
          pending_requests: 0,
        });
        // Exit after a short delay
        setTimeout(() => process.exit(0), 100);
        break;
      }

      case "echo": {
        // Echo back the params
        sendResponse(id, params);
        break;
      }

      case "add": {
        const { a, b } = params;
        sendResponse(id, { sum: a + b });
        break;
      }

      case "slow_echo": {
        // Slow echo with delay
        const { message, delay = 100 } = params;
        await new Promise((resolve) => setTimeout(resolve, delay));
        sendResponse(id, { message, delayed_by: delay });
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

// Process incoming lines
rl.on("line", (line) => {
  try {
    const message = JSON.parse(line);

    // Only handle requests (messages with id field)
    if (message.id !== undefined) {
      handleRequest(message);
    }
    // Silently ignore notifications
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
