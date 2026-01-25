#!/usr/bin/env node
/**
 * Simple async worker fixture for integration tests.
 * Tests async handlers and concurrency.
 */

import readline from "readline";

// Setup line reader from stdin
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

// Track concurrent requests
let concurrentRequests = 0;
let maxConcurrent = 0;

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
      // Handshake
      case "__handshake__": {
        sendResponse(id, {
          protocol_version: params?.protocol_version ?? "1.0",
          worker_name: "simple-async-worker",
          worker_capabilities: ["heartbeat"],
          worker_version: "1.0.0",
        });
        break;
      }

      // Shutdown
      case "__shutdown__": {
        sendResponse(id, {
          acknowledged: true,
          pending_requests: concurrentRequests,
        });
        setTimeout(() => process.exit(0), 100);
        break;
      }

      case "concurrent_test": {
        concurrentRequests++;
        maxConcurrent = Math.max(maxConcurrent, concurrentRequests);

        const { id: reqId, delay } = params;
        await new Promise((resolve) => setTimeout(resolve, delay));

        concurrentRequests--;

        sendResponse(id, {
          id: reqId,
          concurrent_at_start: maxConcurrent,
        });
        break;
      }

      case "get_max_concurrent": {
        sendResponse(id, { max: maxConcurrent });
        break;
      }

      case "reset_concurrent": {
        maxConcurrent = 0;
        sendResponse(id, { reset: true });
        break;
      }

      case "long_task": {
        const { steps, step_delay } = params;
        const results = [];

        for (let i = 0; i < steps; i++) {
          await new Promise((resolve) => setTimeout(resolve, step_delay));
          results.push(i);
        }

        sendResponse(id, { completed: true, results });
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

    if (message.id !== undefined) {
      handleRequest(message);
    }
  } catch {
    sendError(null, -32700, "Parse error");
  }
});

rl.on("error", (error) => {
  process.stderr.write(`Worker error: ${error.message}\n`);
  process.exit(1);
});
