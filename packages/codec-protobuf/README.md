# @procwire/codec-protobuf

Protocol Buffers serialization codec for `@procwire/transport`.

Provides type-safe binary serialization using [protobufjs](https://github.com/protobufjs/protobuf.js) with schema validation and automatic error handling.

## Installation

```bash
npm install @procwire/codec-protobuf protobufjs
```

Note: `protobufjs` is a peer dependency and must be installed separately.

## Usage

### Basic Usage

```ts
import * as protobuf from 'protobufjs';
import { ProtobufCodec } from '@procwire/codec-protobuf';
import { ChannelBuilder } from '@procwire/transport';

// Define your schema
const root = protobuf.Root.fromJSON({
  nested: {
    User: {
      fields: {
        id: { type: 'int32', id: 1 },
        name: { type: 'string', id: 2 },
        email: { type: 'string', id: 3, rule: 'optional' }
      }
    }
  }
});

const UserType = root.lookupType('User');

// Create typed codec
interface User {
  id: number;
  name: string;
  email?: string;
}

const codec = new ProtobufCodec<User>(UserType);

// Use with ChannelBuilder
const channel = new ChannelBuilder()
  .withTransport(transport)
  .withFraming(framing)
  .withSerialization(codec)
  .withProtocol(protocol)
  .build();
```

### Loading Schema from .proto Files

```ts
import * as protobuf from 'protobufjs';
import { ProtobufCodec } from '@procwire/codec-protobuf';

// Load from .proto file
const root = await protobuf.load('path/to/schema.proto');
const MessageType = root.lookupType('package.MessageName');

const codec = new ProtobufCodec<YourType>(MessageType);
```

### Standalone Usage

```ts
import * as protobuf from 'protobufjs';
import { ProtobufCodec } from '@procwire/codec-protobuf';

const root = protobuf.Root.fromJSON({
  nested: {
    User: {
      fields: {
        id: { type: 'int32', id: 1 },
        name: { type: 'string', id: 2 }
      }
    }
  }
});

const UserType = root.lookupType('User');
const codec = new ProtobufCodec(UserType);

// Serialize
const user = { id: 123, name: 'Alice' };
const buffer = codec.serialize(user);

// Deserialize
const decoded = codec.deserialize(buffer);
console.log(decoded); // { id: 123, name: 'Alice' }
```

## Features

- **Type-Safe**: Full TypeScript support with generic type parameter `ProtobufCodec<T>`
- **Schema Validation**: Automatic validation against protobuf schema during serialization/deserialization
- **Compact Binary**: Highly efficient binary format with smaller payloads than JSON
- **Plain Objects**: Returns plain JavaScript objects (not protobuf Message instances)
- **Error Handling**: Wraps encoding/decoding errors in `SerializationError` from `@procwire/transport`
- **Forward/Backward Compatible**: Protobuf's wire format supports schema evolution

## API

### `ProtobufCodec<T>`

Implements `SerializationCodec<T>` interface.

#### Type Parameters

- `T` - The TypeScript type corresponding to your protobuf message schema

#### Properties

- `name: "protobuf"` - Codec identifier
- `contentType: "application/x-protobuf"` - MIME type

#### Constructor

```ts
constructor(messageType: protobuf.Type)
```

**Parameters:**
- `messageType` - The protobufjs `Type` instance defining the message schema

#### Methods

##### `serialize(value: T): Buffer`

Serializes a value to Protocol Buffers binary format.

**Parameters:**
- `value` - Value to serialize (must match the message schema)

**Returns:** `Buffer` containing protobuf-encoded data

**Throws:** `SerializationError` if encoding fails or value doesn't match schema

##### `deserialize(buffer: Buffer): T`

Deserializes Protocol Buffers binary data to a typed JavaScript object.

**Parameters:**
- `buffer` - Buffer containing protobuf-encoded data

**Returns:** Deserialized plain JavaScript object

**Throws:** `SerializationError` if decoding fails or data doesn't match schema

## Advanced Usage

### Nested Messages

```ts
const root = protobuf.Root.fromJSON({
  nested: {
    Address: {
      fields: {
        street: { type: 'string', id: 1 },
        city: { type: 'string', id: 2 }
      }
    },
    Person: {
      fields: {
        name: { type: 'string', id: 1 },
        address: { type: 'Address', id: 2 }
      }
    }
  }
});

interface Address {
  street: string;
  city: string;
}

interface Person {
  name: string;
  address: Address;
}

const PersonType = root.lookupType('Person');
const codec = new ProtobufCodec<Person>(PersonType);
```

### Repeated Fields (Arrays)

```ts
const root = protobuf.Root.fromJSON({
  nested: {
    Message: {
      fields: {
        id: { type: 'int32', id: 1 },
        tags: { type: 'string', id: 2, rule: 'repeated' }
      }
    }
  }
});

interface Message {
  id: number;
  tags: string[];
}

const MessageType = root.lookupType('Message');
const codec = new ProtobufCodec<Message>(MessageType);
```

## Performance

Protocol Buffers provides excellent performance characteristics:

- **Compact Size**: Typically 3-10x smaller than JSON
- **Fast Encoding/Decoding**: More efficient than JSON parsing
- **Schema Evolution**: Forward and backward compatible with schema changes
- **Type Safety**: Compile-time type checking with TypeScript

Ideal for:
- High-performance microservices communication
- Large data transfers
- Long-term data storage
- Cross-platform/cross-language IPC
- APIs with versioned schemas

## Schema Evolution

Protocol Buffers supports schema evolution through field numbering:

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

Old clients can still read messages from new servers and vice versa.

## License

MIT
