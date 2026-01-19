---
editUrl: false
next: false
prev: false
title: "ProtobufCodec"
---

Defined in: [codec-protobuf/src/index.ts:47](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/codec-protobuf/src/index.ts#L47)

Protocol Buffers serialization codec.
Implements type-safe binary serialization with schema validation.

## Example

```ts
import * as protobuf from 'protobufjs';
import { ProtobufCodec } from '@procwire/codec-protobuf';
import { ChannelBuilder } from '@procwire/transport';

// Define schema
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

// Create codec
const codec = new ProtobufCodec<User>(UserType);

// Use with channel
const channel = new ChannelBuilder()
  .withSerialization(codec)
  // ... other configuration
  .build();
```

## Type Parameters

### T

`T`

The TypeScript type corresponding to the protobuf message

## Implements

- [`SerializationCodec`](/api/transport/interfaces/serializationcodec/)\<`T`\>

## Constructors

### Constructor

> **new ProtobufCodec**\<`T`\>(`messageType`): `ProtobufCodec`\<`T`\>

Defined in: [codec-protobuf/src/index.ts:56](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/codec-protobuf/src/index.ts#L56)

Creates a new ProtobufCodec instance.

#### Parameters

##### messageType

`Type`

The protobufjs Type instance defining the message schema

#### Returns

`ProtobufCodec`\<`T`\>

## Properties

### contentType

> `readonly` **contentType**: `"application/x-protobuf"` = `"application/x-protobuf"`

Defined in: [codec-protobuf/src/index.ts:49](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/codec-protobuf/src/index.ts#L49)

Content type identifier (e.g., 'application/json', 'application/msgpack').

#### Implementation of

[`SerializationCodec`](/api/transport/interfaces/serializationcodec/).[`contentType`](/api/transport/interfaces/serializationcodec/#contenttype)

***

### name

> `readonly` **name**: `"protobuf"` = `"protobuf"`

Defined in: [codec-protobuf/src/index.ts:48](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/codec-protobuf/src/index.ts#L48)

Codec name (e.g., 'json', 'msgpack', 'protobuf').

#### Implementation of

[`SerializationCodec`](/api/transport/interfaces/serializationcodec/).[`name`](/api/transport/interfaces/serializationcodec/#name)

## Methods

### deserialize()

> **deserialize**(`buffer`): `T`

Defined in: [codec-protobuf/src/index.ts:85](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/codec-protobuf/src/index.ts#L85)

Deserializes Protocol Buffers binary data to a typed JavaScript object.

#### Parameters

##### buffer

`Buffer`

Buffer containing protobuf-encoded data

#### Returns

`T`

Deserialized plain JavaScript object

#### Throws

if decoding fails or data doesn't match schema

#### Implementation of

[`SerializationCodec`](/api/transport/interfaces/serializationcodec/).[`deserialize`](/api/transport/interfaces/serializationcodec/#deserialize)

***

### serialize()

> **serialize**(`value`): `Buffer`

Defined in: [codec-protobuf/src/index.ts:65](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/codec-protobuf/src/index.ts#L65)

Serializes a value to Protocol Buffers binary format.

#### Parameters

##### value

`T`

Value to serialize (must match the message schema)

#### Returns

`Buffer`

Buffer containing protobuf-encoded data

#### Throws

if encoding fails or value doesn't match schema

#### Implementation of

[`SerializationCodec`](/api/transport/interfaces/serializationcodec/).[`serialize`](/api/transport/interfaces/serializationcodec/#serialize)
