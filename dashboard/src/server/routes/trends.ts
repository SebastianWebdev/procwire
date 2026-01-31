/**
 * GET /api/trends - Get historical trend data.
 */

import type { FastifyInstance } from "fastify";
import type { TrendsQuery, TrendsResponse, ErrorResponse } from "../types.js";

export async function trendsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Querystring: TrendsQuery;
    Reply: TrendsResponse | ErrorResponse;
  }>("/api/trends", async (request, reply) => {
    const {
      metric,
      size,
      codec = "raw",
      mode = "result",
      days = 30,
    } = request.query;

    if (!metric || !size) {
      return reply.code(400).send({
        error: "Both metric and size query parameters are required",
      });
    }

    // Validate metric
    if (!["throughput", "latency_p99", "rps"].includes(metric)) {
      return reply.code(400).send({
        error: "Invalid metric. Must be: throughput, latency_p99, or rps",
      });
    }

    // Get trend data
    const dataPoints = fastify.db.getTrendData({
      metric: metric as "throughput" | "latency_p99" | "rps",
      size: size as import("../types.js").PayloadSize,
      codec: codec as import("../types.js").CodecType,
      mode: mode as import("../types.js").ResponseMode,
      days,
    });

    return {
      metric,
      filter: { size, codec, mode },
      dataPoints,
    };
  });
}
