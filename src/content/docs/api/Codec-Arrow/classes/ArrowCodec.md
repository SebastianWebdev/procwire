---
editUrl: false
next: false
prev: false
title: "ArrowCodec"
---

Defined in: [codec-arrow/src/index.ts:41](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/codec-arrow/src/index.ts#L41)

Apache Arrow serialization codec.
Implements efficient columnar data serialization ideal for analytical workloads.

## Example

```ts
import { tableFromArrays } from 'apache-arrow';
import { ArrowCodec } from '@procwire/codec-arrow';
import { ChannelBuilder } from '@procwire/transport';

const codec = new ArrowCodec();

// Create a table
const table = tableFromArrays({
  id: [1, 2, 3],
  name: ['Alice', 'Bob', 'Charlie']
});

// Use with channel
const channel = new ChannelBuilder()
  .withSerialization(codec)
  // ... other configuration
  .build();

// Send table over channel
await channel.request('process', table);
```

## Implements

- [`SerializationCodec`](/api/transport/interfaces/serializationcodec/)\<`Table`\>

## Constructors

### Constructor

> **new ArrowCodec**(): `ArrowCodec`

#### Returns

`ArrowCodec`

## Properties

### contentType

> `readonly` **contentType**: `"application/vnd.apache.arrow.stream"` = `"application/vnd.apache.arrow.stream"`

Defined in: [codec-arrow/src/index.ts:43](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/codec-arrow/src/index.ts#L43)

Content type identifier (e.g., 'application/json', 'application/msgpack').

#### Implementation of

[`SerializationCodec`](/api/transport/interfaces/serializationcodec/).[`contentType`](/api/transport/interfaces/serializationcodec/#contenttype)

***

### name

> `readonly` **name**: `"arrow"` = `"arrow"`

Defined in: [codec-arrow/src/index.ts:42](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/codec-arrow/src/index.ts#L42)

Codec name (e.g., 'json', 'msgpack', 'protobuf').

#### Implementation of

[`SerializationCodec`](/api/transport/interfaces/serializationcodec/).[`name`](/api/transport/interfaces/serializationcodec/#name)

## Methods

### deserialize()

> **deserialize**(`buffer`): `Table`

Defined in: [codec-arrow/src/index.ts:71](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/codec-arrow/src/index.ts#L71)

Deserializes Arrow IPC stream data to an Apache Arrow Table.

#### Parameters

##### buffer

`Buffer`

Buffer containing Arrow IPC stream data

#### Returns

`Table`

Deserialized Arrow Table

#### Throws

if decoding fails

#### Implementation of

[`SerializationCodec`](/api/transport/interfaces/serializationcodec/).[`deserialize`](/api/transport/interfaces/serializationcodec/#deserialize)

***

### serialize()

> **serialize**(`value`): `Buffer`

Defined in: [codec-arrow/src/index.ts:52](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/codec-arrow/src/index.ts#L52)

Serializes an Apache Arrow Table to IPC stream format.

#### Parameters

##### value

`Table`

Arrow Table to serialize

#### Returns

`Buffer`

Buffer containing Arrow IPC stream data

#### Throws

if encoding fails

#### Implementation of

[`SerializationCodec`](/api/transport/interfaces/serializationcodec/).[`serialize`](/api/transport/interfaces/serializationcodec/#serialize)
