#!/usr/bin/env node
/**
 * Simple error worker fixture for integration tests.
 * Tests error handling scenarios.
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
      // Handshake
      case "__handshake__": {
        sendResponse(id, {
          protocol_version: params?.protocol_version ?? "1.0",
          worker_name: "simple-error-worker",
          worker_capabilities: ["heartbeat"],
          worker_version: "1.0.0",
        });
        break;
      }

      // Shutdown
      case "__shutdown__": {
        sendResponse(id, {
          acknowledged: true,
          pending_requests: 0,
        });
        setTimeout(() => process.exit(0), 100);
        break;
      }

      case "throw_sync": {
        throw new Error("Intentional sync error");
      }

      case "throw_async": {
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new Error("Intentional async error");
      }

      case "return_error": {
        sendResponse(id, { error: "This is an error object, not a thrown error" });
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
