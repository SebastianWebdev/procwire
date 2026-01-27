/**
 * Test data generators for integration tests.
 */

/**
 * Generate random string of specified length.
 */
export function randomString(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Generate a payload of specified size in bytes (approximately).
 */
export function generatePayload(sizeBytes: number): { data: string } {
  return { data: randomString(sizeBytes) };
}

/**
 * Generate array of test items.
 */
export function generateItems(count: number): Array<{
  id: number;
  name: string;
  values: number[];
  metadata: Record<string, string>;
}> {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    name: `Item ${i}`,
    values: [i, i * 2, i * 3],
    metadata: {
      createdAt: new Date().toISOString(),
      version: `1.0.${i}`,
    },
  }));
}

/**
 * Generate nested object structure.
 */
export function generateNestedObject(depth: number, breadth: number): unknown {
  if (depth === 0) {
    return randomString(10);
  }

  const result: Record<string, unknown> = {};
  for (let i = 0; i < breadth; i++) {
    result[`key_${i}`] = generateNestedObject(depth - 1, breadth);
  }
  return result;
}

/**
 * Generate binary-like data (Uint8Array compatible).
 */
export function generateBinaryData(length: number): number[] {
  return Array.from({ length }, () => Math.floor(Math.random() * 256));
}

/**
 * Generate tabular data for Arrow codec testing.
 *
 * Creates typed arrays suitable for Apache Arrow Table creation.
 */
export function generateTabularData(rows: number): {
  ids: Int32Array;
  values: Float64Array;
  names: string[];
  flags: boolean[];
} {
  return {
    ids: new Int32Array(Array.from({ length: rows }, (_, i) => i)),
    values: new Float64Array(Array.from({ length: rows }, () => Math.random() * 1000)),
    names: Array.from({ length: rows }, (_, i) => `item_${i}`),
    flags: Array.from({ length: rows }, () => Math.random() > 0.5),
  };
}

/**
 * Generate protobuf-compatible test records.
 *
 * Creates data matching the complex Record schema used in protobuf tests.
 */
export function generateProtobufRecords(count: number): Array<{
  id: string;
  name: string;
  value: number;
  status: number;
  tags: string[];
  metadata: Array<{ key: string; value: string }>;
}> {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i),
    name: `Record ${i}`,
    value: Math.random() * 1000,
    status: i % 3, // 0=PENDING, 1=ACTIVE, 2=COMPLETED
    tags: [`tag${i % 10}`, `category${i % 5}`],
    metadata: [
      { key: "index", value: String(i) },
      { key: "timestamp", value: new Date().toISOString() },
    ],
  }));
}
