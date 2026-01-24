import { SerializationError } from "../utils/errors.js";
import type { SerializationCodec } from "./types.js";

/**
 * Options for JSON codec configuration.
 */
export interface JsonCodecOptions {
  /**
   * Function to transform values during serialization.
   * Applied during JSON.stringify().
   */
  replacer?: (key: string, value: unknown) => unknown;

  /**
   * Function to transform values during deserialization.
   * Applied during JSON.parse().
   */
  reviver?: (key: string, value: unknown) => unknown;

  /**
   * Indentation for formatted JSON output.
   * Useful for debugging. Default: undefined (compact).
   */
  space?: number | string;
}

/**
 * JSON serialization codec with zero dependencies.
 *
 * Converts objects to/from UTF-8 encoded JSON buffers.
 * Supports custom replacer/reviver functions for advanced serialization logic.
 *
 * @example
 * ```ts
 * const codec = new JsonCodec();
 * const buffer = codec.serialize({ foo: 'bar' });
 * const obj = codec.deserialize(buffer);
 * ```
 *
 * @example With custom replacer
 * ```ts
 * const codec = new JsonCodec({
 *   replacer: (key, value) => key === 'password' ? undefined : value
 * });
 * ```
 */
export class JsonCodec<T = unknown> implements SerializationCodec<T> {
  public readonly name = "json";
  public readonly contentType = "application/json";

  private readonly replacer: ((key: string, value: unknown) => unknown) | undefined;
  private readonly reviver: ((key: string, value: unknown) => unknown) | undefined;
  private readonly space: number | string | undefined;

  constructor(options: JsonCodecOptions = {}) {
    this.replacer = options.replacer;
    this.reviver = options.reviver;
    this.space = options.space;
  }

  /**
   * Serializes a value to a UTF-8 encoded JSON buffer.
   *
   * @param value - Value to serialize
   * @returns Buffer containing UTF-8 encoded JSON
   * @throws {SerializationError} if JSON.stringify fails
   */
  serialize(value: T): Buffer {
    try {
      const json = JSON.stringify(
        value,
        this.replacer as (key: string, value: unknown) => unknown,
        this.space,
      );
      return Buffer.from(json, "utf8");
    } catch (error) {
      throw new SerializationError(
        `Failed to serialize value to JSON: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }

  /**
   * Deserializes a UTF-8 encoded JSON buffer to a value.
   *
   * @param buffer - Buffer containing UTF-8 encoded JSON
   * @returns Deserialized value
   * @throws {SerializationError} if JSON.parse fails
   */
  deserialize(buffer: Buffer): T {
    try {
      const json = buffer.toString("utf8");
      return JSON.parse(json, this.reviver as (key: string, value: unknown) => unknown) as T;
    } catch (error) {
      throw new SerializationError(
        `Failed to deserialize JSON: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }
}
