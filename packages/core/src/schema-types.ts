/**
 * Schema accumulation and helper types for Module builder pattern.
 *
 * These types are specific to @procwire/core. Shared schema types
 * (Schema, MethodDescriptor, etc.) live in @procwire/codecs.
 *
 * @module
 */

import type { Codec, Schema, InferCodecInput, InferCodecOutput } from "@procwire/codecs";
import type { ResponseType } from "./types.js";

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMA ACCUMULATION (used by Module builder pattern)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Add a method to schema with dual codecs (full 4-type control).
 *
 * Used internally by `Module.method()` when `requestCodec` + `responseCodec` are provided.
 */
export type AddMethod<
  S extends Schema,
  Name extends string,
  CReq extends Codec,
  CRes extends Codec,
  RT extends ResponseType,
> = {
  methods: S["methods"] &
    Record<
      Name,
      {
        reqIn: InferCodecInput<CReq>;
        reqOut: InferCodecOutput<CReq>;
        resIn: InferCodecInput<CRes>;
        resOut: InferCodecOutput<CRes>;
        responseType: RT;
      }
    >;
  events: S["events"];
};

/**
 * Add a method with a single symmetric codec (shorthand).
 *
 * Used internally by `Module.method()` when `codec:` is provided.
 * Uses the same codec for both request and response directions.
 */
export type AddMethodSymmetric<
  S extends Schema,
  Name extends string,
  C extends Codec,
  RT extends ResponseType,
> = {
  methods: S["methods"] &
    Record<
      Name,
      {
        reqIn: InferCodecInput<C>;
        reqOut: InferCodecOutput<C>;
        resIn: InferCodecInput<C>;
        resOut: InferCodecOutput<C>;
        responseType: RT;
      }
    >;
  events: S["events"];
};

/**
 * Add an event to the schema type.
 *
 * Used internally by `Module.event()` to accumulate the schema.
 */
export type AddEvent<S extends Schema, Name extends string, C extends Codec> = {
  methods: S["methods"];
  events: S["events"] &
    Record<
      Name,
      {
        dataIn: InferCodecInput<C>;
        dataOut: InferCodecOutput<C>;
      }
    >;
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

/**
 * Extract method names that have a specific response type.
 *
 * Used to constrain `stream()` to only accept methods with `responseType: "stream"`.
 */
export type MethodsWithResponseType<S extends Schema, RT extends string> = {
  [K in keyof S["methods"]]: S["methods"][K]["responseType"] extends RT ? K : never;
}[keyof S["methods"]];

// ═══════════════════════════════════════════════════════════════════════════
// TYPED CONFIG (preserves codec generics through method() call)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Method config with dual codecs (full control).
 *
 * Use when request and response need different codecs,
 * or when using asymmetric codecs like Arrow.
 */
export interface DualCodecMethodConfig<CReq extends Codec = Codec, CRes extends Codec = Codec> {
  requestCodec: CReq;
  responseCodec: CRes;
  response?: ResponseType;
  timeout?: number | undefined;
  cancellable?: boolean;
}

/**
 * Method config with single codec (symmetric shorthand).
 *
 * Use when the same codec handles both request and response.
 */
export interface SingleCodecMethodConfig<C extends Codec = Codec> {
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
