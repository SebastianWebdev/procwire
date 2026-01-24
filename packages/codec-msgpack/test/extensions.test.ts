import { describe, expect, it } from "vitest";
import { createCommonExtensionCodec, createExtendedCodec, MessagePackCodec } from "../src/index.js";

describe("createCommonExtensionCodec", () => {
  const extensionCodec = createCommonExtensionCodec();
  const codec = new MessagePackCodec({ extensionCodec });

  describe("Date extension", () => {
    it("roundtrips Date object", () => {
      const input = new Date("2024-01-15T10:30:00.000Z");
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer);
      expect(result).toBeInstanceOf(Date);
      expect((result as Date).getTime()).toBe(input.getTime());
    });

    it("preserves milliseconds precision", () => {
      const input = new Date("2024-01-15T10:30:00.123Z");
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer) as Date;
      expect(result.getMilliseconds()).toBe(123);
    });

    it("handles Date.now()", () => {
      const input = new Date(Date.now());
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer) as Date;
      expect(result.getTime()).toBe(input.getTime());
    });

    it("handles epoch (new Date(0))", () => {
      const input = new Date(0);
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer) as Date;
      expect(result.getTime()).toBe(0);
    });

    it("handles far future dates", () => {
      const input = new Date("3000-12-31T23:59:59.999Z");
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer) as Date;
      expect(result.getTime()).toBe(input.getTime());
    });

    it("handles far past dates", () => {
      const input = new Date("1000-01-01T00:00:00.000Z");
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer) as Date;
      expect(result.getTime()).toBe(input.getTime());
    });

    it("handles nested Date in object", () => {
      const input = {
        event: "meeting",
        timestamp: new Date("2024-01-15T10:30:00.000Z"),
        metadata: {
          created: new Date("2024-01-01T00:00:00.000Z"),
        },
      };
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer) as typeof input;
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.metadata.created).toBeInstanceOf(Date);
      expect(result.timestamp.getTime()).toBe(input.timestamp.getTime());
      expect(result.metadata.created.getTime()).toBe(input.metadata.created.getTime());
    });

    it("handles Date in array", () => {
      const input = [new Date("2024-01-01"), new Date("2024-06-01"), new Date("2024-12-31")];
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer) as Date[];
      expect(result).toHaveLength(3);
      for (let i = 0; i < result.length; i++) {
        expect(result[i]).toBeInstanceOf(Date);
        expect(result[i]!.getTime()).toBe(input[i]!.getTime());
      }
    });
  });

  describe("Map extension", () => {
    it("roundtrips empty Map", () => {
      const input = new Map();
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer);
      expect(result).toBeInstanceOf(Map);
      expect((result as Map<unknown, unknown>).size).toBe(0);
    });

    it("roundtrips Map with string keys", () => {
      const input = new Map([
        ["a", 1],
        ["b", 2],
        ["c", 3],
      ]);
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer) as Map<string, number>;
      expect(result).toBeInstanceOf(Map);
      expect(result.get("a")).toBe(1);
      expect(result.get("b")).toBe(2);
      expect(result.get("c")).toBe(3);
    });

    it("roundtrips Map with number keys", () => {
      const input = new Map([
        [1, "one"],
        [2, "two"],
        [3, "three"],
      ]);
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer) as Map<number, string>;
      expect(result).toBeInstanceOf(Map);
      expect(result.get(1)).toBe("one");
      expect(result.get(2)).toBe("two");
    });

    it("roundtrips Map with object values", () => {
      const input = new Map([
        ["user1", { id: 1, name: "Alice" }],
        ["user2", { id: 2, name: "Bob" }],
      ]);
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer) as Map<string, { id: number; name: string }>;
      expect(result).toBeInstanceOf(Map);
      expect(result.get("user1")).toEqual({ id: 1, name: "Alice" });
      expect(result.get("user2")).toEqual({ id: 2, name: "Bob" });
    });

    it("roundtrips nested Maps", () => {
      const inner = new Map([["nested", "value"]]);
      const input = new Map([["outer", inner]]);
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer) as Map<string, Map<string, string>>;
      expect(result).toBeInstanceOf(Map);
      const innerResult = result.get("outer");
      expect(innerResult).toBeInstanceOf(Map);
      expect(innerResult).toBeDefined();
      expect(innerResult!.get("nested")).toBe("value");
    });

    it("preserves insertion order", () => {
      const input = new Map([
        ["z", 1],
        ["a", 2],
        ["m", 3],
      ]);
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer) as Map<string, number>;
      const keys = Array.from(result.keys());
      expect(keys).toEqual(["z", "a", "m"]);
    });
  });

  describe("Set extension", () => {
    it("roundtrips empty Set", () => {
      const input = new Set();
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer);
      expect(result).toBeInstanceOf(Set);
      expect((result as Set<unknown>).size).toBe(0);
    });

    it("roundtrips Set with primitives", () => {
      const input = new Set([1, 2, 3, "a", "b", true, null]);
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer) as Set<unknown>;
      expect(result).toBeInstanceOf(Set);
      expect(result.has(1)).toBe(true);
      expect(result.has(2)).toBe(true);
      expect(result.has(3)).toBe(true);
      expect(result.has("a")).toBe(true);
      expect(result.has("b")).toBe(true);
      expect(result.has(true)).toBe(true);
      expect(result.has(null)).toBe(true);
    });

    it("roundtrips Set with objects", () => {
      // Note: Object references won't be preserved, but values will be equal
      const input = new Set([{ id: 1 }, { id: 2 }]);
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer) as Set<{ id: number }>;
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(2);
      const values = Array.from(result);
      expect(values).toContainEqual({ id: 1 });
      expect(values).toContainEqual({ id: 2 });
    });

    it("roundtrips nested Sets", () => {
      const inner = new Set([1, 2, 3]);
      const input = new Set([inner]);
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer) as Set<Set<number>>;
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(1);
      const innerResult = Array.from(result)[0];
      expect(innerResult).toBeDefined();
      expect(innerResult).toBeInstanceOf(Set);
      expect(Array.from(innerResult!)).toEqual([1, 2, 3]);
    });

    it("preserves uniqueness", () => {
      const input = new Set([1, 2, 3]);
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer) as Set<number>;
      expect(result.size).toBe(3);
    });
  });

  describe("BigInt extension", () => {
    it("roundtrips small BigInt", () => {
      const input = BigInt(42);
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer);
      expect(typeof result).toBe("bigint");
      expect(result).toBe(BigInt(42));
    });

    it("roundtrips large BigInt (beyond MAX_SAFE_INTEGER)", () => {
      const input = BigInt("9007199254740993"); // MAX_SAFE_INTEGER + 2
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer);
      expect(typeof result).toBe("bigint");
      expect(result).toBe(BigInt("9007199254740993"));
    });

    it("roundtrips negative BigInt", () => {
      const input = BigInt(-123456789);
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer);
      expect(typeof result).toBe("bigint");
      expect(result).toBe(BigInt(-123456789));
    });

    it("roundtrips BigInt(0)", () => {
      const input = BigInt(0);
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer);
      expect(typeof result).toBe("bigint");
      expect(result).toBe(BigInt(0));
    });

    it("handles very large BigInt (1000 digits)", () => {
      const largeNumber = "9".repeat(1000);
      const input = BigInt(largeNumber);
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer);
      expect(typeof result).toBe("bigint");
      expect(result).toBe(BigInt(largeNumber));
    });
  });

  describe("mixed types", () => {
    it("handles object with Date, Map, Set, BigInt", () => {
      const input = {
        createdAt: new Date("2024-01-15T10:30:00.000Z"),
        tags: new Set(["a", "b", "c"]),
        metadata: new Map([
          ["key1", "value1"],
          ["key2", "value2"],
        ]),
        bigNumber: BigInt("9007199254740993"),
      };
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer) as typeof input;

      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.createdAt.getTime()).toBe(input.createdAt.getTime());

      expect(result.tags).toBeInstanceOf(Set);
      expect(Array.from(result.tags)).toEqual(["a", "b", "c"]);

      expect(result.metadata).toBeInstanceOf(Map);
      expect(result.metadata.get("key1")).toBe("value1");

      expect(typeof result.bigNumber).toBe("bigint");
      expect(result.bigNumber).toBe(BigInt("9007199254740993"));
    });

    it("handles array with mixed extended types", () => {
      const input = [
        new Date("2024-01-15"),
        new Map([["a", 1]]),
        new Set([1, 2, 3]),
        BigInt(999),
        "regular string",
        42,
      ];
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer) as unknown[];

      expect(result[0]).toBeInstanceOf(Date);
      expect(result[1]).toBeInstanceOf(Map);
      expect(result[2]).toBeInstanceOf(Set);
      expect(typeof result[3]).toBe("bigint");
      expect(result[4]).toBe("regular string");
      expect(result[5]).toBe(42);
    });

    it("handles deeply nested extended types", () => {
      const input = {
        level1: {
          level2: {
            date: new Date("2024-01-15"),
            map: new Map([
              [
                "nested",
                {
                  set: new Set([BigInt(1), BigInt(2)]),
                },
              ],
            ]),
          },
        },
      };
      const buffer = codec.serialize(input);
      const result = codec.deserialize(buffer) as typeof input;

      expect(result.level1.level2.date).toBeInstanceOf(Date);
      expect(result.level1.level2.map).toBeInstanceOf(Map);

      const nestedValue = result.level1.level2.map.get("nested") as { set: Set<bigint> } | undefined;
      expect(nestedValue).toBeDefined();
      expect(nestedValue!.set).toBeInstanceOf(Set);
      const setValues = Array.from(nestedValue!.set);
      expect(setValues).toContainEqual(BigInt(1));
      expect(setValues).toContainEqual(BigInt(2));
    });
  });
});

describe("createExtendedCodec", () => {
  it("creates codec with all extensions enabled", () => {
    const codec = createExtendedCodec();
    const input = {
      date: new Date("2024-01-15"),
      map: new Map([["a", 1]]),
      set: new Set([1, 2, 3]),
      bigint: BigInt(123),
    };
    const buffer = codec.serialize(input);
    const result = codec.deserialize(buffer) as typeof input;

    expect(result.date).toBeInstanceOf(Date);
    expect(result.map).toBeInstanceOf(Map);
    expect(result.set).toBeInstanceOf(Set);
    expect(typeof result.bigint).toBe("bigint");
  });

  it("passes additional options through", () => {
    const codec = createExtendedCodec({ sortKeys: true, initialBufferSize: 4096 });
    const input = { z: 1, a: 2 };
    const buffer = codec.serialize(input);
    expect(codec.deserialize(buffer)).toEqual(input);
  });

  it("can be used with generic type parameter", () => {
    interface MyData {
      id: number;
      createdAt: Date;
      tags: Set<string>;
    }
    const codec = createExtendedCodec<MyData>();
    const input: MyData = {
      id: 1,
      createdAt: new Date("2024-01-15"),
      tags: new Set(["tag1", "tag2"]),
    };
    const buffer = codec.serialize(input);
    const result: MyData = codec.deserialize(buffer);

    expect(result.id).toBe(1);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.tags).toBeInstanceOf(Set);
  });
});
