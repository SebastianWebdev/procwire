import { SerializationError } from "../utils/errors.js";
import type { SerializationCodec } from "./types.js";

/**
 * Global codec registry for serialization codecs.
 *
 * Provides a static registry to register and lookup codecs by name or content type.
 * Thread-safe in Node.js (single-threaded event loop).
 *
 * @example
 * ```ts
 * import { CodecRegistry, JsonCodec } from '@aspect-ipc/transport';
 *
 * CodecRegistry.register(new JsonCodec());
 * const codec = CodecRegistry.get('json');
 * ```
 */
export class CodecRegistry {
  private static readonly byName = new Map<string, SerializationCodec>();
  private static readonly byContentType = new Map<string, SerializationCodec>();

  /**
   * Registers a serialization codec in the global registry.
   *
   * @param codec - Codec to register
   * @throws {SerializationError} if a codec with the same name or content type already exists
   *
   * @example
   * ```ts
   * CodecRegistry.register(new JsonCodec());
   * CodecRegistry.register(new RawCodec());
   * ```
   */
  static register(codec: SerializationCodec): void {
    const existingByName = this.byName.get(codec.name);
    if (existingByName) {
      throw new SerializationError(
        `Codec with name '${codec.name}' is already registered (content type: '${existingByName.contentType}')`,
      );
    }

    const existingByContentType = this.byContentType.get(codec.contentType);
    if (existingByContentType) {
      throw new SerializationError(
        `Codec with content type '${codec.contentType}' is already registered (name: '${existingByContentType.name}')`,
      );
    }

    this.byName.set(codec.name, codec);
    this.byContentType.set(codec.contentType, codec);
  }

  /**
   * Unregisters a codec by name.
   *
   * @param name - Name of the codec to unregister
   * @returns true if codec was found and removed, false otherwise
   *
   * @example
   * ```ts
   * CodecRegistry.unregister('json');
   * ```
   */
  static unregister(name: string): boolean {
    const codec = this.byName.get(name);
    if (!codec) {
      return false;
    }

    this.byName.delete(name);
    this.byContentType.delete(codec.contentType);
    return true;
  }

  /**
   * Retrieves a codec by name.
   *
   * @param name - Codec name (e.g., 'json', 'raw')
   * @returns Codec instance or undefined if not found
   *
   * @example
   * ```ts
   * const codec = CodecRegistry.get('json');
   * if (codec) {
   *   const buffer = codec.serialize({ foo: 'bar' });
   * }
   * ```
   */
  static get(name: string): SerializationCodec | undefined {
    return this.byName.get(name);
  }

  /**
   * Retrieves a codec by content type.
   *
   * @param contentType - Content type (e.g., 'application/json')
   * @returns Codec instance or undefined if not found
   *
   * @example
   * ```ts
   * const codec = CodecRegistry.getByContentType('application/json');
   * ```
   */
  static getByContentType(contentType: string): SerializationCodec | undefined {
    return this.byContentType.get(contentType);
  }

  /**
   * Lists all registered codec names.
   *
   * @returns Array of codec names
   *
   * @example
   * ```ts
   * const names = CodecRegistry.list();
   * console.log(names); // ['json', 'raw']
   * ```
   */
  static list(): string[] {
    return Array.from(this.byName.keys());
  }

  /**
   * Clears all registered codecs.
   * Intended for testing purposes only.
   *
   * @internal
   */
  static resetForTests(): void {
    this.byName.clear();
    this.byContentType.clear();
  }
}
