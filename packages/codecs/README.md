# @procwire/codecs

Serialization codecs for Procwire binary protocol.

## Highlights

- **rawCodec** - Buffer passthrough (zero serialization overhead)
- **rawChunksCodec** - Zero-copy `Buffer[]` for large payloads
- **msgpackCodec** - Compact binary with Date/Buffer extension types
- **arrowCodec** - Columnar data for ML embeddings and analytics

## Codec Comparison

| Codec | Input Type | Output Type | Zero-Copy | Use Case |
|-------|-----------|-------------|-----------|----------|
| `rawCodec` | `Buffer` | `Buffer` | No | Pre-serialized binary data |
| `rawChunksCodec` | `Buffer[]` | `Buffer[]` | Yes | Large files, streaming |
| `msgpackCodec` | `object` | `object` | No | Small/medium objects, configs |
| `arrowCodec` | `Table/object` | `Table` | Yes (read) | ML embeddings, DB results |

## Installation

```bash
npm install @procwire/codecs
```

**Requirements:** Node.js >= 22

**Peer dependencies:** `@procwire/protocol`

## Quick Start

```typescript
import { rawCodec, rawChunksCodec, msgpackCodec, arrowCodec } from "@procwire/codecs";

// For small/medium payloads - returns Buffer
const data = rawCodec.deserialize(payload);

// For large payloads - returns Buffer[] (ZERO-COPY!)
const chunks = rawChunksCodec.deserializeChunks(payloadChunks);

// For objects with Date/Buffer support
const obj = msgpackCodec.deserialize(payload);

// For columnar data (ML embeddings, query results)
const table = arrowCodec.deserialize(payload);
```

## API Reference

### Codec Interface

All codecs implement the `Codec<TInput, TOutput>` interface:

```typescript
interface Codec<TInput = unknown, TOutput = TInput> {
  serialize(data: TInput): Buffer;
  deserialize(buffer: Buffer): TOutput;
  deserializeChunks?(chunks: readonly Buffer[]): TOutput;  // Optional zero-copy
  readonly name: string;
}
```

### rawCodec

Pass-through codec for pre-serialized binary data.

```typescript
import { rawCodec } from "@procwire/codecs";

const buffer = rawCodec.serialize(myBuffer);       // Returns same buffer
const data = rawCodec.deserialize(receivedBuffer); // Returns same buffer
```

**When to use:** Binary files, images, audio, pre-serialized data.

### rawChunksCodec

Zero-copy codec that preserves buffer chunks without merging.

```typescript
import { rawChunksCodec } from "@procwire/codecs";

const chunks = rawChunksCodec.deserializeChunks(payloadChunks);
// chunks is Buffer[] - same references, no copy!
```

**When to use:** Large file transfers, streaming where you want to avoid memory copies.

### msgpackCodec

MessagePack codec with extension types for Buffer and Date.

```typescript
import { msgpackCodec } from "@procwire/codecs";

const data = {
  name: "test",
  buffer: Buffer.from("hello"),
  date: new Date()
};

const serialized = msgpackCodec.serialize(data);
const deserialized = msgpackCodec.deserialize(serialized);
// deserialized.buffer is Buffer
// deserialized.date is Date
```

**Extension types:**
- Type 1: `Buffer` - preserved as Buffer on deserialization
- Type 2: `Date` - preserved as Date on deserialization

**When to use:** JavaScript objects, configs, progress events, error responses.

### arrowCodec

Apache Arrow IPC codec for columnar data.

```typescript
import { arrowCodec } from "@procwire/codecs";
import { tableFromArrays } from "apache-arrow";

// From simple object
const data = arrowCodec.serialize({
  embeddings: new Float32Array([0.1, 0.2, 0.3]),
  ids: [1, 2, 3],
});

// From Arrow Table
const table = tableFromArrays({
  column1: [1, 2, 3],
  column2: ["a", "b", "c"],
});
const serialized = arrowCodec.serialize(table);

// Deserialize always returns Table (zero-copy read)
const result = arrowCodec.deserialize(serialized);
```

**When to use:** ML embeddings, database query results, batch data, numeric arrays.

### codecDeserialize

Helper that automatically chooses the most efficient deserialization path.

```typescript
import { codecDeserialize } from "@procwire/codecs";

// Prefers deserializeChunks if available (zero-copy)
// Falls back to deserialize(Buffer.concat(chunks))
const data = codecDeserialize(myCodec, frame);
```

## Custom Codecs

Implement the `Codec` interface for custom serialization:

```typescript
import type { Codec } from "@procwire/codecs";

const jsonCodec: Codec<MyData> = {
  name: "json",
  serialize: (data) => Buffer.from(JSON.stringify(data)),
  deserialize: (buf) => JSON.parse(buf.toString()),
};

// With zero-copy support
const customCodec: Codec<MyData> = {
  name: "custom",
  serialize: (data) => /* ... */,
  deserialize: (buf) => /* ... */,
  deserializeChunks: (chunks) => /* ... */,  // Optional
};
```

## Type Aliases

```typescript
type RawCodecType = Codec<Buffer, Buffer>;
type RawChunksCodecType = Codec<Buffer[], Buffer[]>;
type ObjectCodecType<T> = Codec<T, T>;
```

## License

MIT
