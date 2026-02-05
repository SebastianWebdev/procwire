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
 * Stores all 4 types needed for full type-safety on both sides:
 *
 * ```
 * Parent (Module)                    Child (Client)
 * ──────────────                     ──────────────
 * send(data: reqIn)  ──serialize──►  handle(data: reqOut)
 *       ▲                                   │
 *       │                                   ▼
 *   returns resOut   ◄──deserialize──  ctx.respond(resIn)
 * ```
 *
 * For symmetric codecs: reqIn === reqOut, resIn === resOut
 * For asymmetric codecs: types may differ based on codec's serialize/deserialize
 */
export interface MethodDescriptor {
  /** Request type from PARENT perspective (serialize input) */
  readonly reqIn: unknown;
  /** Request type from CHILD perspective (deserialize output) */
  readonly reqOut: unknown;
  /** Response type from CHILD perspective (serialize input) */
  readonly resIn: unknown;
  /** Response type from PARENT perspective (deserialize output) */
  readonly resOut: unknown;
  /** Response mode: "result" | "stream" | "ack" | "none" */
  readonly responseType: string;
}

/**
 * Type-level descriptor for a single registered event.
 */
export interface EventDescriptor {
  /** Event data type (child serialize input) */
  readonly dataIn: unknown;
  /** Event data type (parent deserialize output) */
  readonly dataOut: unknown;
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
 *   .method("search", {
 *     requestCodec: msgpack<SearchQuery>(),
 *     responseCodec: msgpack<SearchResult>(),
 *   });
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

// ═══════════════════════════════════════════════════════════════════════════
// PARENT-SIDE TYPE HELPERS (for Module)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Request type for Module.send() — what parent serializes.
 */
export type ParentRequestType<M extends MethodDescriptor> = M["reqIn"];

/**
 * Response type for Module.send() return — what parent deserializes.
 */
export type ParentResponseType<M extends MethodDescriptor> = M["resOut"];

// ═══════════════════════════════════════════════════════════════════════════
// CHILD-SIDE TYPE HELPERS (for Client)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Request type for Client.handle() — what child deserializes.
 */
export type ChildRequestType<M extends MethodDescriptor> = M["reqOut"];

/**
 * Response type for ctx.respond() — what child serializes.
 */
export type ChildResponseType<M extends MethodDescriptor> = M["resIn"];

// ═══════════════════════════════════════════════════════════════════════════
// EVENT TYPE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Event data type for client.emitEvent() — what child serializes.
 */
export type ChildEventType<E extends EventDescriptor> = E["dataIn"];

/**
 * Event data type for module.onEvent() — what parent deserializes.
 */
export type ParentEventType<E extends EventDescriptor> = E["dataOut"];
