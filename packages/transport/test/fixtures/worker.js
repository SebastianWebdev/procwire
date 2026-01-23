#!/usr/bin/env node
/**
 * Test fixture worker for ProcessManager integration tests.
 *
 * Reads line-delimited JSON-RPC from stdin and responds on stdout.
 * Zero external dependencies - pure Node.js.
 *
 * Supported methods:
 * - echo: Returns params unchanged
 * - sleep: Waits for specified ms, then returns { ok: true }
 * - crash: Exits process with code 1
 */

import readline from "readline";

// Setup line reader from stdin
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

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

  try {
    switch (method) {
      case "echo": {
        // Echo back the params
        sendResponse(id, params);
        break;
      }

      case "sleep": {
        // Sleep for specified milliseconds
        const ms = params?.ms ?? 0;
        await new Promise((resolve) => setTimeout(resolve, ms));
        sendResponse(id, { ok: true });
        break;
      }

      case "crash":
        // Exit immediately with error code
        process.exit(1);
        break;

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

// Send ready notification on startup
sendNotification("runtime.ready", { pid: process.pid });
