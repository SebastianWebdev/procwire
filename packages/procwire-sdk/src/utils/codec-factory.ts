/**
 * Codec factory for dynamic loading based on environment configuration.
 */

import type { SerializationCodec } from "@procwire/transport";
import { JsonCodec, RawCodec } from "@procwire/transport";

/**
 * Environment variable name for data channel serialization codec.
 */
export const ENV_DATA_CODEC = "PROCWIRE_DATA_CODEC";

/**
 * Creates a serialization codec by name.
 * Used when codec configuration is received via environment variable.
 *
 * @param name - Codec name (json, msgpack, protobuf, raw)
 * @returns SerializationCodec instance
 * @throws {Error} if codec is unknown or peer dependency is not installed
 */
export function createCodecByName(name: string): SerializationCodec {
  switch (name) {
    case "json":
      return new JsonCodec();

    case "raw":
      return new RawCodec();

    case "msgpack": {
      try {
        // Dynamic import to avoid hard dependency
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { MessagePackCodec } = require("@procwire/codec-msgpack");
        return new MessagePackCodec();
      } catch {
        throw new Error(
          `MessagePack codec requested but @procwire/codec-msgpack is not installed.`,
        );
      }
    }

    case "protobuf": {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { ProtobufCodec } = require("@procwire/codec-protobuf");
        return new ProtobufCodec();
      } catch {
        throw new Error(`Protobuf codec requested but @procwire/codec-protobuf is not installed.`);
      }
    }

    default:
      throw new Error(`Unknown codec: ${name}. Valid codecs: json, raw, msgpack, protobuf`);
  }
}
