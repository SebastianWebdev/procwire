---
editUrl: false
next: false
prev: false
title: "SerializationCodec"
---

Defined in: [transport/src/serialization/types.ts:7](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/types.ts#L7)

Serialization codec interface for converting between objects and binary data.
Implementations: JSON, MessagePack, Protocol Buffers, Apache Arrow.

## Type Parameters

### T

`T` = `unknown`

Type of objects being serialized/deserialized

## Properties

### contentType

> `readonly` **contentType**: `string`

Defined in: [transport/src/serialization/types.ts:16](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/types.ts#L16)

Content type identifier (e.g., 'application/json', 'application/msgpack').

***

### name

> `readonly` **name**: `string`

Defined in: [transport/src/serialization/types.ts:11](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/types.ts#L11)

Codec name (e.g., 'json', 'msgpack', 'protobuf').

## Methods

### deserialize()

> **deserialize**(`buffer`): `T`

Defined in: [transport/src/serialization/types.ts:28](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/types.ts#L28)

Deserializes binary buffer to object.

#### Parameters

##### buffer

`Buffer`

#### Returns

`T`

#### Throws

if deserialization fails

***

### serialize()

> **serialize**(`data`): `Buffer`

Defined in: [transport/src/serialization/types.ts:22](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/types.ts#L22)

Serializes object to binary buffer.

#### Parameters

##### data

`T`

#### Returns

`Buffer`

#### Throws

if serialization fails
