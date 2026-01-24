# @procwire/codec-protobuf

Protocol Buffers serialization codec for `@procwire/transport`.

Provides type-safe binary serialization using [protobufjs](https://github.com/protobufjs/protobuf.js) with schema validation, configurable options, and comprehensive error handling.

## Features

- ✅ Type-safe with full TypeScript generics
- ✅ Schema validation via protobufjs
- ✅ Configurable Long/enum/bytes conversion
- ✅ Message verification before encoding
- ✅ Zero-copy buffer optimization
- ✅ Helper functions for .proto file loading
- ✅ Comprehensive error handling

## Installation

```bash
npm install @procwire/codec-protobuf protobufjs
```

Note: `protobufjs` is a peer dependency and must be installed separately.

## Quick Start

### Basic Usage

```ts
import * as protobuf from "protobufjs";
import { ProtobufCodec } from "@procwire/codec-protobuf";

// Define your schema
const root = protobuf.Root.fromJSON({
  nested: {
    User: {
      fields: {
        id: { type: "int32", id: 1 },
        name: { type: "string", id: 2 },
        email: { type: "string", id: 3, rule: "optional" },
      },
    },
  },
});

const UserType = root.lookupType("User");

// Create typed codec
interface User {
  id: number;
  name: string;
  email?: string;
}

const codec = new ProtobufCodec<User>(UserType);

// Serialize
const user = { id: 123, name: "Alice" };
const buffer = codec.serialize(user);

// Deserialize
const decoded = codec.deserialize(buffer);
console.log(decoded); // { id: 123, name: 'Alice' }
```

### Loading from .proto File

```ts
import { createCodecFromProto } from "@procwire/codec-protobuf";

interface User {
  id: number;
  name: string;
}

const codec = await createCodecFromProto<User>("./schemas/user.proto", "myapp.User");

const buffer = codec.serialize({ id: 1, name: "Alice" });
const user = codec.deserialize(buffer);
```

### From JSON Schema

```ts
import { createCodecFromJSON } from "@procwire/codec-protobuf";

interface User {
  id: number;
  name: string;
}

const codec = createCodecFromJSON<User>(
  {
    nested: {
      User: {
        fields: {
          id: { type: "int32", id: 1 },
          name: { type: "string", id: 2 },
        },
      },
    },
  },
  "User",
);
```

## Configuration Options

### ProtobufCodecOptions

| Option              | Type               | Default     | Description                        |
| ------------------- | ------------------ | ----------- | ---------------------------------- |
| `longs`             | `String \| Number` | `String`    | How to convert int64/uint64 values |
| `enums`             | `String`           | `undefined` | Convert enums to string names      |
| `bytes`             | `String \| Array`  | `undefined` | Convert bytes fields format        |
| `defaults`          | `boolean`          | `false`     | Include default values in output   |
| `oneofs`            | `boolean`          | `false`     | Include oneof field names          |
| `verifyOnSerialize` | `boolean`          | `true`      | Verify message before encoding     |

### Handling Large Integers (int64)

Protocol Buffers int64/uint64 can exceed JavaScript's `Number.MAX_SAFE_INTEGER`. By default, these are converted to strings to preserve precision:

```ts
const codec = new ProtobufCodec<{ timestamp: string }>(TimestampType, {
  longs: String, // Default - safe for large values
});

const output = codec.deserialize(buffer);
console.log(typeof output.timestamp); // 'string'
console.log(output.timestamp); // '9007199254740993'
```

For small values where precision isn't a concern:

```ts
const codec = new ProtobufCodec<{ timestamp: number }>(TimestampType, {
  longs: Number, // May lose precision for large values
});
```

### Enum Conversion

```ts
const codec = new ProtobufCodec<{ status: string }>(MessageType, {
  enums: String, // Convert enum values to their names
});

// With enums: String
console.log(output.status); // 'ACTIVE'

// Without (default)
console.log(output.status); // 1
```

### Bytes Field Handling

```ts
// Default: Uint8Array
const codec1 = new ProtobufCodec<{ data: Uint8Array }>(MessageType);

// Base64 string
const codec2 = new ProtobufCodec<{ data: string }>(MessageType, {
  bytes: String,
});

// Number array
const codec3 = new ProtobufCodec<{ data: number[] }>(MessageType, {
  bytes: Array,
});
```

## API Reference

### ProtobufCodec<T>

Main codec class implementing `SerializationCodec<T>`.

```ts
class ProtobufCodec<T> implements SerializationCodec<T> {
  readonly name: "protobuf";
  readonly contentType: "application/x-protobuf";

  constructor(messageType: Type, options?: ProtobufCodecOptions);

  get type(): Type;

  serialize(value: T): Buffer;
  deserialize(buffer: Buffer): T;
}
```

#### Properties

- `name` - Always `"protobuf"`
- `contentType` - Always `"application/x-protobuf"`
- `type` - The protobufjs Type instance (getter)

#### Methods

##### `serialize(value: T): Buffer`

Serializes a value to Protocol Buffers binary format.

- **value** - Value to serialize (must match message schema)
- **Returns** - Buffer containing protobuf-encoded data
- **Throws** - `SerializationError` if verification fails or encoding errors occur

##### `deserialize(buffer: Buffer): T`

Deserializes Protocol Buffers binary data.

- **buffer** - Buffer or Uint8Array containing protobuf data
- **Returns** - Deserialized plain JavaScript object
- **Throws** - `SerializationError` if input is invalid or decoding fails

### createCodecFromProto<T>()

Creates a codec by loading a .proto file.

```ts
async function createCodecFromProto<T>(
  protoPath: string,
  messageName: string,
  options?: ProtobufCodecOptions,
): Promise<ProtobufCodec<T>>;
```

### createCodecFromJSON<T>()

Creates a codec from an inline JSON schema.

```ts
function createCodecFromJSON<T>(
  schema: INamespace,
  messageName: string,
  options?: ProtobufCodecOptions,
): ProtobufCodec<T>;
```

## Advanced Usage

### Nested Messages

```ts
const root = protobuf.Root.fromJSON({
  nested: {
    Address: {
      fields: {
        street: { type: "string", id: 1 },
        city: { type: "string", id: 2 },
      },
    },
    Person: {
      fields: {
        name: { type: "string", id: 1 },
        address: { type: "Address", id: 2 },
      },
    },
  },
});

interface Address {
  street: string;
  city: string;
}

interface Person {
  name: string;
  address: Address;
}

const codec = new ProtobufCodec<Person>(root.lookupType("Person"));
```

### Repeated Fields

```ts
const root = protobuf.Root.fromJSON({
  nested: {
    Message: {
      fields: {
        id: { type: "int32", id: 1 },
        tags: { type: "string", id: 2, rule: "repeated" },
      },
    },
  },
});

interface Message {
  id: number;
  tags: string[];
}

const codec = new ProtobufCodec<Message>(root.lookupType("Message"));
```

### Oneof Fields

```ts
const root = protobuf.Root.fromJSON({
  nested: {
    Message: {
      oneofs: {
        value: { oneof: ["stringValue", "intValue"] },
      },
      fields: {
        stringValue: { type: "string", id: 1 },
        intValue: { type: "int32", id: 2 },
      },
    },
  },
});

interface Message {
  stringValue?: string;
  intValue?: number;
  value?: "stringValue" | "intValue"; // When oneofs: true
}

const codec = new ProtobufCodec<Message>(root.lookupType("Message"), {
  oneofs: true, // Include virtual oneof field
});
```

### Maps

```ts
const root = protobuf.Root.fromJSON({
  nested: {
    Message: {
      fields: {
        metadata: { keyType: "string", type: "string", id: 1 },
      },
    },
  },
});

interface Message {
  metadata: Record<string, string>;
}

const codec = new ProtobufCodec<Message>(root.lookupType("Message"));
```

### Schema Evolution

Protocol Buffers supports backward-compatible schema changes:

```protobuf
// Version 1
message User {
  int32 id = 1;
  string name = 2;
}

// Version 2 (backward compatible)
message User {
  int32 id = 1;
  string name = 2;
  string email = 3;  // New optional field
}
```

Old clients can read messages from new servers and vice versa.

### Performance Tuning

For maximum performance in trusted environments:

```ts
const fastCodec = new ProtobufCodec<TrustedData>(MessageType, {
  verifyOnSerialize: false, // Skip verification
  defaults: false, // Don't include defaults
  oneofs: false, // Don't include oneof names
});
```

For maximum compatibility:

```ts
const safeCodec = new ProtobufCodec<AnyData>(MessageType, {
  verifyOnSerialize: true, // Verify before encoding
  defaults: true, // Include all fields
  longs: String, // Safe large integer handling
  enums: String, // Human-readable enums
});
```

## Error Handling

The codec throws `SerializationError` from `@procwire/transport` for all serialization failures:

```ts
import { SerializationError } from "@procwire/transport";

try {
  const decoded = codec.deserialize(invalidBuffer);
} catch (error) {
  if (error instanceof SerializationError) {
    console.error("Serialization failed:", error.message);
    console.error("Original error:", error.cause);
  }
}
```

Common error scenarios:

- Invalid input type (not Buffer/Uint8Array)
- Truncated or corrupted buffer
- Schema verification failure (when `verifyOnSerialize: true`)
- Field type mismatches

## Type Safety Tips

1. **Define interfaces matching your schema**:

```ts
interface User {
  id: number;
  name: string;
  timestamp: string; // Use string for int64 with longs: String
}

const codec = new ProtobufCodec<User>(UserType, { longs: String });
```

2. **Match TypeScript types to options**:

```ts
// With bytes: String
interface Message {
  data: string;
} // Base64

// With bytes: Array
interface Message {
  data: number[];
}

// Default
interface Message {
  data: Uint8Array;
}
```

3. **Use the `type` getter for reflection**:

```ts
const codec = new ProtobufCodec<User>(UserType);
const fields = codec.type.fields; // Access schema info
```

## Performance

Protocol Buffers provides excellent performance characteristics:

- **Compact Size**: Typically 3-10x smaller than JSON
- **Fast Encoding/Decoding**: More efficient than JSON parsing
- **Zero-Copy Optimization**: Serialize without extra buffer copies
- **Schema Evolution**: Forward and backward compatible

Ideal for:

- High-performance microservices communication
- Large data transfers
- Long-term data storage
- Cross-platform/cross-language IPC
- APIs with versioned schemas

## License

MIT
