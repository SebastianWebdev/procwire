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
