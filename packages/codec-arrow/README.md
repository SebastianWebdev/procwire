# @procwire/codec-arrow

Apache Arrow serialization codec for `@procwire/transport`.

Provides efficient columnar data serialization using [apache-arrow](https://github.com/apache/arrow/tree/main/js), ideal for analytical workloads and large datasets.

## Installation

```bash
npm install @procwire/codec-arrow apache-arrow
```

Note: `apache-arrow` is a peer dependency and must be installed separately.

## Usage

### Basic Usage

```ts
import { tableFromArrays } from 'apache-arrow';
import { ArrowCodec } from '@procwire/codec-arrow';
import { ChannelBuilder } from '@procwire/transport';

const codec = new ArrowCodec();

// Create a table
const table = tableFromArrays({
  id: [1, 2, 3, 4, 5],
  name: ['Alice', 'Bob', 'Charlie', 'David', 'Eve'],
  score: [95.5, 87.3, 92.1, 88.7, 94.2]
});

// Use with ChannelBuilder
const channel = new ChannelBuilder()
  .withTransport(transport)
  .withFraming(framing)
  .withSerialization(codec)
  .withProtocol(protocol)
  .build();

// Send table over channel
await channel.request('processData', table);
```

### Standalone Usage

```ts
import { tableFromArrays } from 'apache-arrow';
import { ArrowCodec } from '@procwire/codec-arrow';

const codec = new ArrowCodec();

// Serialize
const table = tableFromArrays({
  id: [1, 2, 3],
  value: [10.5, 20.3, 30.1]
});

const buffer = codec.serialize(table);

// Deserialize
const decoded = codec.deserialize(buffer);
console.log(decoded.numRows); // 3
console.log(decoded.getChild('id')?.toArray()); // [1, 2, 3]
```

### Working with Large Datasets

```ts
import { tableFromArrays } from 'apache-arrow';
import { ArrowCodec } from '@procwire/codec-arrow';

const codec = new ArrowCodec();

// Create large dataset (100K rows)
const size = 100000;
const table = tableFromArrays({
  timestamp: Array.from({ length: size }, (_, i) => Date.now() + i * 1000),
  sensor_id: Array.from({ length: size }, (_, i) => i % 100),
  temperature: Array.from({ length: size }, () => 20 + Math.random() * 10),
  humidity: Array.from({ length: size }, () => 40 + Math.random() * 20)
});

// Efficient serialization of columnar data
const buffer = codec.serialize(table);
console.log(`Serialized ${size} rows in ${buffer.length} bytes`);

// Fast deserialization
const decoded = codec.deserialize(buffer);
console.log(`Deserialized table with ${decoded.numRows} rows`);
```

## Features

- **Columnar Format**: Optimized for analytical queries and large datasets
- **Type Preservation**: Full type system support (integers, floats, strings, booleans, etc.)
- **Null Handling**: Native support for null values
- **Zero-Copy**: Efficient memory usage with zero-copy reads where possible
- **Error Handling**: Wraps encoding/decoding errors in `SerializationError` from `@procwire/transport`
- **IPC Stream Format**: Uses Arrow IPC streaming format for efficient transmission

## API

### `ArrowCodec`

Implements `SerializationCodec<Table>` interface.

#### Properties

- `name: "arrow"` - Codec identifier
- `contentType: "application/vnd.apache.arrow.stream"` - MIME type

#### Methods

##### `serialize(value: Table): Buffer`

Serializes an Apache Arrow Table to IPC stream format.

**Parameters:**
- `value` - Arrow Table to serialize

**Returns:** `Buffer` containing Arrow IPC stream data

**Throws:** `SerializationError` if encoding fails

##### `deserialize(buffer: Buffer): Table`

Deserializes Arrow IPC stream data to an Apache Arrow Table.

**Parameters:**
- `buffer` - Buffer containing Arrow IPC stream data

**Returns:** Deserialized Arrow Table

**Throws:** `SerializationError` if decoding fails

## Advanced Usage

### Creating Tables from Arrays

```ts
import { tableFromArrays } from 'apache-arrow';

const table = tableFromArrays({
  // Integer column
  id: [1, 2, 3],

  // String column
  name: ['Alice', 'Bob', 'Charlie'],

  // Float column
  score: [95.5, 87.3, 92.1],

  // Boolean column
  active: [true, false, true],

  // Column with nulls
  email: ['alice@example.com', null, 'charlie@example.com']
});
```

### Typed Arrays for Performance

```ts
import { tableFromArrays } from 'apache-arrow';

const table = tableFromArrays({
  int32_col: new Int32Array([1, 2, 3, 4, 5]),
  float64_col: new Float64Array([1.1, 2.2, 3.3, 4.4, 5.5]),
  uint8_col: new Uint8Array([255, 128, 64, 32, 0])
});
```

### Accessing Column Data

```ts
const table = tableFromArrays({
  id: [1, 2, 3],
  name: ['Alice', 'Bob', 'Charlie']
});

// Get column
const idColumn = table.getChild('id');
const ids = idColumn?.toArray(); // [1, 2, 3]

// Iterate rows
for (let i = 0; i < table.numRows; i++) {
  const row = table.get(i);
  console.log(row);
}
```

## Performance

Apache Arrow provides exceptional performance for columnar data:

- **Columnar Storage**: Data stored in columns, not rows - ideal for analytical queries
- **Zero-Copy Reads**: Direct memory access without deserialization overhead
- **Compression**: Built-in dictionary encoding for repeated values
- **Vectorized Operations**: SIMD-friendly data layout for fast processing
- **Cross-Language**: Same binary format used in Python, R, Java, C++, etc.

### Performance Characteristics

Compared to JSON:
- **5-50x faster** serialization/deserialization for large datasets
- **2-10x smaller** binary size for numeric-heavy data
- **Zero-copy** operations for in-memory analytics

Ideal for:
- Time-series data
- Analytics and data science workloads
- Large datasets (millions of rows)
- High-throughput data streaming
- Cross-language data exchange
- Machine learning pipelines

## Use Cases

### Time-Series Data

```ts
const timeSeries = tableFromArrays({
  timestamp: timestamps, // millions of timestamps
  value: values,        // sensor readings
  quality: qualities    // quality flags
});
```

### Data Analytics

```ts
const analyticsData = tableFromArrays({
  user_id: userIds,
  event_type: eventTypes,
  timestamp: timestamps,
  properties: jsonProperties
});
```

### Machine Learning

```ts
const features = tableFromArrays({
  feature1: feature1Data,
  feature2: feature2Data,
  // ... many features
  label: labels
});
```

## Compatibility

Arrow IPC format is cross-platform and cross-language:
- **Python**: PyArrow
- **R**: arrow R package
- **Java**: Arrow Java
- **C++**: Arrow C++
- **Rust**: arrow-rs

Tables can be serialized in one language and deserialized in another seamlessly.

## License

MIT
