---
editUrl: false
next: false
prev: false
title: "RawCodec"
---

Defined in: [transport/src/serialization/raw.ts:21](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/raw.ts#L21)

Raw binary passthrough codec (zero-copy).

Performs no serialization - simply passes Buffer instances through unchanged.
Useful for binary protocols or when pre-serialized data is available.

**Important**: This codec does not copy buffers. Mutations to the returned
buffer will affect the original data. If you need isolation, copy the buffer
yourself using `Buffer.from(buffer)`.

## Example

```ts
const codec = new RawCodec();
const buffer = Buffer.from([1, 2, 3]);
const serialized = codec.serialize(buffer);
console.log(serialized === buffer); // true (no copy)
```

## Implements

- [`SerializationCodec`](/api/transport/src/interfaces/serializationcodec/)\<`Buffer`\>

## Constructors

### Constructor

> **new RawCodec**(): `RawCodec`

#### Returns

`RawCodec`

## Properties

### contentType

> `readonly` **contentType**: `"application/octet-stream"` = `"application/octet-stream"`

Defined in: [transport/src/serialization/raw.ts:23](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/raw.ts#L23)

Content type identifier (e.g., 'application/json', 'application/msgpack').

#### Implementation of

[`SerializationCodec`](/api/transport/src/interfaces/serializationcodec/).[`contentType`](/api/transport/src/interfaces/serializationcodec/#contenttype)

***

### name

> `readonly` **name**: `"raw"` = `"raw"`

Defined in: [transport/src/serialization/raw.ts:22](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/raw.ts#L22)

Codec name (e.g., 'json', 'msgpack', 'protobuf').

#### Implementation of

[`SerializationCodec`](/api/transport/src/interfaces/serializationcodec/).[`name`](/api/transport/src/interfaces/serializationcodec/#name)

## Methods

### deserialize()

> **deserialize**(`buffer`): `Buffer`

Defined in: [transport/src/serialization/raw.ts:41](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/raw.ts#L41)

Returns the buffer unchanged (passthrough, no copy).

#### Parameters

##### buffer

`Buffer`

Buffer to deserialize

#### Returns

`Buffer`

The same buffer instance

#### Implementation of

[`SerializationCodec`](/api/transport/src/interfaces/serializationcodec/).[`deserialize`](/api/transport/src/interfaces/serializationcodec/#deserialize)

***

### serialize()

> **serialize**(`value`): `Buffer`

Defined in: [transport/src/serialization/raw.ts:31](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/raw.ts#L31)

Returns the buffer unchanged (passthrough, no copy).

#### Parameters

##### value

`Buffer`

Buffer to serialize

#### Returns

`Buffer`

The same buffer instance

#### Implementation of

[`SerializationCodec`](/api/transport/src/interfaces/serializationcodec/).[`serialize`](/api/transport/src/interfaces/serializationcodec/#serialize)
