---
editUrl: false
next: false
prev: false
title: "MessagePackCodec"
---

Defined in: [codec-msgpack/src/index.ts:27](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/codec-msgpack/src/index.ts#L27)

MessagePack serialization codec.
Implements efficient binary serialization with support for various JavaScript types.

## Example

```ts
import { MessagePackCodec } from '@procwire/codec-msgpack';
import { ChannelBuilder } from '@procwire/transport';

const channel = new ChannelBuilder()
  .withSerialization(new MessagePackCodec())
  // ... other configuration
  .build();
```

## Implements

- [`SerializationCodec`](/api/transport/interfaces/serializationcodec/)\<`unknown`\>

## Constructors

### Constructor

> **new MessagePackCodec**(): `MessagePackCodec`

#### Returns

`MessagePackCodec`

## Properties

### contentType

> `readonly` **contentType**: `"application/x-msgpack"` = `"application/x-msgpack"`

Defined in: [codec-msgpack/src/index.ts:29](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/codec-msgpack/src/index.ts#L29)

Content type identifier (e.g., 'application/json', 'application/msgpack').

#### Implementation of

[`SerializationCodec`](/api/transport/interfaces/serializationcodec/).[`contentType`](/api/transport/interfaces/serializationcodec/#contenttype)

***

### name

> `readonly` **name**: `"msgpack"` = `"msgpack"`

Defined in: [codec-msgpack/src/index.ts:28](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/codec-msgpack/src/index.ts#L28)

Codec name (e.g., 'json', 'msgpack', 'protobuf').

#### Implementation of

[`SerializationCodec`](/api/transport/interfaces/serializationcodec/).[`name`](/api/transport/interfaces/serializationcodec/#name)

## Methods

### deserialize()

> **deserialize**(`buffer`): `unknown`

Defined in: [codec-msgpack/src/index.ts:58](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/codec-msgpack/src/index.ts#L58)

Deserializes MessagePack binary data to a JavaScript value.

#### Parameters

##### buffer

`Buffer`

Buffer containing MessagePack-encoded data

#### Returns

`unknown`

Deserialized value

#### Throws

if decoding fails

#### Implementation of

[`SerializationCodec`](/api/transport/interfaces/serializationcodec/).[`deserialize`](/api/transport/interfaces/serializationcodec/#deserialize)

***

### serialize()

> **serialize**(`value`): `Buffer`

Defined in: [codec-msgpack/src/index.ts:38](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/codec-msgpack/src/index.ts#L38)

Serializes a value to MessagePack binary format.

#### Parameters

##### value

`unknown`

Value to serialize

#### Returns

`Buffer`

Buffer containing MessagePack-encoded data

#### Throws

if encoding fails

#### Implementation of

[`SerializationCodec`](/api/transport/interfaces/serializationcodec/).[`serialize`](/api/transport/interfaces/serializationcodec/#serialize)
