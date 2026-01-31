/**
 * Register all API routes.
 */

import type { FastifyInstance } from "fastify";
import { scenariosRoutes } from "./scenarios.js";
import { runsRoutes } from "./runs.js";
import { compareRoutes } from "./compare.js";
import { trendsRoutes } from "./trends.js";

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(scenariosRoutes);
  await fastify.register(runsRoutes);
  await fastify.register(compareRoutes);
  await fastify.register(trendsRoutes);
}
