/**
 * Type safety tests for Module<S> builder pattern and schema inference.
 *
 * These tests verify compile-time type behavior using vitest's `expectTypeOf`.
 * No runtime assertions — everything here is checked by the TypeScript compiler.
 */

import { describe, it, expectTypeOf } from "vitest";
import { Module } from "../src/module.js";
import {
  msgpack,
  msgpackCodec,
  rawCodec,
  type MsgPackCodec,
  type ExtractSchema,
  type InferCodecInput,
  type InferCodecOutput,
} from "@procwire/codecs";
import type { SendReturn } from "../src/schema-types.js";

// ═══════════════════════════════════════════════════════════════════════════
// TEST TYPES
// ═══════════════════════════════════════════════════════════════════════════

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
  message: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("Type Safety - Codec Type Extraction", () => {
  it("should extract input/output from MsgPackCodec<T>", () => {
    expectTypeOf<InferCodecInput<MsgPackCodec<SearchQuery>>>().toEqualTypeOf<SearchQuery>();
    expectTypeOf<InferCodecOutput<MsgPackCodec<SearchQuery>>>().toEqualTypeOf<SearchQuery>();
  });

  it("should extract asymmetric types from MsgPackCodec<TIn, TOut>", () => {
    expectTypeOf<
      InferCodecInput<MsgPackCodec<SearchQuery, SearchResult>>
    >().toEqualTypeOf<SearchQuery>();
    expectTypeOf<
      InferCodecOutput<MsgPackCodec<SearchQuery, SearchResult>>
    >().toEqualTypeOf<SearchResult>();
  });

  it("should extract Buffer types from rawCodec", () => {
    expectTypeOf<InferCodecInput<typeof rawCodec>>().toEqualTypeOf<Buffer>();
    expectTypeOf<InferCodecOutput<typeof rawCodec>>().toEqualTypeOf<Buffer>();
  });

  it("should extract unknown from untyped msgpackCodec singleton", () => {
    expectTypeOf<InferCodecInput<typeof msgpackCodec>>().toEqualTypeOf<unknown>();
    expectTypeOf<InferCodecOutput<typeof msgpackCodec>>().toEqualTypeOf<unknown>();
  });
});

describe("Type Safety - Module Builder Accumulation", () => {
  it("should infer method types from typed codec", () => {
    const mod = new Module("test").method("search", {
      codec: msgpack<SearchQuery, SearchResult>(),
      response: "result",
    });
    void mod;

    type S = ExtractSchema<typeof mod>;

    expectTypeOf<S["methods"]["search"]["request"]>().toEqualTypeOf<SearchQuery>();
    expectTypeOf<S["methods"]["search"]["response"]>().toEqualTypeOf<SearchResult>();
    expectTypeOf<S["methods"]["search"]["responseType"]>().toEqualTypeOf<"result">();
  });

  it("should infer symmetric types from single-param msgpack", () => {
    const mod = new Module("test").method("echo", {
      codec: msgpack<SearchQuery>(),
    });
    void mod;

    type S = ExtractSchema<typeof mod>;

    expectTypeOf<S["methods"]["echo"]["request"]>().toEqualTypeOf<SearchQuery>();
    expectTypeOf<S["methods"]["echo"]["response"]>().toEqualTypeOf<SearchQuery>();
  });

  it("should accumulate multiple methods", () => {
    const mod = new Module("test")
      .method("search", { codec: msgpack<SearchQuery, SearchResult>() })
      .method("count", { codec: msgpack<{ table: string }, { count: number }>() });
    void mod;

    type S = ExtractSchema<typeof mod>;

    expectTypeOf<S["methods"]["search"]["request"]>().toEqualTypeOf<SearchQuery>();
    expectTypeOf<S["methods"]["count"]["request"]>().toEqualTypeOf<{ table: string }>();
    expectTypeOf<S["methods"]["count"]["response"]>().toEqualTypeOf<{ count: number }>();
  });

  it("should accumulate events", () => {
    const mod = new Module("test")
      .method("search", { codec: msgpack<SearchQuery, SearchResult>() })
      .event("progress", { codec: msgpack<ProgressEvent>() });
    void mod;

    type S = ExtractSchema<typeof mod>;

    expectTypeOf<S["events"]["progress"]["data"]>().toEqualTypeOf<ProgressEvent>();
  });

  it("should preserve schema through non-schema builder methods", () => {
    const mod = new Module("test")
      .method("search", { codec: msgpack<SearchQuery, SearchResult>() })
      .executable("node", ["worker.js"])
      .spawnPolicy({ maxRetries: 5 })
      .maxPayloadSize(1024 * 1024);
    void mod;

    type S = ExtractSchema<typeof mod>;

    expectTypeOf<S["methods"]["search"]["request"]>().toEqualTypeOf<SearchQuery>();
    expectTypeOf<S["methods"]["search"]["response"]>().toEqualTypeOf<SearchResult>();
  });

  it("should handle rawCodec as Buffer types", () => {
    const mod = new Module("test").method("binary", { codec: rawCodec });
    void mod;

    type S = ExtractSchema<typeof mod>;

    expectTypeOf<S["methods"]["binary"]["request"]>().toEqualTypeOf<Buffer>();
    expectTypeOf<S["methods"]["binary"]["response"]>().toEqualTypeOf<Buffer>();
  });

  it("should default to unknown for untyped msgpackCodec", () => {
    const mod = new Module("test").method("untyped", { codec: msgpackCodec });
    void mod;

    type S = ExtractSchema<typeof mod>;

    expectTypeOf<S["methods"]["untyped"]["request"]>().toEqualTypeOf<unknown>();
    expectTypeOf<S["methods"]["untyped"]["response"]>().toEqualTypeOf<unknown>();
  });

  it("should default to unknown when no codec is specified", () => {
    const mod = new Module("test").method("bare");
    void mod;

    type S = ExtractSchema<typeof mod>;

    expectTypeOf<S["methods"]["bare"]["request"]>().toEqualTypeOf<unknown>();
    expectTypeOf<S["methods"]["bare"]["response"]>().toEqualTypeOf<unknown>();
  });
});

describe("Type Safety - ExtractSchema", () => {
  it("should extract full schema from Module", () => {
    const mod = new Module("test")
      .method("search", { codec: msgpack<SearchQuery, SearchResult>(), response: "result" })
      .method("stream", { codec: msgpack<string, number>(), response: "stream" })
      .event("progress", { codec: msgpack<ProgressEvent>() });
    void mod;

    type S = ExtractSchema<typeof mod>;

    // Methods exist
    expectTypeOf<S["methods"]["search"]>().not.toBeNever();
    expectTypeOf<S["methods"]["stream"]>().not.toBeNever();

    // Events exist
    expectTypeOf<S["events"]["progress"]>().not.toBeNever();
  });

  it("should return EmptySchema for untyped Module", () => {
    type S = ExtractSchema<Module>;

    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    expectTypeOf<S["methods"]>().toEqualTypeOf<{}>();
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    expectTypeOf<S["events"]>().toEqualTypeOf<{}>();
  });
});

describe("Type Safety - SendReturn", () => {
  it("should return TRes for result response type", () => {
    type R = SendReturn<SearchResult, "result">;
    expectTypeOf<R>().toEqualTypeOf<SearchResult>();
  });

  it("should return TRes for ack response type", () => {
    type R = SendReturn<SearchResult, "ack">;
    expectTypeOf<R>().toEqualTypeOf<SearchResult>();
  });

  it("should return void for none response type", () => {
    type R = SendReturn<SearchResult, "none">;
    expectTypeOf<R>().toEqualTypeOf<void>();
  });

  it("should return never for stream response type", () => {
    type R = SendReturn<SearchResult, "stream">;
    expectTypeOf<R>().toBeNever();
  });
});

describe("Type Safety - Backward Compatibility", () => {
  it("should allow untyped Module with no generic parameter", () => {
    const mod = new Module("test").method("foo").executable("node", ["w.js"]);

    // Untyped module — should compile without errors
    expectTypeOf(mod).toMatchTypeOf<Module>();
  });

  it("should allow EmptySchema Module to be assigned to Module", () => {
    const typed = new Module("test").method("search", {
      codec: msgpack<SearchQuery, SearchResult>(),
    });

    // Module with schema is still a Module (covariant)
    expectTypeOf(typed).toMatchTypeOf<Module>();
  });
});
