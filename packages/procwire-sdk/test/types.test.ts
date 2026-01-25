/**
 * Type tests for @procwire/worker
 *
 * These tests verify that TypeScript types work correctly at compile time.
 * They don't need to run - if they compile, the types are correct.
 */

import { describe, it, expectTypeOf } from "vitest";
import type {
  Worker,
  TypedWorker,
  Handler,
  MethodParams,
  MethodResult,
  WorkerState,
} from "../src/index.js";

describe("Type Definitions", () => {
  describe("Handler", () => {
    it("should accept sync handlers", () => {
      const handler: Handler<{ x: number }, { y: number }> = (params) => {
        return { y: params.x * 2 };
      };
      expectTypeOf(handler).toBeFunction();
    });

    it("should accept async handlers", () => {
      const handler: Handler<{ x: number }, { y: number }> = async (params) => {
        return { y: params.x * 2 };
      };
      expectTypeOf(handler).toBeFunction();
    });

    it("should provide HandlerContext", () => {
      const handler: Handler<unknown, void> = (_params, ctx) => {
        expectTypeOf(ctx.requestId).toEqualTypeOf<string | number>();
        expectTypeOf(ctx.method).toEqualTypeOf<string>();
        expectTypeOf(ctx.channel).toEqualTypeOf<"control" | "data">();
        expectTypeOf(ctx.signal).toEqualTypeOf<AbortSignal>();
      };
      expectTypeOf(handler).toBeFunction();
    });
  });

  describe("TypedWorker", () => {
    interface TestMethods {
      greet: {
        params: { name: string };
        result: { message: string };
      };
      add: {
        params: { a: number; b: number };
        result: { sum: number };
      };
    }

    it("should infer method names", () => {
      type Names = keyof TestMethods;
      expectTypeOf<Names>().toEqualTypeOf<"greet" | "add">();
    });

    it("should extract params type", () => {
      type GreetParams = MethodParams<TestMethods, "greet">;
      expectTypeOf<GreetParams>().toEqualTypeOf<{ name: string }>();

      type AddParams = MethodParams<TestMethods, "add">;
      expectTypeOf<AddParams>().toEqualTypeOf<{ a: number; b: number }>();
    });

    it("should extract result type", () => {
      type GreetResult = MethodResult<TestMethods, "greet">;
      expectTypeOf<GreetResult>().toEqualTypeOf<{ message: string }>();

      type AddResult = MethodResult<TestMethods, "add">;
      expectTypeOf<AddResult>().toEqualTypeOf<{ sum: number }>();
    });
  });

  describe("WorkerState", () => {
    it("should be a union of valid states", () => {
      expectTypeOf<WorkerState>().toEqualTypeOf<
        "created" | "starting" | "handshaking" | "ready" | "draining" | "stopped"
      >();
    });
  });

  describe("Worker interface", () => {
    it("should have fluent API (return this)", () => {
      // This is a compile-time check
      const checkFluent = (worker: Worker) => {
        const result = worker
          .handle("a", () => {})
          .handle("b", () => {})
          .onNotification("c", () => {})
          .hooks({ onReady: () => {} });

        expectTypeOf(result).toEqualTypeOf<Worker>();
      };
      expectTypeOf(checkFluent).toBeFunction();
    });
  });

  describe("TypedWorker interface", () => {
    interface TestMethods {
      greet: {
        params: { name: string };
        result: { message: string };
      };
    }

    it("should enforce correct handler types", () => {
      const checkTypedHandler = (worker: TypedWorker<TestMethods>) => {
        // This should type-check correctly
        worker.handle("greet", (params) => {
          expectTypeOf(params).toEqualTypeOf<{ name: string }>();
          return { message: `Hello, ${params.name}!` };
        });
      };
      expectTypeOf(checkTypedHandler).toBeFunction();
    });
  });
});
