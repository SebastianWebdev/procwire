/**
 * Schema type utilities for end-to-end type safety.
 *
 * These types are shared between @procwire/core (parent-side) and
 * @procwire/client (child-side) since both packages depend on @procwire/codecs.
 *
 * @module
 */

import type { Codec } from "./types.js";

// ═══════════════════════════════════════════════════════════════════════════
// CODEC TYPE EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract the input type (serialize parameter) from a Codec.
 */
export type InferCodecInput<C> = C extends Codec<infer I, unknown> ? I : unknown;

/**
 * Extract the output type (deserialize return) from a Codec.
 */
export type InferCodecOutput<C> = C extends Codec<unknown, infer O> ? O : unknown;

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMA DESCRIPTORS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Type-level descriptor for a single registered method.
 *
 * - `request` — data type accepted by `Module.send()` / received by child handler
 * - `response` — data type accepted by `ctx.respond()` / returned by `Module.send()`
 * - `responseType` — "result" | "stream" | "ack" | "none"
 */
export interface MethodDescriptor {
  readonly request: unknown;
  readonly response: unknown;
  readonly responseType: string;
}

/**
 * Type-level descriptor for a single registered event.
 */
export interface EventDescriptor {
  readonly data: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Schema shape — describes all methods and events of a module.
 *
 * Used as the generic parameter for `Module<S>` and `Client<S>`.
 */
export interface Schema {
  readonly methods: Record<string, MethodDescriptor>;
  readonly events: Record<string, EventDescriptor>;
}

/**
 * Empty schema — default generic for untyped `Module` / `Client`.
 *
 * When `S = EmptySchema`, typed overloads never match (because `keyof {}` = `never`),
 * so all calls fall through to untyped backward-compatible signatures.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type EmptySchema = { methods: {}; events: {} };

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMA EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract the schema type from a Module or Client instance.
 *
 * @example
 * ```typescript
 * // parent.ts
 * const worker = new Module("worker")
 *   .method("search", { codec: msgpack<SearchQuery, SearchResult>() });
 *
 * export type WorkerSchema = ExtractSchema<typeof worker>;
 *
 * // child.ts
 * import type { WorkerSchema } from "./parent.js";
 * const client = new Client<WorkerSchema>();
 * ```
 */
export type ExtractSchema<T> = T extends { readonly __schema: infer S extends Schema }
  ? S
  : EmptySchema;
