/**
 * Basic stdio IPC example - Worker process.
 *
 * Simple JSON-RPC worker that communicates via stdio using line-delimited JSON.
 * No external dependencies - uses only Node.js built-ins.
 */

import { createInterface } from "node:readline";

// JSON-RPC handler registry
const handlers = {
  add: ({ a, b }) => a + b,
  multiply: ({ a, b }) => a * b,
  greet: ({ name }) => `Hello, ${name}!`,
};

// Notification handlers
const notificationHandlers = {
  shutdown: () => {
    sendNotification("log", { message: "Shutting down..." });
    // Give time for notification to send
    setTimeout(() => process.exit(0), 100);
  },
};

/**
 * Sends a JSON-RPC response.
 */
function sendResponse(id, result) {
  const response = {
    jsonrpc: "2.0",
    id,
    result,
  };
  console.log(JSON.stringify(response));
}

/**
 * Sends a JSON-RPC error response.
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
  console.log(JSON.stringify(response));
}

/**
 * Sends a JSON-RPC notification.
 */
function sendNotification(method, params) {
  const notification = {
    jsonrpc: "2.0",
    method,
    params,
  };
  console.log(JSON.stringify(notification));
}

/**
 * Handles incoming JSON-RPC request.
 */
function handleRequest(request) {
  const { id, method, params } = request;

  // Handle notification (no id)
  if (id === undefined) {
    const handler = notificationHandlers[method];
    if (handler) {
      handler(params);
    } else {
      sendNotification("log", { message: `Unknown notification: ${method}` });
    }
    return;
  }

  // Handle request
  const handler = handlers[method];

  if (!handler) {
    sendError(id, -32601, `Method not found: ${method}`);
    return;
  }

  try {
    const result = handler(params);
    sendResponse(id, result);

    // Send notification about request processed
    sendNotification("log", { message: `Processed ${method}` });
  } catch (error) {
    sendError(id, -32603, error.message);
  }
}

/**
 * Main worker loop - reads line-delimited JSON-RPC from stdin.
 */
function main() {
  sendNotification("log", { message: "Worker started" });

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on("line", (line) => {
    try {
      const request = JSON.parse(line);
      handleRequest(request);
    } catch (error) {
      sendNotification("log", { message: `Parse error: ${error.message}` });
    }
  });

  rl.on("close", () => {
    process.exit(0);
  });
}

main();
