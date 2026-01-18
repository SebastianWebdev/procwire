# @procwire/codec-msgpack

MessagePack serialization codec for `@procwire/transport`.

Provides efficient binary serialization using [@msgpack/msgpack](https://github.com/msgpack/msgpack-javascript) with automatic error handling and optimized buffer management.

## Installation

```bash
npm install @procwire/codec-msgpack @msgpack/msgpack
```

Note: `@msgpack/msgpack` is a peer dependency and must be installed separately.

## Usage

### Basic Usage

```ts
import { MessagePackCodec } from '@procwire/codec-msgpack';
import { ChannelBuilder, StdioTransport } from '@procwire/transport';

const codec = new MessagePackCodec();

// Use with ChannelBuilder
const channel = new ChannelBuilder()
  .withTransport(transport)
  .withFraming(framing)
  .withSerialization(codec)
  .withProtocol(protocol)
  .build();
```

### Standalone Usage

```ts
import { MessagePackCodec } from '@procwire/codec-msgpack';

const codec = new MessagePackCodec();

// Serialize
const data = { user: 'Alice', id: 123, tags: ['foo', 'bar'] };
const buffer = codec.serialize(data);

// Deserialize
const decoded = codec.deserialize(buffer);
console.log(decoded); // { user: 'Alice', id: 123, tags: ['foo', 'bar'] }
```

## Features

- **Efficient Binary Format**: More compact than JSON, especially for numeric data
- **Type Support**: Handles all standard JavaScript types (objects, arrays, strings, numbers, booleans, null)
- **Error Handling**: Wraps encoding/decoding errors in `SerializationError` from `@procwire/transport`
- **Optimized**: Zero-copy buffer creation for better performance
- **Type-Safe**: Full TypeScript support with `SerializationCodec<unknown>` interface

## API

### `MessagePackCodec`

Implements `SerializationCodec<unknown>` interface.

#### Properties

- `name: "msgpack"` - Codec identifier
- `contentType: "application/x-msgpack"` - MIME type

#### Methods

##### `serialize(value: unknown): Buffer`

Serializes a JavaScript value to MessagePack binary format.

**Parameters:**
- `value` - Any serializable JavaScript value

**Returns:** `Buffer` containing MessagePack-encoded data

**Throws:** `SerializationError` if encoding fails

##### `deserialize(buffer: Buffer): unknown`

Deserializes MessagePack binary data to a JavaScript value.

**Parameters:**
- `buffer` - Buffer containing MessagePack-encoded data

**Returns:** Deserialized JavaScript value

**Throws:** `SerializationError` if decoding fails

## Performance

MessagePack provides significant performance and size advantages over JSON:

- **Smaller payload**: Typically 20-50% smaller than JSON for structured data
- **Faster encoding/decoding**: More efficient than JSON parsing
- **Binary-safe**: Can encode binary data without base64 encoding

Ideal for:
- High-throughput IPC communication
- Large data transfers
- Numeric-heavy payloads
- Binary data transmission

## License

MIT
