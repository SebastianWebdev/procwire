# @procwire/codec-arrow

High-performance Apache Arrow IPC serialization codec for `@procwire/transport`.

Provides efficient columnar data serialization using [apache-arrow](https://github.com/apache/arrow/tree/main/js), ideal for analytical workloads and large datasets.

## Features

- **Zero-copy serialization** - No unnecessary memory allocation
- **Configurable IPC format** - Stream (default) or File format
- **Input validation** - Can be disabled for maximum performance
- **Metrics collection** - Optional throughput monitoring
- **Cross-language** - Compatible with PyArrow, Arrow C++, etc.
- **Type-safe** - Full TypeScript support

## Performance

| Metric                 | Value                    |
| ---------------------- | ------------------------ |
| Throughput             | >1M rows/second          |
| Serialization overhead | Near-zero (zero-copy)    |
| Memory overhead        | Minimal (reuses buffers) |
| Stream format overhead | ~100-200 bytes           |

## Installation

```bash
npm install @procwire/codec-arrow apache-arrow
```

Note: `apache-arrow` is a peer dependency and must be installed separately.

## Quick Start

### Basic Usage

```ts
import { tableFromArrays } from "apache-arrow";
import { ArrowCodec } from "@procwire/codec-arrow";

const codec = new ArrowCodec();

const table = tableFromArrays({
  id: [1, 2, 3],
  name: ["Alice", "Bob", "Charlie"],
  score: [95.5, 87.3, 92.1],
});

// Serialize (zero-copy!)
const buffer = codec.serialize(table);

// Deserialize
const decoded = codec.deserialize(buffer);
console.log(decoded.numRows); // 3
```

### High-Performance Mode

```ts
import { createFastArrowCodec } from "@procwire/codec-arrow";

// For trusted environments - validation disabled
const codec = createFastArrowCodec("stream");

// Process data at maximum throughput
for (const table of tables) {
  const buffer = codec.serialize(table);
  channel.send(buffer);
}
```

### With Metrics

```ts
import { createMonitoredArrowCodec } from "@procwire/codec-arrow";

const codec = createMonitoredArrowCodec();

// Process data...
for (const table of tables) {
  codec.serialize(table);
}

// Check throughput
const metrics = codec.metrics!;
console.log(`Processed: ${metrics.rowsSerialized.toLocaleString()} rows`);
console.log(`Data size: ${(metrics.bytesSerialised / 1024 / 1024).toFixed(2)} MB`);
console.log(`Errors: ${metrics.serializeErrors}`);
```

### File Format (Random Access)

```ts
import { createFileArrowCodec } from "@procwire/codec-arrow";
import { writeFileSync } from "fs";

const codec = createFileArrowCodec();
const buffer = codec.serialize(table);

// Write to disk - format supports random access
writeFileSync("data.arrow", buffer);
```

## API Reference

### ArrowCodec

Main codec class implementing `SerializationCodec<Table>`.

```ts
const codec = new ArrowCodec(options?: ArrowCodecOptions);
```

#### Properties

| Property      | Type                        | Description               |
| ------------- | --------------------------- | ------------------------- |
| `name`        | `"arrow"`                   | Codec identifier          |
| `contentType` | `string`                    | MIME type based on format |
| `metrics`     | `ArrowCodecMetrics \| null` | Current metrics or null   |

#### Methods

##### `serialize(value: Table): Buffer`

Serializes an Apache Arrow Table to IPC format using zero-copy optimization.

**Parameters:**

- `value` - Arrow Table to serialize

**Returns:** `Buffer` containing Arrow IPC data

**Throws:** `SerializationError` if value is not a valid Table or encoding fails

##### `deserialize(buffer: Buffer): Table`

Deserializes Arrow IPC data to an Apache Arrow Table.

**Parameters:**

- `buffer` - Buffer containing Arrow IPC data

**Returns:** Deserialized Arrow Table

**Throws:** `SerializationError` if buffer is invalid or decoding fails

##### `resetMetrics(): void`

Resets all collected metrics to zero. No-op if metrics collection is disabled.

### ArrowCodecOptions

| Option           | Type                 | Default    | Description                  |
| ---------------- | -------------------- | ---------- | ---------------------------- |
| `format`         | `'stream' \| 'file'` | `'stream'` | IPC format to use            |
| `validateInput`  | `boolean`            | `true`     | Enable input type validation |
| `collectMetrics` | `boolean`            | `false`    | Enable metrics collection    |

### ArrowCodecMetrics

Metrics collected when `collectMetrics: true`:

| Metric              | Type     | Description                    |
| ------------------- | -------- | ------------------------------ |
| `serializeCount`    | `number` | Successful serialize() calls   |
| `deserializeCount`  | `number` | Successful deserialize() calls |
| `bytesSerialised`   | `number` | Total bytes serialized         |
| `bytesDeserialized` | `number` | Total bytes deserialized       |
| `rowsSerialized`    | `number` | Total rows serialized          |
| `rowsDeserialized`  | `number` | Total rows deserialized        |
| `serializeErrors`   | `number` | Failed serialize() calls       |
| `deserializeErrors` | `number` | Failed deserialize() calls     |

### Helper Functions

#### `createFastArrowCodec(format?: ArrowIPCFormat): ArrowCodec`

Creates codec optimized for maximum throughput with validation disabled.

**Warning:** Only use in trusted environments where input is guaranteed valid.

#### `createMonitoredArrowCodec(options?: Omit<ArrowCodecOptions, 'collectMetrics'>): ArrowCodec`

Creates codec with metrics collection enabled.

#### `createFileArrowCodec(options?: Omit<ArrowCodecOptions, 'format'>): ArrowCodec`

Creates codec configured for file format (supports random access).

## Performance Tuning

### Maximum Throughput

For maximum performance in trusted environments:

```ts
const codec = new ArrowCodec({
  format: "stream", // Smaller, no footer overhead
  validateInput: false, // Skip type checks
  collectMetrics: false, // Skip metric collection
});
```

Or use the helper:

```ts
const codec = createFastArrowCodec("stream");
```

### Memory Optimization

The codec uses zero-copy serialization by wrapping the underlying ArrayBuffer:

```ts
// Internally uses:
Buffer.from(uint8array.buffer, uint8array.byteOffset, uint8array.byteLength);
// Instead of:
Buffer.from(uint8array); // This copies data!
```

This reduces memory allocation by ~50% during serialization.

### Format Selection

| Use Case             | Recommended Format   |
| -------------------- | -------------------- |
| IPC streaming        | `'stream'` (default) |
| Network transfer     | `'stream'`           |
| File storage         | `'file'`             |
| Random access needed | `'file'`             |
| Smallest size        | `'stream'`           |

## Integration with @procwire/transport

```ts
import { ChannelBuilder } from "@procwire/transport";
import { ArrowCodec } from "@procwire/codec-arrow";

const channel = new ChannelBuilder()
  .withTransport(transport)
  .withFraming(new LengthPrefixedFraming())
  .withSerialization(new ArrowCodec({ validateInput: false }))
  .withProtocol(new JsonRpcProtocol())
  .build();

// Send Arrow tables over the channel
await channel.request("processAnalytics", analyticsTable);
```

## Type System Support

The codec provides full TypeScript support:

```ts
import type { Table, Schema, Field, RecordBatch } from "@procwire/codec-arrow";
import { ArrowCodec, ArrowCodecOptions, ArrowCodecMetrics } from "@procwire/codec-arrow";
```

## Error Handling

All errors are wrapped in `SerializationError` from `@procwire/transport`:

```ts
import { SerializationError } from "@procwire/transport";

try {
  codec.serialize(invalidTable);
} catch (error) {
  if (error instanceof SerializationError) {
    console.error("Serialization failed:", error.message);
    console.error("Cause:", error.cause);
  }
}
```

## Advanced Usage

### Creating Tables from Arrays

```ts
import { tableFromArrays } from "apache-arrow";

const table = tableFromArrays({
  // Integer column
  id: [1, 2, 3],

  // String column
  name: ["Alice", "Bob", "Charlie"],

  // Float column
  score: [95.5, 87.3, 92.1],

  // Boolean column
  active: [true, false, true],

  // Column with nulls
  email: ["alice@example.com", null, "charlie@example.com"],
});
```

### Typed Arrays for Performance

```ts
import { tableFromArrays } from "apache-arrow";

const table = tableFromArrays({
  int32_col: new Int32Array([1, 2, 3, 4, 5]),
  float64_col: new Float64Array([1.1, 2.2, 3.3, 4.4, 5.5]),
  uint8_col: new Uint8Array([255, 128, 64, 32, 0]),
});
```

### Accessing Column Data

```ts
const table = tableFromArrays({
  id: [1, 2, 3],
  name: ["Alice", "Bob", "Charlie"],
});

// Get column
const idColumn = table.getChild("id");
const ids = idColumn?.toArray(); // [1, 2, 3]

// Iterate rows
for (let i = 0; i < table.numRows; i++) {
  const row = table.get(i);
  console.log(row);
}
```

## Cross-Language Compatibility

Arrow IPC format is cross-platform and cross-language:

- **Python**: PyArrow
- **R**: arrow R package
- **Java**: Arrow Java
- **C++**: Arrow C++
- **Rust**: arrow-rs

Tables serialized in one language can be deserialized in another seamlessly.

## Use Cases

### Time-Series Data

```ts
const timeSeries = tableFromArrays({
  timestamp: timestamps,
  value: values,
  quality: qualities,
});
```

### Data Analytics

```ts
const analyticsData = tableFromArrays({
  user_id: userIds,
  event_type: eventTypes,
  timestamp: timestamps,
  properties: jsonProperties,
});
```

### Machine Learning

```ts
const features = tableFromArrays({
  feature1: feature1Data,
  feature2: feature2Data,
  label: labels,
});
```

## License

MIT
