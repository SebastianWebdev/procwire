/**
 * Compile-only type tests for the Bun child-side package (Workstream B).
 *
 * `expectTypeOf` is vitest-only, so for the Bun packages the typing is pinned
 * with bare type-level assertions + `@ts-expect-error`, verified by
 * `tsc -p tsconfig.json --noEmit` (the `typecheck` script, run in CI).
 * `bun test` ignores this file (no .test. suffix) - nothing here executes.
 *
 * The assertions mirror packages/client/test/type-safety.test.ts: after the
 * A2 extraction both runtimes share ClientCore, so the typing must be
 * identical.
 */

import { Client, type TypedRequestContext, type RequestContext } from "../src/index.js";

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

interface TestSchema {
  methods: {
    search: {
      reqIn: SearchQuery;
      reqOut: SearchQuery;
      resIn: SearchResult;
      resOut: SearchResult;
      responseType: "result";
    };
  };
  events: {
    progress: {
      dataIn: ProgressEvent;
      dataOut: ProgressEvent;
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPED HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

// handle() narrows the request data and types the context to the response.
{
  const client = new Client<TestSchema>();

  client.handle("search", (data, ctx) => {
    type _Data = Expect<Equal<typeof data, SearchQuery>>;
    type _Ctx = Expect<Equal<typeof ctx, TypedRequestContext<SearchResult>>>;

    // Response methods accept ONLY the declared response type.
    void ctx.respond({ items: [], total: 0 });
    // @ts-expect-error - respond() must reject a non-SearchResult payload
    void ctx.respond(123);
    // @ts-expect-error - ack() must reject a non-SearchResult payload
    void ctx.ack("nope");
    // @ts-expect-error - chunk() must reject a non-SearchResult payload
    void ctx.chunk({ wrong: true });
  });
}

// emitEvent() narrows the payload for declared events.
{
  const client = new Client<TestSchema>();

  const _ok = client.emitEvent("progress", { percent: 50 });
  type _Ok = Expect<Equal<typeof _ok, Promise<void>>>;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPED REQUEST CONTEXT SHAPE
// ═══════════════════════════════════════════════════════════════════════════

{
  type Ctx = TypedRequestContext<SearchResult>;

  type _Respond = Expect<Equal<Parameters<Ctx["respond"]>[0], SearchResult>>;
  type _Chunk = Expect<Equal<Parameters<Ctx["chunk"]>[0], SearchResult>>;
  type _Ack = Expect<Equal<Parameters<Ctx["ack"]>[0], SearchResult | undefined>>;
  type _End = Expect<Equal<Parameters<Ctx["end"]>, []>>;

  // The default TypedRequestContext is interchangeable with RequestContext.
  type _Default = Expect<Equal<TypedRequestContext, TypedRequestContext<unknown>>>;
  const untyped = null as unknown as TypedRequestContext;
  const asRequestContext: RequestContext = untyped;
  void asRequestContext;
}

// Untyped Client keeps the schema-less surface working (RequestContext ctx).
{
  const client = new Client();

  client.handle("anything", (data, ctx) => {
    type _Data = Expect<Equal<typeof data, unknown>>;
    void ctx.respond({ free: "form" });
    void data;
  });
}
