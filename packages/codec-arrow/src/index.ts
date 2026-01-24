import type { Table } from "apache-arrow";
import { tableFromIPC, tableToIPC } from "apache-arrow";
import type { SerializationCodec } from "@procwire/transport/serialization";
import { SerializationError } from "@procwire/transport";

export class ArrowCodec implements SerializationCodec<Table> {
  readonly name = "arrow";
  readonly contentType = "application/vnd.apache.arrow.stream";

  serialize(value: Table): Buffer {
    // Basic validation
    if (!value || typeof value.schema !== "object") {
      throw new SerializationError(
        "Value must be an Apache Arrow Table",
        new TypeError("Invalid table object"),
      );
    }

    try {
      const uint8array = tableToIPC(value, "stream");
      return Buffer.from(uint8array);
    } catch (error) {
      throw new SerializationError(
        `Failed to encode Arrow table: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }

  deserialize(buffer: Buffer): Table {
    if (!Buffer.isBuffer(buffer)) {
      throw new SerializationError("Input must be a Buffer", new TypeError("Invalid input type"));
    }

    try {
      return tableFromIPC(buffer);
    } catch (error) {
      throw new SerializationError(
        `Failed to decode Arrow table: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }
}
