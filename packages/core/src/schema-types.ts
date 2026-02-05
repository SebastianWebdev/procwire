/**
 * Schema accumulation and helper types for Module builder pattern.
 *
 * These types are specific to @procwire/core. Shared schema types
 * (Schema, MethodDescriptor, etc.) live in @procwire/codecs.
 *
 * @module
 */

import type { Codec, Schema } from "@procwire/codecs";
import type { ResponseType } from "./types.js";

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMA ACCUMULATION (used by Module builder pattern)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Add a method to the schema type.
 *
 * Used internally by `Module.method()` to accumulate the schema.
 */
export type AddMethod<
  S extends Schema,
  Name extends string,
  TReq,
  TRes,
  RT extends ResponseType,
> = {
  methods: S["methods"] & Record<Name, { request: TReq; response: TRes; responseType: RT }>;
  events: S["events"];
};

/**
 * Add an event to the schema type.
 *
 * Used internally by `Module.event()` to accumulate the schema.
 */
export type AddEvent<S extends Schema, Name extends string, TData> = {
  methods: S["methods"];
  events: S["events"] & Record<Name, { data: TData }>;
};

// ═══════════════════════════════════════════════════════════════════════════
// SEND/STREAM RETURN TYPE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute the return type of `send()` based on the method's response type.
 *
 * - `"result"` → `TRes`
 * - `"ack"` → `TRes`
 * - `"none"` → `void`
 * - `"stream"` → `never` (compile error — use `stream()` instead)
 */
export type SendReturn<TRes, TResponseType extends string> = TResponseType extends "result"
  ? TRes
  : TResponseType extends "ack"
    ? TRes
    : TResponseType extends "none"
      ? void
      : never;

// ═══════════════════════════════════════════════════════════════════════════
// TYPED CONFIG (preserves codec generics through method() call)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Method config that preserves the codec's generic type parameters.
 *
 * This is the config parameter type for `Module.method()`.
 * By making `codec` generic over `C extends Codec`, TypeScript can
 * infer the codec's input/output types at the call site.
 */
export interface TypedMethodConfig<C extends Codec = Codec> {
  codec?: C;
  response?: ResponseType;
  timeout?: number | undefined;
  cancellable?: boolean;
}

/**
 * Event config that preserves the codec's generic type parameters.
 */
export interface TypedEventConfig<C extends Codec = Codec> {
  codec?: C;
}
