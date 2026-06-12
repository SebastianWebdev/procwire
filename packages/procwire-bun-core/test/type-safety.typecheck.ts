/**
 * Compile-only type tests for the Bun parent-side package (Workstream B).
 *
 * `expectTypeOf` is vitest-only, so for the Bun packages the typing is pinned
 * with bare type-level assertions + `@ts-expect-error`, verified by
 * `tsc -p tsconfig.json --noEmit` (the `typecheck` script, run in CI).
 * `bun test` ignores this file (no .test. suffix) - nothing here executes.
 *
 * The assertions mirror packages/core/test/type-safety.test.ts: after the A2
 * extraction both runtimes share ModuleCore, so the typing must be identical.
 */

import { Module } from "../src/index.js";
import {
  msgpack,
  msgpackCodec,
  rawCodec,
  type ExtractSchema,
  type Schema,
  type EmptySchema,
} from "@procwire/codecs";
import type { SendReturn } from "@procwire/runtime-core";

// ═══════════════════════════════════════════════════════════════════════════
// TYPE-LEVEL ASSERTION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

interface SearchQuery {
  query: string;
  limit: number;
}

interface SearchResult {
  items: string[];
  total: number;
}

interface ProgressEvent {
  percent: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMA ACCUMULATION (builder pattern)
// ═══════════════════════════════════════════════════════════════════════════

// Single codec (symmetric shorthand): all four types are the codec's type.
{
  const _mod = new Module("test").method("echo", { codec: msgpack<SearchQuery>() });
  type S = ExtractSchema<typeof _mod>;
  type M = S["methods"]["echo"];

  type _ReqIn = Expect<Equal<M["reqIn"], SearchQuery>>;
  type _ReqOut = Expect<Equal<M["reqOut"], SearchQuery>>;
  type _ResIn = Expect<Equal<M["resIn"], SearchQuery>>;
  type _ResOut = Expect<Equal<M["resOut"], SearchQuery>>;
  type _RT = Expect<Equal<M["responseType"], "result">>;
}

// Dual codecs: request and response sides typed independently.
{
  const _mod = new Module("test").method("search", {
    requestCodec: msgpack<SearchQuery>(),
    responseCodec: msgpack<SearchResult>(),
  });
  type S = ExtractSchema<typeof _mod>;
  type M = S["methods"]["search"];

  type _ReqIn = Expect<Equal<M["reqIn"], SearchQuery>>;
  type _ResOut = Expect<Equal<M["resOut"], SearchResult>>;
}

// rawCodec carries Buffer; bare/untyped methods resolve to unknown.
{
  const _mod = new Module("test").method("binary", { codec: rawCodec }).method("bare");
  type S = ExtractSchema<typeof _mod>;

  type _Raw = Expect<Equal<S["methods"]["binary"]["reqIn"], Buffer>>;
  type _Bare = Expect<Equal<S["methods"]["bare"]["reqIn"], unknown>>;
}

// Methods accumulate across the chain and events accumulate independently.
{
  const _mod = new Module("test")
    .method("search", { codec: msgpack<SearchQuery>() })
    .method("count", { codec: msgpack<{ table: string }>() })
    .event("progress", { codec: msgpack<ProgressEvent>() });
  type S = ExtractSchema<typeof _mod>;

  type _M1 = Expect<Equal<S["methods"]["search"]["reqIn"], SearchQuery>>;
  type _M2 = Expect<Equal<S["methods"]["count"]["reqIn"], { table: string }>>;
  type _E = Expect<Equal<S["events"]["progress"]["dataOut"], ProgressEvent>>;
}

// Non-schema builder methods (executable/spawnPolicy/...) preserve the schema.
{
  const _mod = new Module("test")
    .method("search", { codec: msgpack<SearchQuery>() })
    .executable("bun", ["worker.ts"])
    .spawnPolicy({ restartOnCrash: true })
    .requestTimeout(5000);
  type S = ExtractSchema<typeof _mod>;

  type _Kept = Expect<Equal<S["methods"]["search"]["reqIn"], SearchQuery>>;
}

// ═══════════════════════════════════════════════════════════════════════════
// SEND / STREAM / ONEVENT SURFACE
// ═══════════════════════════════════════════════════════════════════════════

declare const searchQuery: SearchQuery;

// send() returns the response type for result methods (SendReturn helper).
{
  type _Result = Expect<Equal<SendReturn<SearchResult, "result">, SearchResult>>;
  type _Ack = Expect<Equal<SendReturn<SearchResult, "ack">, SearchResult>>;
  type _None = Expect<Equal<SendReturn<SearchResult, "none">, void>>;
  type _Stream = Expect<Equal<SendReturn<SearchResult, "stream">, never>>;
}

// Typed send(): correct method+payload resolves to the schema's response.
{
  const mod = new Module("test").method("search", {
    requestCodec: msgpack<SearchQuery>(),
    responseCodec: msgpack<SearchResult>(),
  });

  const _result = mod.send("search", searchQuery);
  type _R = Expect<Equal<typeof _result, Promise<SearchResult>>>;
}

// Typed stream(): yields the response chunk type.
{
  const mod = new Module("test").method("rows", {
    codec: msgpack<SearchResult>(),
    response: "stream",
  });

  const _gen = mod.stream("rows", searchQuery as never);
  type _G = Expect<Equal<typeof _gen, AsyncGenerator<SearchResult>>>;
}

// Typed onEvent(): handler data is the event's dataOut.
{
  const mod = new Module("test").method("x").event("progress", { codec: msgpack<ProgressEvent>() });

  mod.onEvent("progress", (data) => {
    type _D = Expect<Equal<typeof data, ProgressEvent>>;
    void data;
  });
}

// Module without a type argument defaults to EmptySchema, like Node.
{
  type _Default = Expect<Equal<ExtractSchema<Module>, EmptySchema>>;
  type _IsSchema = Expect<ExtractSchema<Module> extends Schema ? true : false>;
}

// suppress "declared but never used" for the documentation-only consts above
void msgpackCodec;
