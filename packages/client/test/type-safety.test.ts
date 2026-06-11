/**
 * Type safety tests for Client<S> with schema inference.
 *
 * These tests verify compile-time type behavior using vitest's `expectTypeOf`.
 * No runtime assertions — everything here is checked by the TypeScript compiler.
 */

import { describe, it, expectTypeOf } from "vitest";
import { Client } from "../src/client.js";
import type { TypedRequestContext, RequestContext } from "@procwire/runtime-core";

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
}

// Simulate a schema that would come from `ExtractSchema<typeof module>`
type TestSchema = {
  methods: {
    search: {
      reqIn: SearchQuery;
      reqOut: SearchQuery;
      resIn: SearchResult;
      resOut: SearchResult;
      responseType: "result";
    };
    ping: { reqIn: string; reqOut: string; resIn: string; resOut: string; responseType: "ack" };
  };
  events: {
    progress: { dataIn: ProgressEvent; dataOut: ProgressEvent };
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("Type Safety - Client<S>", () => {
  it("should type handler data from schema", () => {
    const client = new Client<TestSchema>();

    client.handle("search", (data, _ctx) => {
      // data should be SearchQuery
      expectTypeOf(data).toEqualTypeOf<SearchQuery>();
    });
  });

  it("should type ctx.respond from schema", () => {
    const client = new Client<TestSchema>();

    client.handle("search", (_data, ctx) => {
      // ctx should be TypedRequestContext<SearchResult>
      expectTypeOf(ctx).toMatchTypeOf<TypedRequestContext<SearchResult>>();
    });
  });

  it("should type emitEvent data from schema", () => {
    const client = new Client<TestSchema>();

    // This should accept ProgressEvent data
    // (compile-time check — we just verify the method accepts the right type)
    expectTypeOf(client.emitEvent<"progress">)
      .parameter(1)
      .toEqualTypeOf<ProgressEvent>();
  });

  it("should allow untyped usage with EmptySchema", () => {
    const client = new Client();

    // Should accept any string method name and any data type
    client.handle("anything", (data, ctx) => {
      expectTypeOf(data).toEqualTypeOf<unknown>();
      expectTypeOf(ctx).toEqualTypeOf<RequestContext>();
    });
  });

  it("should allow Client with no generic to be used normally", () => {
    const client = new Client();
    expectTypeOf(client).toMatchTypeOf<Client>();
  });
});

describe("Type Safety - TypedRequestContext", () => {
  it("should have typed respond method", () => {
    type Ctx = TypedRequestContext<SearchResult>;

    // respond should accept SearchResult
    expectTypeOf<Ctx["respond"]>().toBeCallableWith({ items: ["a"], total: 1 });
  });

  it("should have typed chunk method", () => {
    type Ctx = TypedRequestContext<SearchResult>;

    // chunk should accept SearchResult
    expectTypeOf<Ctx["chunk"]>().toBeCallableWith({ items: ["a"], total: 1 });
  });

  it("should have typed ack method", () => {
    type Ctx = TypedRequestContext<string>;

    // ack should accept string or undefined
    expectTypeOf<Ctx["ack"]>().toBeCallableWith("ok");
  });

  it("should default to unknown when no type parameter", () => {
    type Ctx = TypedRequestContext;

    expectTypeOf<Parameters<Ctx["respond"]>[0]>().toEqualTypeOf<unknown>();
  });
});
