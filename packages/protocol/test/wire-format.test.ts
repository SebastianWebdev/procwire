import { describe, it, expect } from "vitest";
import {
  HEADER_SIZE,
  DEFAULT_MAX_PAYLOAD_SIZE,
  ABSOLUTE_MAX_PAYLOAD_SIZE,
  Flags,
  encodeHeader,
  decodeHeader,
  hasFlag,
  createFlags,
  validateHeader,
  type FrameHeader,
} from "../src/wire-format.js";

describe("wire-format", () => {
  describe("constants", () => {
    it("should have correct header size", () => {
      expect(HEADER_SIZE).toBe(11);
    });

    it("should have correct default max payload size (1GB)", () => {
      expect(DEFAULT_MAX_PAYLOAD_SIZE).toBe(1024 * 1024 * 1024);
    });

    it("should have correct absolute max payload size (~2GB)", () => {
      expect(ABSOLUTE_MAX_PAYLOAD_SIZE).toBe(2 * 1024 * 1024 * 1024 - 1);
    });
  });

  describe("encodeHeader / decodeHeader", () => {
    it("should encode and decode header correctly", () => {
      const original: FrameHeader = {
        methodId: 0x1234,
        flags: 0b00101010,
        requestId: 0xdeadbeef,
        payloadLength: 0x00100000, // 1MB
      };

      const encoded = encodeHeader(original);
      expect(encoded.length).toBe(HEADER_SIZE);

      const decoded = decodeHeader(encoded);
      expect(decoded).toEqual(original);
    });

    it("should handle minimum values", () => {
      const header: FrameHeader = {
        methodId: 1,
        flags: 0,
        requestId: 0,
        payloadLength: 0,
      };

      const encoded = encodeHeader(header);
      const decoded = decodeHeader(encoded);
      expect(decoded).toEqual(header);
    });

    it("should handle maximum values", () => {
      const header: FrameHeader = {
        methodId: 0xfffe, // 0xFFFF is reserved for abort
        flags: 0b00111111, // all non-reserved bits
        requestId: 0xffffffff,
        payloadLength: 100 * 1024 * 1024, // 100MB (well under limit)
      };

      const encoded = encodeHeader(header);
      const decoded = decodeHeader(encoded);
      expect(decoded).toEqual(header);
    });

    it("should encode in big-endian format", () => {
      const header: FrameHeader = {
        methodId: 0x0102,
        flags: 0x03,
        requestId: 0x04050607,
        payloadLength: 0x08090a0b,
      };

      const encoded = encodeHeader(header);

      // Verify byte order
      expect(encoded[0]).toBe(0x01); // methodId high byte
      expect(encoded[1]).toBe(0x02); // methodId low byte
      expect(encoded[2]).toBe(0x03); // flags
      expect(encoded[3]).toBe(0x04); // requestId bytes
      expect(encoded[4]).toBe(0x05);
      expect(encoded[5]).toBe(0x06);
      expect(encoded[6]).toBe(0x07);
      expect(encoded[7]).toBe(0x08); // payloadLength bytes
      expect(encoded[8]).toBe(0x09);
      expect(encoded[9]).toBe(0x0a);
      expect(encoded[10]).toBe(0x0b);
    });

    it("should throw on buffer too small", () => {
      const smallBuffer = Buffer.alloc(5);
      expect(() => decodeHeader(smallBuffer)).toThrow("Buffer too small");
    });

    it("should throw with details on small buffer", () => {
      const smallBuffer = Buffer.alloc(10);
      expect(() => decodeHeader(smallBuffer)).toThrow("Expected 11 bytes, got 10");
    });

    it("should handle buffer larger than header (extra bytes ignored)", () => {
      const header: FrameHeader = {
        methodId: 42,
        flags: 0,
        requestId: 123,
        payloadLength: 456,
      };

      // Create buffer with extra bytes (simulating header + payload)
      const encoded = encodeHeader(header);
      const largerBuffer = Buffer.concat([encoded, Buffer.from("extra data")]);

      const decoded = decodeHeader(largerBuffer);
      expect(decoded).toEqual(header);
    });
  });

  describe("Flags", () => {
    it("should have correct bit positions", () => {
      expect(Flags.DIRECTION_TO_PARENT).toBe(0b00000001);
      expect(Flags.IS_RESPONSE).toBe(0b00000010);
      expect(Flags.IS_ERROR).toBe(0b00000100);
      expect(Flags.IS_STREAM).toBe(0b00001000);
      expect(Flags.STREAM_END).toBe(0b00010000);
      expect(Flags.IS_ACK).toBe(0b00100000);
    });

    it("should have non-overlapping flags", () => {
      const allFlags = [
        Flags.DIRECTION_TO_PARENT,
        Flags.IS_RESPONSE,
        Flags.IS_ERROR,
        Flags.IS_STREAM,
        Flags.STREAM_END,
        Flags.IS_ACK,
      ];

      // OR all flags together
      const combined = allFlags.reduce((a, b) => a | b, 0);

      // Should equal sum (no overlap)
      const sum = allFlags.reduce((a, b) => a + b, 0);
      expect(combined).toBe(sum);
    });
  });

  describe("hasFlag", () => {
    it("should detect set flags", () => {
      const flags = Flags.IS_RESPONSE | Flags.IS_STREAM;

      expect(hasFlag(flags, Flags.IS_RESPONSE)).toBe(true);
      expect(hasFlag(flags, Flags.IS_STREAM)).toBe(true);
      expect(hasFlag(flags, Flags.IS_ERROR)).toBe(false);
      expect(hasFlag(flags, Flags.DIRECTION_TO_PARENT)).toBe(false);
    });

    it("should work with zero flags", () => {
      expect(hasFlag(0, Flags.IS_RESPONSE)).toBe(false);
      expect(hasFlag(0, Flags.IS_STREAM)).toBe(false);
    });

    it("should work with all flags set", () => {
      const allFlags = 0b00111111;

      expect(hasFlag(allFlags, Flags.DIRECTION_TO_PARENT)).toBe(true);
      expect(hasFlag(allFlags, Flags.IS_RESPONSE)).toBe(true);
      expect(hasFlag(allFlags, Flags.IS_ERROR)).toBe(true);
      expect(hasFlag(allFlags, Flags.IS_STREAM)).toBe(true);
      expect(hasFlag(allFlags, Flags.STREAM_END)).toBe(true);
      expect(hasFlag(allFlags, Flags.IS_ACK)).toBe(true);
    });
  });

  describe("createFlags", () => {
    it("should create flags from options", () => {
      const flags = createFlags({
        toParent: true,
        isResponse: true,
        isStream: true,
      });

      expect(hasFlag(flags, Flags.DIRECTION_TO_PARENT)).toBe(true);
      expect(hasFlag(flags, Flags.IS_RESPONSE)).toBe(true);
      expect(hasFlag(flags, Flags.IS_STREAM)).toBe(true);
      expect(hasFlag(flags, Flags.IS_ERROR)).toBe(false);
      expect(hasFlag(flags, Flags.STREAM_END)).toBe(false);
      expect(hasFlag(flags, Flags.IS_ACK)).toBe(false);
    });

    it("should create zero flags by default", () => {
      const flags = createFlags({});
      expect(flags).toBe(0);
    });

    it("should create all flags when all options true", () => {
      const flags = createFlags({
        toParent: true,
        isResponse: true,
        isError: true,
        isStream: true,
        streamEnd: true,
        isAck: true,
      });

      expect(flags).toBe(0b00111111);
    });

    it("should handle typical request flags", () => {
      // Request to child
      const requestToChild = createFlags({});
      expect(requestToChild).toBe(0);

      // Response from child
      const responseFromChild = createFlags({
        toParent: true,
        isResponse: true,
      });
      expect(responseFromChild).toBe(Flags.DIRECTION_TO_PARENT | Flags.IS_RESPONSE);
    });

    it("should handle stream flags correctly", () => {
      // Stream chunk (not final)
      const streamChunk = createFlags({
        toParent: true,
        isResponse: true,
        isStream: true,
      });
      expect(hasFlag(streamChunk, Flags.IS_STREAM)).toBe(true);
      expect(hasFlag(streamChunk, Flags.STREAM_END)).toBe(false);

      // Final stream chunk
      const finalChunk = createFlags({
        toParent: true,
        isResponse: true,
        isStream: true,
        streamEnd: true,
      });
      expect(hasFlag(finalChunk, Flags.IS_STREAM)).toBe(true);
      expect(hasFlag(finalChunk, Flags.STREAM_END)).toBe(true);
    });
  });

  describe("validateHeader", () => {
    it("should accept valid header", () => {
      const header: FrameHeader = {
        methodId: 1,
        flags: 0,
        requestId: 42,
        payloadLength: 1024,
      };

      expect(() => validateHeader(header)).not.toThrow();
    });

    it("should reject methodId 0", () => {
      const header: FrameHeader = {
        methodId: 0,
        flags: 0,
        requestId: 0,
        payloadLength: 0,
      };

      expect(() => validateHeader(header)).toThrow("Method ID 0 is reserved");
    });

    it("should accept methodId 0xFFFF (reserved for abort)", () => {
      const header: FrameHeader = {
        methodId: 0xffff,
        flags: 0,
        requestId: 42,
        payloadLength: 0,
      };

      expect(() => validateHeader(header)).not.toThrow();
    });

    it("should reject payload exceeding default limit", () => {
      const header: FrameHeader = {
        methodId: 1,
        flags: 0,
        requestId: 0,
        payloadLength: 2 * 1024 * 1024 * 1024, // 2GB > default 1GB
      };

      expect(() => validateHeader(header)).toThrow("Payload too large");
    });

    it("should accept payload within custom limit", () => {
      const header: FrameHeader = {
        methodId: 1,
        flags: 0,
        requestId: 0,
        payloadLength: 500 * 1024 * 1024, // 500MB
      };

      // Default limit (1GB) - should pass
      expect(() => validateHeader(header)).not.toThrow();

      // Custom higher limit (2GB - 1) - should pass
      expect(() => validateHeader(header, ABSOLUTE_MAX_PAYLOAD_SIZE)).not.toThrow();

      // Custom lower limit (100MB) - should fail
      expect(() => validateHeader(header, 100 * 1024 * 1024)).toThrow("Payload too large");
    });

    it("should always reject payload exceeding Node.js limit", () => {
      const header: FrameHeader = {
        methodId: 1,
        flags: 0,
        requestId: 0,
        payloadLength: 3 * 1024 * 1024 * 1024, // 3GB > absolute 2GB limit
      };

      // Even with high custom limit, should fail due to Node.js limitation
      expect(() => validateHeader(header, 4 * 1024 * 1024 * 1024)).toThrow("Node.js Buffer limit");
    });

    it("should reject reserved flag bits (bit 6)", () => {
      const header: FrameHeader = {
        methodId: 1,
        flags: 0b01000000, // reserved bit 6 set
        requestId: 0,
        payloadLength: 0,
      };

      expect(() => validateHeader(header)).toThrow("Reserved flag bits");
    });

    it("should reject reserved flag bits (bit 7)", () => {
      const header: FrameHeader = {
        methodId: 1,
        flags: 0b10000000, // reserved bit 7 set
        requestId: 0,
        payloadLength: 0,
      };

      expect(() => validateHeader(header)).toThrow("Reserved flag bits");
    });

    it("should reject both reserved bits set", () => {
      const header: FrameHeader = {
        methodId: 1,
        flags: 0b11000000, // both reserved bits set
        requestId: 0,
        payloadLength: 0,
      };

      expect(() => validateHeader(header)).toThrow("Reserved flag bits");
    });

    it("should accept all valid flag combinations", () => {
      const header: FrameHeader = {
        methodId: 1,
        flags: 0b00111111, // all valid flags set
        requestId: 0,
        payloadLength: 0,
      };

      expect(() => validateHeader(header)).not.toThrow();
    });
  });

  describe("round-trip scenarios", () => {
    it("should handle request -> response flow", () => {
      // Request from parent to child
      const request = encodeHeader({
        methodId: 1,
        flags: createFlags({}),
        requestId: 42,
        payloadLength: 100,
      });

      const decodedRequest = decodeHeader(request);
      expect(hasFlag(decodedRequest.flags, Flags.DIRECTION_TO_PARENT)).toBe(false);
      expect(hasFlag(decodedRequest.flags, Flags.IS_RESPONSE)).toBe(false);

      // Response from child to parent
      const response = encodeHeader({
        methodId: decodedRequest.methodId,
        flags: createFlags({ toParent: true, isResponse: true }),
        requestId: decodedRequest.requestId,
        payloadLength: 200,
      });

      const decodedResponse = decodeHeader(response);
      expect(decodedResponse.requestId).toBe(42); // Same request ID
      expect(hasFlag(decodedResponse.flags, Flags.DIRECTION_TO_PARENT)).toBe(true);
      expect(hasFlag(decodedResponse.flags, Flags.IS_RESPONSE)).toBe(true);
    });

    it("should handle streaming response", () => {
      const requestId = 123;
      const methodId = 5;

      // First chunk
      const chunk1 = encodeHeader({
        methodId,
        flags: createFlags({ toParent: true, isResponse: true, isStream: true }),
        requestId,
        payloadLength: 1000,
      });

      // Middle chunk
      const chunk2 = encodeHeader({
        methodId,
        flags: createFlags({ toParent: true, isResponse: true, isStream: true }),
        requestId,
        payloadLength: 1000,
      });

      // Final chunk
      const chunk3 = encodeHeader({
        methodId,
        flags: createFlags({ toParent: true, isResponse: true, isStream: true, streamEnd: true }),
        requestId,
        payloadLength: 500,
      });

      const decoded1 = decodeHeader(chunk1);
      const decoded2 = decodeHeader(chunk2);
      const decoded3 = decodeHeader(chunk3);

      // All should be stream chunks
      expect(hasFlag(decoded1.flags, Flags.IS_STREAM)).toBe(true);
      expect(hasFlag(decoded2.flags, Flags.IS_STREAM)).toBe(true);
      expect(hasFlag(decoded3.flags, Flags.IS_STREAM)).toBe(true);

      // Only last should have STREAM_END
      expect(hasFlag(decoded1.flags, Flags.STREAM_END)).toBe(false);
      expect(hasFlag(decoded2.flags, Flags.STREAM_END)).toBe(false);
      expect(hasFlag(decoded3.flags, Flags.STREAM_END)).toBe(true);
    });
  });
});
