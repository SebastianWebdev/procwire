---
editUrl: false
next: false
prev: false
title: "JsonCodec"
---

Defined in: [transport/src/serialization/json.ts:47](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/json.ts#L47)

JSON serialization codec with zero dependencies.

Converts objects to/from UTF-8 encoded JSON buffers.
Supports custom replacer/reviver functions for advanced serialization logic.

## Examples

```ts
const codec = new JsonCodec();
const buffer = codec.serialize({ foo: 'bar' });
const obj = codec.deserialize(buffer);
```

```ts
const codec = new JsonCodec({
  replacer: (key, value) => key === 'password' ? undefined : value
});
```

## Type Parameters

### T

`T` = `unknown`

## Implements

- [`SerializationCodec`](/api/transport/interfaces/serializationcodec/)\<`T`\>

## Constructors

### Constructor

> **new JsonCodec**\<`T`\>(`options`): `JsonCodec`\<`T`\>

Defined in: [transport/src/serialization/json.ts:55](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/json.ts#L55)

#### Parameters

##### options

[`JsonCodecOptions`](/api/transport/interfaces/jsoncodecoptions/) = `{}`

#### Returns

`JsonCodec`\<`T`\>

## Properties

### contentType

> `readonly` **contentType**: `"application/json"` = `"application/json"`

Defined in: [transport/src/serialization/json.ts:49](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/json.ts#L49)

Content type identifier (e.g., 'application/json', 'application/msgpack').

#### Implementation of

[`SerializationCodec`](/api/transport/interfaces/serializationcodec/).[`contentType`](/api/transport/interfaces/serializationcodec/#contenttype)

***

### name

> `readonly` **name**: `"json"` = `"json"`

Defined in: [transport/src/serialization/json.ts:48](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/json.ts#L48)

Codec name (e.g., 'json', 'msgpack', 'protobuf').

#### Implementation of

[`SerializationCodec`](/api/transport/interfaces/serializationcodec/).[`name`](/api/transport/interfaces/serializationcodec/#name)

## Methods

### deserialize()

> **deserialize**(`buffer`): `T`

Defined in: [transport/src/serialization/json.ts:87](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/json.ts#L87)

Deserializes a UTF-8 encoded JSON buffer to a value.

#### Parameters

##### buffer

`Buffer`

Buffer containing UTF-8 encoded JSON

#### Returns

`T`

Deserialized value

#### Throws

if JSON.parse fails

#### Implementation of

[`SerializationCodec`](/api/transport/interfaces/serializationcodec/).[`deserialize`](/api/transport/interfaces/serializationcodec/#deserialize)

***

### serialize()

> **serialize**(`value`): `Buffer`

Defined in: [transport/src/serialization/json.ts:68](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/json.ts#L68)

Serializes a value to a UTF-8 encoded JSON buffer.

#### Parameters

##### value

`T`

Value to serialize

#### Returns

`Buffer`

Buffer containing UTF-8 encoded JSON

#### Throws

if JSON.stringify fails

#### Implementation of

[`SerializationCodec`](/api/transport/interfaces/serializationcodec/).[`serialize`](/api/transport/interfaces/serializationcodec/#serialize)
