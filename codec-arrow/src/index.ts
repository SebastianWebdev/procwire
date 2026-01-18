import type { Table } from "apache-arrow";
import { tableFromIPC, tableToIPC } from "apache-arrow";

import type { SerializationCodec } from "@aspect-ipc/transport/serialization";

export class ArrowCodec implements SerializationCodec<Table> {
  readonly name = "arrow";
  readonly contentType = "application/vnd.apache.arrow.stream";

  serialize(value: Table): Buffer {
    return Buffer.from(tableToIPC(value));
  }

  deserialize(buffer: Buffer): Table {
    return tableFromIPC(buffer);
  }
}
