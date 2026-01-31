/**
 * Sanity tests for @procwire-bun/client
 *
 * These tests verify that the package exports correctly and basic
 * type checking works. Full integration tests will be added in TASK-43.
 */

import { describe, it, expect } from "bun:test";
import {
  Client,
  RequestContextImpl,
  ProcwireClientError,
  ClientErrors,
  BunDrainWaiter,
} from "../src/index.js";

describe("@procwire-bun/client exports", () => {
  it("should export Client class", () => {
    expect(Client).toBeDefined();
    expect(typeof Client).toBe("function");
  });

  it("should export RequestContextImpl class", () => {
    expect(RequestContextImpl).toBeDefined();
    expect(typeof RequestContextImpl).toBe("function");
  });

  it("should export ProcwireClientError class", () => {
    expect(ProcwireClientError).toBeDefined();
    expect(typeof ProcwireClientError).toBe("function");
  });

  it("should export ClientErrors factory", () => {
    expect(ClientErrors).toBeDefined();
    expect(typeof ClientErrors.cannotAddHandlerAfterStart).toBe("function");
    expect(typeof ClientErrors.alreadyStarted).toBe("function");
    expect(typeof ClientErrors.notConnected).toBe("function");
    expect(typeof ClientErrors.unknownEvent).toBe("function");
    expect(typeof ClientErrors.responseAlreadySent).toBe("function");
  });

  it("should export BunDrainWaiter class", () => {
    expect(BunDrainWaiter).toBeDefined();
    expect(typeof BunDrainWaiter).toBe("function");
  });
});

describe("Client", () => {
  it("should create a new Client instance", () => {
    const client = new Client();
    expect(client).toBeInstanceOf(Client);
    expect(client.connected).toBe(false);
  });

  it("should support builder API for methods", () => {
    const client = new Client()
      .handle("query", async (_data, ctx) => {
        await ctx.respond({ results: [] });
      })
      .handle("insert", async (_data, ctx) => {
        await ctx.ack();
      });

    // No public API to check registered methods, but it shouldn't throw
    expect(client).toBeInstanceOf(Client);
  });

  it("should support builder API for events", () => {
    const client = new Client().event("progress").event("status");

    expect(client).toBeInstanceOf(Client);
  });

  it("should throw when adding handler after start attempt", async () => {
    const client = new Client().handle("test", async (_data, ctx) => {
      await ctx.respond({});
    });

    // start() will throw because it's not implemented yet
    try {
      await client.start();
    } catch {
      // Expected - not implemented
    }

    // But adding handlers after start attempt should still throw the right error
    // Note: _started is set to true before the throw in start()
    expect(() => {
      client.handle("another", async () => {});
    }).toThrow("after start");
  });

  it("should throw when adding event after start attempt", async () => {
    const client = new Client().handle("test", async (_data, ctx) => {
      await ctx.respond({});
    });

    try {
      await client.start();
    } catch {
      // Expected - not implemented
    }

    expect(() => {
      client.event("another");
    }).toThrow("after start");
  });

  it("should throw when emitting event while not connected", async () => {
    const client = new Client().event("progress");

    await expect(client.emitEvent("progress", { percent: 50 })).rejects.toThrow("not connected");
  });

  it("should throw for unknown event", async () => {
    const client = new Client().event("known");

    // Manually set socket to bypass not connected check
    // @ts-expect-error - accessing private property for testing
    client._socket = {} as never;

    await expect(client.emitEvent("unknown", {})).rejects.toThrow("Unknown event");
  });
});

describe("BunDrainWaiter", () => {
  it("should create a new instance", () => {
    const waiter = new BunDrainWaiter();
    expect(waiter.needsDrain).toBe(false);
  });

  it("should track drain state", () => {
    const waiter = new BunDrainWaiter();

    waiter.markNeedsDrain();
    expect(waiter.needsDrain).toBe(true);

    waiter.onDrain();
    expect(waiter.needsDrain).toBe(false);
  });

  it("should resolve waiters on drain", async () => {
    const waiter = new BunDrainWaiter();
    waiter.markNeedsDrain();

    let resolved = false;
    const waitPromise = waiter.waitForDrain().then(() => {
      resolved = true;
    });

    // Simulate drain event
    waiter.onDrain();

    await waitPromise;
    expect(resolved).toBe(true);
  });

  it("should clear state on clear()", () => {
    const waiter = new BunDrainWaiter();
    waiter.markNeedsDrain();

    waiter.clear();
    expect(waiter.needsDrain).toBe(false);
  });
});

describe("Error factories", () => {
  it("ClientErrors should create proper errors", () => {
    const err1 = ClientErrors.cannotAddHandlerAfterStart();
    expect(err1).toBeInstanceOf(ProcwireClientError);
    expect(err1.message).toContain("after start");

    const err2 = ClientErrors.alreadyStarted();
    expect(err2.message).toContain("already started");

    const err3 = ClientErrors.notConnected();
    expect(err3.message).toContain("not connected");

    const err4 = ClientErrors.unknownEvent("test");
    expect(err4.message).toContain("test");

    const err5 = ClientErrors.responseAlreadySent();
    expect(err5.message).toContain("already sent");
  });
});
