/**
 * Dashboard server - Fastify-based REST API with WebSocket support.
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { BenchmarkDbService } from "../db/service.js";
import { registerRoutes } from "./routes/index.js";
import { registerWebSocket } from "./websocket.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Extend Fastify types
declare module "fastify" {
  interface FastifyInstance {
    db: BenchmarkDbService;
  }
}

export interface ServerOptions {
  dbPath?: string;
  port?: number;
  host?: string;
  staticDir?: string;
  logger?: boolean;
}

/**
 * Create a Fastify server instance.
 */
export async function createServer(options: ServerOptions = {}) {
  const {
    dbPath = "./dashboard.db",
    port = 3001,
    host = "0.0.0.0",
    staticDir,
    logger = true,
  } = options;

  const fastify = Fastify({
    logger: logger
      ? {
          level: "info",
          transport: {
            target: "pino-pretty",
            options: { colorize: true },
          },
        }
      : false,
  });

  // CORS for frontend dev server
  await fastify.register(cors, {
    origin: ["http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "DELETE"],
  });

  // Initialize database
  const db = new BenchmarkDbService(dbPath);
  db.initialize();

  // Decorate fastify with db
  fastify.decorate("db", db);

  // Close db on shutdown
  fastify.addHook("onClose", () => {
    db.close();
  });

  // Register WebSocket BEFORE routes
  await registerWebSocket(fastify);

  // Register API routes
  await registerRoutes(fastify);

  // Serve static files (production)
  if (staticDir) {
    await fastify.register(fastifyStatic, {
      root: path.resolve(staticDir),
      prefix: "/",
    });

    // SPA fallback
    fastify.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        reply.code(404).send({ error: "Not Found" });
      } else {
        reply.sendFile("index.html");
      }
    });
  }

  return { fastify, port, host, db };
}

/**
 * Start the server.
 */
export async function startServer(options?: ServerOptions) {
  const { fastify, port, host } = await createServer(options);

  try {
    await fastify.listen({ port, host });
    console.log(`Dashboard server running at http://${host}:${port}`);
    console.log(`API available at http://${host}:${port}/api/scenarios`);
    console.log(`WebSocket available at ws://${host}:${port}/ws`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  return fastify;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  const port = parseInt(args.find((a) => a.startsWith("--port="))?.split("=")[1] ?? "3001", 10);

  const dbPath = args.find((a) => a.startsWith("--db="))?.split("=")[1] ?? "./dashboard.db";

  startServer({ port, dbPath });
}
