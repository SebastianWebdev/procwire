# @procwire/codec-msgpack

MessagePack serialization codec for `@procwire/transport`.

## Features

- **Efficient binary serialization** - 20-50% smaller than JSON
- **Full TypeScript support** - Generic type parameters for type-safe usage
- **Built-in extension types** - Support for Date, Map, Set, BigInt
- **Zero-copy buffer optimization** - Minimal memory overhead
- **Configurable encoding** - Sort keys, buffer size, and more
- **Comprehensive error handling** - Detailed error messages with causes

## Installation

```bash
npm install @procwire/codec-msgpack @msgpack/msgpack
```

Note: `@msgpack/msgpack` is a peer dependency and must be installed separately.

## Quick Start

### Basic Usage

```ts
import { MessagePackCodec } from "@procwire/codec-msgpack";

const codec = new MessagePackCodec();

// Serialize
const data = { user: "Alice", id: 123, tags: ["foo", "bar"] };
const buffer = codec.serialize(data);

// Deserialize
const decoded = codec.deserialize(buffer);
console.log(decoded); // { user: 'Alice', id: 123, tags: ['foo', 'bar'] }
```

### Type-Safe Usage

```ts
import { MessagePackCodec } from "@procwire/codec-msgpack";

interface User {
  id: number;
  name: string;
  email: string;
}

const codec = new MessagePackCodec<User>();

const buffer = codec.serialize({ id: 1, name: "Alice", email: "alice@example.com" });
const user: User = codec.deserialize(buffer);
// TypeScript knows user has id, name, and email properties
```

### Extended Types (Date, Map, Set, BigInt)

```ts
import { createExtendedCodec } from "@procwire/codec-msgpack";

const codec = createExtendedCodec();

const data = {
  createdAt: new Date(),
  tags: new Set(["important", "urgent"]),
  metadata: new Map([
    ["version", "1.0"],
    ["author", "Alice"],
  ]),
  bigNumber: BigInt("9007199254740993"),
};

const buffer = codec.serialize(data);
const decoded = codec.deserialize(buffer);

// All types are preserved!
console.log(decoded.createdAt instanceof Date); // true
console.log(decoded.tags instanceof Set); // true
console.log(decoded.metadata instanceof Map); // true
console.log(typeof decoded.bigNumber); // "bigint"
```

## API Reference

### MessagePackCodec\<T\>

The main codec class implementing `SerializationCodec<T>` interface.

```ts
class MessagePackCodec<T = unknown> implements SerializationCodec<T> {
  readonly name: "msgpack";
  readonly contentType: "application/x-msgpack";

  constructor(options?: MessagePackCodecOptions);
  serialize(value: T): Buffer;
  deserialize(buffer: Buffer): T;
}
```

### MessagePackCodecOptions

Configuration options for the codec.

```ts
interface MessagePackCodecOptions {
  /** Custom extension codec for handling non-standard types */
  extensionCodec?: ExtensionCodec;

  /** Initial buffer size for encoding (default: 2048) */
  initialBufferSize?: number;

  /** Sort object keys alphabetically (default: false) */
  sortKeys?: boolean;

  /** Force integers encoded as floats to be decoded as integers (default: false) */
  forceIntegerToFloat?: boolean;

  /** Custom context passed to extension codec */
  context?: unknown;
}
```

### createExtendedCodec\<T\>()

Factory function that creates a codec with built-in extension support.

```ts
function createExtendedCodec<T = unknown>(
  options?: Omit<MessagePackCodecOptions, "extensionCodec">,
): MessagePackCodec<T>;
```

### createCommonExtensionCodec()

Creates an ExtensionCodec with support for common JavaScript types.

```ts
function createCommonExtensionCodec(): ExtensionCodec;
```

Extension type IDs used:

- `0`: Date (milliseconds since epoch as float64)
- `1`: Map (encoded as array of [key, value] pairs)
- `2`: Set (encoded as array of values)
- `3`: BigInt (encoded as string representation)

## Type Support

### Default Behavior (without extensions)

| Type         | Encoded As             | Notes                                 |
| ------------ | ---------------------- | ------------------------------------- |
| `null`       | nil                    |                                       |
| `boolean`    | bool                   |                                       |
| `number`     | int/float              | Based on value                        |
| `string`     | str                    | UTF-8 encoded                         |
| `Uint8Array` | bin                    | Preserved as binary                   |
| `Buffer`     | bin                    | Preserved as binary                   |
| `Array`      | array                  |                                       |
| `Object`     | map                    |                                       |
| `undefined`  | nil                    | Converted to null                     |
| `Infinity`   | float                  | Preserved as Infinity                 |
| `NaN`        | float                  | Preserved as NaN                      |
| `Date`       | str (ISO)              | Loses type information                |
| `Map`        | map (empty or partial) | May lose entries with non-string keys |
| `Set`        | array                  | Loses type information                |
| `BigInt`     | **ERROR**              | Cannot serialize                      |

### With Extension Codec (`createExtendedCodec`)

| Type     | Behavior                             |
| -------- | ------------------------------------ |
| `Date`   | Preserved with millisecond precision |
| `Map`    | Preserved with any key types         |
| `Set`    | Preserved as Set                     |
| `BigInt` | Preserved with full precision        |

## Advanced Usage

### Custom Extension Types

```ts
import { ExtensionCodec } from "@msgpack/msgpack";
import { MessagePackCodec } from "@procwire/codec-msgpack";

const extensionCodec = new ExtensionCodec();

// Register custom type (e.g., RegExp)
extensionCodec.register({
  type: 10, // Use type IDs 0-127 for custom types
  encode: (value: unknown): Uint8Array | null => {
    if (value instanceof RegExp) {
      return new TextEncoder().encode(JSON.stringify({ source: value.source, flags: value.flags }));
    }
    return null;
  },
  decode: (data: Uint8Array): RegExp => {
    const { source, flags } = JSON.parse(new TextDecoder().decode(data));
    return new RegExp(source, flags);
  },
});

const codec = new MessagePackCodec({ extensionCodec });
```

### Deterministic Output

```ts
const codec = new MessagePackCodec({
  sortKeys: true, // Keys will be sorted alphabetically
});

// Useful for:
// - Content-addressable storage
// - Reproducible builds
// - Caching based on serialized content
```

### With ChannelBuilder

```ts
import { ChannelBuilder, StdioTransport, LengthPrefixedFraming } from "@procwire/transport";
import { MessagePackCodec } from "@procwire/codec-msgpack";

const channel = new ChannelBuilder()
  .withTransport(new StdioTransport())
  .withFraming(new LengthPrefixedFraming())
  .withSerialization(new MessagePackCodec())
  .build();
```

## Performance

MessagePack provides significant advantages over JSON:

- **Smaller payload**: Typically 20-50% smaller than JSON
- **Faster encoding/decoding**: More efficient than JSON parsing
- **Binary-safe**: Can encode binary data without base64 overhead
- **Type preservation**: With extensions, preserves Date, Map, Set, BigInt

### Size Comparison Example

```ts
const data = {
  users: Array.from({ length: 100 }, (_, i) => ({
    id: i,
    name: `User ${i}`,
    active: i % 2 === 0,
    score: Math.random() * 100,
  })),
};

const jsonSize = Buffer.from(JSON.stringify(data)).length;
const msgpackSize = new MessagePackCodec().serialize(data).length;

// msgpackSize is typically 30-40% smaller than jsonSize
```

## Limitations

- **No function serialization**: Functions cannot be serialized
- **No circular references**: Will throw on circular object references
- **Object key types**: Without extensions, only string keys are supported
- **BigInt**: Requires extension codec (use `createExtendedCodec`)
- **Symbol**: Cannot be serialized

## Error Handling

All errors are wrapped in `SerializationError` from `@procwire/transport`:

```ts
import { SerializationError } from "@procwire/transport";

try {
  codec.deserialize(invalidBuffer);
} catch (error) {
  if (error instanceof SerializationError) {
    console.error("Serialization failed:", error.message);
    console.error("Original error:", error.cause);
  }
}
```

## License

MIT
