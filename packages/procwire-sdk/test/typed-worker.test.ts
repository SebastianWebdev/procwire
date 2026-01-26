/**
 * Typed worker tests - verifying type inference
 */

import { describe, it, expect, expectTypeOf } from "vitest";
import { createTypedWorker } from "../src/typed-worker.js";
import type { DefineWorkerMethods } from "../src/typed-worker.js";
import type { HandlerContext } from "../src/types.js";

// Define test method types
interface TestMethods {
  echo: {
    params: { message: string };
    result: { message: string };
  };
  add: {
    params: { a: number; b: number };
    result: { sum: number };
  };
  async_operation: {
    params: { delay: number };
    result: { completed: boolean; duration: number };
  };
  void_result: {
    params: { action: string };
    result: void;
  };
}

describe("createTypedWorker", () => {
  describe("type inference", () => {
    it("should provide correct param types", () => {
      const worker = createTypedWorker<TestMethods>();

      worker.handle("echo", (params) => {
        // Type check: params should have message: string
        expectTypeOf(params).toEqualTypeOf<{ message: string }>();
        return { message: params.message };
      });

      worker.handle("add", (params) => {
        // Type check: params should have a: number, b: number
        expectTypeOf(params).toEqualTypeOf<{ a: number; b: number }>();
        return { sum: params.a + params.b };
      });
    });

    it("should provide correct result types", () => {
      const worker = createTypedWorker<TestMethods>();

      worker.handle("echo", (params) => {
        // Must return { message: string }
        return { message: params.message };
      });

      // This would be a type error:
      // worker.handle('echo', (params) => {
      //   return { wrong: 'type' }; // Error!
      // });
    });

    it("should provide HandlerContext", () => {
      const worker = createTypedWorker<TestMethods>();

      worker.handle("echo", (params, ctx) => {
        expectTypeOf(ctx).toEqualTypeOf<HandlerContext>();
        expectTypeOf(ctx.requestId).toEqualTypeOf<string | number>();
        expectTypeOf(ctx.method).toEqualTypeOf<string>();
        expectTypeOf(ctx.channel).toEqualTypeOf<"control" | "data">();
        expectTypeOf(ctx.signal).toEqualTypeOf<AbortSignal>();
        return { message: params.message };
      });
    });

    it("should allow async handlers", () => {
      const worker = createTypedWorker<TestMethods>();

      worker.handle("async_operation", async (params) => {
        await new Promise((r) => setTimeout(r, params.delay));
        return { completed: true, duration: params.delay };
      });
    });

    it("should support void result", () => {
      const worker = createTypedWorker<TestMethods>();

      worker.handle("void_result", (params) => {
        // Use params to avoid unused variable warning
        void params.action;
        // No return needed for void
      });
    });

    it("should enforce method names from interface", () => {
      const worker = createTypedWorker<TestMethods>();

      // These are valid method names
      worker.handle("echo", () => ({ message: "test" }));
      worker.handle("add", () => ({ sum: 42 }));

      // This would be a type error (uncomment to verify):
      // worker.handle('unknown_method', () => ({}));
    });
  });

  describe("fluent API", () => {
    it("should return this for chaining", () => {
      const worker = createTypedWorker<TestMethods>();

      const result = worker
        .handle("echo", (p) => ({ message: p.message }))
        .handle("add", (p) => ({ sum: p.a + p.b }))
        .hooks({ onReady: () => {} });

      expect(result).toBeDefined();
    });
  });

  describe("state management", () => {
    it("should start in created state", () => {
      const worker = createTypedWorker<TestMethods>();

      expect(worker.state).toBe("created");
    });
  });
});

describe("DefineWorkerMethods", () => {
  it("should create valid methods type", () => {
    type MyMethods = DefineWorkerMethods<{
      greet: { params: { name: string }; result: { greeting: string } };
    }>;

    const worker = createTypedWorker<MyMethods>();

    worker.handle("greet", (params) => {
      expectTypeOf(params).toEqualTypeOf<{ name: string }>();
      return { greeting: `Hello, ${params.name}!` };
    });
  });

  it("should support complex nested types", () => {
    type ComplexMethods = DefineWorkerMethods<{
      search: {
        params: {
          query: {
            text: string;
            filters: Array<{ field: string; value: unknown }>;
          };
          options: {
            limit?: number;
            offset?: number;
          };
        };
        result: {
          results: Array<{ id: string; score: number; data: Record<string, unknown> }>;
          total: number;
        };
      };
    }>;

    const worker = createTypedWorker<ComplexMethods>();

    worker.handle("search", (params) => {
      expectTypeOf(params.query.text).toEqualTypeOf<string>();
      expectTypeOf(params.query.filters).toEqualTypeOf<Array<{ field: string; value: unknown }>>();
      expectTypeOf(params.options.limit).toEqualTypeOf<number | undefined>();

      return {
        results: [{ id: "1", score: 0.9, data: {} }],
        total: 1,
      };
    });
  });
});
