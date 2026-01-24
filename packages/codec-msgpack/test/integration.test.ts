import { describe, expect, it } from "vitest";
import { MessagePackCodec, createExtendedCodec } from "../src/index.js";
import type { SerializationCodec } from "@procwire/transport/serialization";

describe("integration with @procwire/transport", () => {
  describe("SerializationCodec interface", () => {
    it("implements SerializationCodec interface correctly", () => {
      const codec: SerializationCodec<unknown> = new MessagePackCodec();
      expect(codec.name).toBe("msgpack");
      expect(codec.contentType).toBe("application/x-msgpack");
      expect(typeof codec.serialize).toBe("function");
      expect(typeof codec.deserialize).toBe("function");
    });

    it("serialize returns Buffer", () => {
      const codec = new MessagePackCodec();
      const result = codec.serialize({ test: "data" });
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it("deserialize accepts Buffer", () => {
      const codec = new MessagePackCodec();
      const buffer = codec.serialize({ test: "data" });
      expect(Buffer.isBuffer(buffer)).toBe(true);
      const result = codec.deserialize(buffer);
      expect(result).toEqual({ test: "data" });
    });

    it("generic codec implements interface with type parameter", () => {
      interface MyType {
        id: number;
        value: string;
      }
      const codec: SerializationCodec<MyType> = new MessagePackCodec<MyType>();
      const input: MyType = { id: 1, value: "test" };
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer);
      expect(result).toEqual(input);
    });
  });

  describe("real-world patterns", () => {
    interface JsonRpcRequest {
      jsonrpc: "2.0";
      id: number | string;
      method: string;
      params?: unknown[];
    }

    interface JsonRpcResponse {
      jsonrpc: "2.0";
      id: number | string;
      result?: unknown;
      error?: {
        code: number;
        message: string;
        data?: unknown;
      };
    }

    it("handles JSON-RPC request structure", () => {
      const codec = new MessagePackCodec<JsonRpcRequest>();
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "sum",
        params: [1, 2, 3],
      };
      const buffer = codec.serialize(request);
      const result = codec.deserialize(buffer);
      expect(result).toEqual(request);
    });

    it("handles JSON-RPC response structure", () => {
      const codec = new MessagePackCodec<JsonRpcResponse>();
      const response: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: 1,
        result: { sum: 6 },
      };
      const buffer = codec.serialize(response);
      const result = codec.deserialize(buffer);
      expect(result).toEqual(response);
    });

    it("handles JSON-RPC error structure", () => {
      const codec = new MessagePackCodec<JsonRpcResponse>();
      const response: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: -32600,
          message: "Invalid Request",
          data: { details: "Missing method field" },
        },
      };
      const buffer = codec.serialize(response);
      const result = codec.deserialize(buffer);
      expect(result).toEqual(response);
    });

    it("handles batch requests", () => {
      const codec = new MessagePackCodec<JsonRpcRequest[]>();
      const batch: JsonRpcRequest[] = [
        { jsonrpc: "2.0", id: 1, method: "sum", params: [1, 2] },
        { jsonrpc: "2.0", id: 2, method: "multiply", params: [3, 4] },
        { jsonrpc: "2.0", id: 3, method: "divide", params: [10, 2] },
      ];
      const buffer = codec.serialize(batch);
      const result = codec.deserialize(buffer);
      expect(result).toEqual(batch);
    });

    it("handles large payload with binary data", () => {
      const codec = new MessagePackCodec();
      const largePayload = {
        id: "request-123",
        data: new Uint8Array(10000).fill(0x42),
        metadata: {
          size: 10000,
          checksum: "abc123",
        },
      };
      const buffer = codec.serialize(largePayload);
      const result = codec.deserialize(buffer) as typeof largePayload;
      expect(result.id).toBe("request-123");
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(result.data.length).toBe(10000);
      expect(result.metadata.size).toBe(10000);
    });

    it("handles streaming-style messages", () => {
      interface StreamMessage {
        type: "data" | "end" | "error";
        sequence: number;
        payload?: unknown;
      }
      const codec = new MessagePackCodec<StreamMessage>();

      const messages: StreamMessage[] = [
        { type: "data", sequence: 0, payload: { chunk: "first" } },
        { type: "data", sequence: 1, payload: { chunk: "second" } },
        { type: "end", sequence: 2 },
      ];

      for (const msg of messages) {
        const buffer = codec.serialize(msg);
        const result = codec.deserialize(buffer);
        expect(result).toEqual(msg);
      }
    });
  });

  describe("extended codec with real-world data", () => {
    it("handles event-sourcing payload with timestamps", () => {
      interface Event {
        id: string;
        type: string;
        timestamp: Date;
        data: unknown;
      }

      const codec = createExtendedCodec<Event>();
      const event: Event = {
        id: "evt-001",
        type: "user.created",
        timestamp: new Date("2024-01-15T10:30:00.000Z"),
        data: { userId: 123, name: "Alice" },
      };

      const buffer = codec.serialize(event);
      const result = codec.deserialize(buffer);

      expect(result.id).toBe("evt-001");
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.timestamp.getTime()).toBe(event.timestamp.getTime());
    });

    it("handles cache entry with complex types", () => {
      interface CacheEntry {
        key: string;
        value: unknown;
        tags: Set<string>;
        metadata: Map<string, unknown>;
        expiresAt: Date;
      }

      const codec = createExtendedCodec<CacheEntry>();
      const metadata = new Map<string, unknown>();
      metadata.set("created", new Date("2024-01-15"));
      metadata.set("hits", 42);

      const entry: CacheEntry = {
        key: "user:123",
        value: { id: 123, name: "Alice" },
        tags: new Set(["user", "active"]),
        metadata,
        expiresAt: new Date("2024-02-15"),
      };

      const buffer = codec.serialize(entry);
      const result = codec.deserialize(buffer);

      expect(result.key).toBe("user:123");
      expect(result.tags).toBeInstanceOf(Set);
      expect(result.tags.has("user")).toBe(true);
      expect(result.metadata).toBeInstanceOf(Map);
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it("handles financial data with BigInt", () => {
      interface Transaction {
        id: string;
        amountInCents: bigint;
        timestamp: Date;
      }

      const codec = createExtendedCodec<Transaction>();
      const tx: Transaction = {
        id: "tx-001",
        amountInCents: BigInt("999999999999999"), // Large amount
        timestamp: new Date("2024-01-15T10:30:00.000Z"),
      };

      const buffer = codec.serialize(tx);
      const result = codec.deserialize(buffer);

      expect(result.id).toBe("tx-001");
      expect(typeof result.amountInCents).toBe("bigint");
      expect(result.amountInCents).toBe(BigInt("999999999999999"));
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });
});
