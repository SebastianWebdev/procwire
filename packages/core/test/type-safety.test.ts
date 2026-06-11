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
  arrowCodec,
  type MsgPackCodec,
  type ArrowCodec,
  type ExtractSchema,
  type InferCodecInput,
  type InferCodecOutput,
} from "@procwire/codecs";
import type { SendReturn } from "@procwire/runtime-core";

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

describe("Type Safety - Single Codec (Symmetric Shorthand)", () => {
  it("should infer symmetric types from single-param msgpack", () => {
    const mod = new Module("test").method("echo", {
      codec: msgpack<SearchQuery>(),
    });
    void mod;

    type S = ExtractSchema<typeof mod>;
    type M = S["methods"]["echo"];

    // Single codec → all 4 types are the same
    expectTypeOf<M["reqIn"]>().toEqualTypeOf<SearchQuery>();
    expectTypeOf<M["reqOut"]>().toEqualTypeOf<SearchQuery>();
    expectTypeOf<M["resIn"]>().toEqualTypeOf<SearchQuery>();
    expectTypeOf<M["resOut"]>().toEqualTypeOf<SearchQuery>();
  });

  it("should accumulate multiple methods", () => {
    const mod = new Module("test")
      .method("search", { codec: msgpack<SearchQuery>() })
      .method("count", { codec: msgpack<{ table: string }>() });
    void mod;

    type S = ExtractSchema<typeof mod>;

    expectTypeOf<S["methods"]["search"]["reqIn"]>().toEqualTypeOf<SearchQuery>();
    expectTypeOf<S["methods"]["count"]["reqIn"]>().toEqualTypeOf<{ table: string }>();
    expectTypeOf<S["methods"]["count"]["resOut"]>().toEqualTypeOf<{ table: string }>();
  });

  it("should handle rawCodec as Buffer types", () => {
    const mod = new Module("test").method("binary", { codec: rawCodec });
    void mod;

    type S = ExtractSchema<typeof mod>;

    expectTypeOf<S["methods"]["binary"]["reqIn"]>().toEqualTypeOf<Buffer>();
    expectTypeOf<S["methods"]["binary"]["reqOut"]>().toEqualTypeOf<Buffer>();
    expectTypeOf<S["methods"]["binary"]["resIn"]>().toEqualTypeOf<Buffer>();
    expectTypeOf<S["methods"]["binary"]["resOut"]>().toEqualTypeOf<Buffer>();
  });

  it("should default to unknown for untyped msgpackCodec", () => {
    const mod = new Module("test").method("untyped", { codec: msgpackCodec });
    void mod;

    type S = ExtractSchema<typeof mod>;

    expectTypeOf<S["methods"]["untyped"]["reqIn"]>().toEqualTypeOf<unknown>();
    expectTypeOf<S["methods"]["untyped"]["resOut"]>().toEqualTypeOf<unknown>();
  });

  it("should default to unknown when no codec is specified", () => {
    const mod = new Module("test").method("bare");
    void mod;

    type S = ExtractSchema<typeof mod>;

    expectTypeOf<S["methods"]["bare"]["reqIn"]>().toEqualTypeOf<unknown>();
    expectTypeOf<S["methods"]["bare"]["resOut"]>().toEqualTypeOf<unknown>();
  });
});

describe("Type Safety - Dual Codec", () => {
  it("should infer correct types for dual-codec method", () => {
    const mod = new Module("test").method("process", {
      requestCodec: msgpack<SearchQuery>(),
      responseCodec: msgpack<SearchResult>(),
    });
    void mod;

    type S = ExtractSchema<typeof mod>;
    type M = S["methods"]["process"];

    // Request codec types
    expectTypeOf<M["reqIn"]>().toEqualTypeOf<SearchQuery>();
    expectTypeOf<M["reqOut"]>().toEqualTypeOf<SearchQuery>();
    // Response codec types
    expectTypeOf<M["resIn"]>().toEqualTypeOf<SearchResult>();
    expectTypeOf<M["resOut"]>().toEqualTypeOf<SearchResult>();
  });

  it("should infer correct types for asymmetric codec (Arrow)", () => {
    const mod = new Module("test").method("embed", {
      requestCodec: msgpack<SearchQuery>(),
      responseCodec: arrowCodec,
    });
    void mod;

    type S = ExtractSchema<typeof mod>;
    type M = S["methods"]["embed"];

    // Request codec: MsgPackCodec<SearchQuery> → reqIn = reqOut = SearchQuery
    expectTypeOf<M["reqIn"]>().toEqualTypeOf<SearchQuery>();
    expectTypeOf<M["reqOut"]>().toEqualTypeOf<SearchQuery>();
    // Response codec: ArrowCodec = Codec<ArrowSerializable, Table>
    expectTypeOf<M["resIn"]>().toEqualTypeOf<InferCodecInput<ArrowCodec>>();
    expectTypeOf<M["resOut"]>().toEqualTypeOf<InferCodecOutput<ArrowCodec>>();
  });

  it("should preserve responseType through dual-codec method", () => {
    const mod = new Module("test").method("stream-embed", {
      requestCodec: msgpack<SearchQuery>(),
      responseCodec: arrowCodec,
      response: "stream",
    });
    void mod;

    type S = ExtractSchema<typeof mod>;

    expectTypeOf<S["methods"]["stream-embed"]["responseType"]>().toEqualTypeOf<"stream">();
  });
});

describe("Type Safety - Events (Dual Types)", () => {
  it("should accumulate events with dataIn/dataOut", () => {
    const mod = new Module("test")
      .method("search", { codec: msgpack<SearchQuery>() })
      .event("progress", { codec: msgpack<ProgressEvent>() });
    void mod;

    type S = ExtractSchema<typeof mod>;

    // MsgPackCodec<ProgressEvent> is symmetric → dataIn === dataOut
    expectTypeOf<S["events"]["progress"]["dataIn"]>().toEqualTypeOf<ProgressEvent>();
    expectTypeOf<S["events"]["progress"]["dataOut"]>().toEqualTypeOf<ProgressEvent>();
  });
});

describe("Type Safety - ExtractSchema", () => {
  it("should extract full schema from Module", () => {
    const mod = new Module("test")
      .method("search", { codec: msgpack<SearchQuery>(), response: "result" })
      .method("stream", { codec: msgpack<string>(), response: "stream" })
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

describe("Type Safety - Builder Chain Preservation", () => {
  it("should preserve schema through non-schema builder methods", () => {
    const mod = new Module("test")
      .method("search", { codec: msgpack<SearchQuery>() })
      .executable("node", ["worker.js"])
      .spawnPolicy({ maxRetries: 5 })
      .maxPayloadSize(1024 * 1024);
    void mod;

    type S = ExtractSchema<typeof mod>;

    expectTypeOf<S["methods"]["search"]["reqIn"]>().toEqualTypeOf<SearchQuery>();
    expectTypeOf<S["methods"]["search"]["resOut"]>().toEqualTypeOf<SearchQuery>();
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
      codec: msgpack<SearchQuery>(),
    });

    // Module with schema is still a Module (covariant)
    expectTypeOf(typed).toMatchTypeOf<Module>();
  });
});
