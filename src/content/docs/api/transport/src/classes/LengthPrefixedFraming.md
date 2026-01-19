---
editUrl: false
next: false
prev: false
title: "LengthPrefixedFraming"
---

Defined in: [transport/src/framing/length-prefixed.ts:30](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/length-prefixed.ts#L30)

Length-prefixed framing codec.
Format: [4-byte length (uint32 BE)][payload]

Each frame starts with a 4-byte big-endian unsigned integer
indicating the payload length, followed by the payload itself.

Handles partial headers, partial payloads, and multiple frames per chunk.
Supports zero-length frames.

## Example

```ts
const framing = new LengthPrefixedFraming();
const encoded = framing.encode(Buffer.from('hello')); // [0,0,0,5,'h','e','l','l','o']
const frames = framing.decode(encoded); // [Buffer<'hello'>]
```

## Implements

- [`FramingCodec`](/api/transport/src/interfaces/framingcodec/)

## Constructors

### Constructor

> **new LengthPrefixedFraming**(`options`): `LengthPrefixedFraming`

Defined in: [transport/src/framing/length-prefixed.ts:37](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/length-prefixed.ts#L37)

#### Parameters

##### options

[`LengthPrefixedFramingOptions`](/api/transport/src/interfaces/lengthprefixedframingoptions/) = `{}`

#### Returns

`LengthPrefixedFraming`

## Methods

### decode()

> **decode**(`chunk`): `Buffer`\<`ArrayBufferLike`\>[]

Defined in: [transport/src/framing/length-prefixed.ts:56](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/length-prefixed.ts#L56)

Decodes incoming chunk and extracts complete frames.
Buffers partial headers and payloads.

#### Parameters

##### chunk

`Buffer`

#### Returns

`Buffer`\<`ArrayBufferLike`\>[]

#### Implementation of

[`FramingCodec`](/api/transport/src/interfaces/framingcodec/).[`decode`](/api/transport/src/interfaces/framingcodec/#decode)

***

### encode()

> **encode**(`payload`): `Buffer`

Defined in: [transport/src/framing/length-prefixed.ts:46](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/length-prefixed.ts#L46)

Encodes a payload with length prefix.

#### Parameters

##### payload

`Buffer`

#### Returns

`Buffer`

#### Implementation of

[`FramingCodec`](/api/transport/src/interfaces/framingcodec/).[`encode`](/api/transport/src/interfaces/framingcodec/#encode)

***

### getBufferSize()

> **getBufferSize**(): `number`

Defined in: [transport/src/framing/length-prefixed.ts:132](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/length-prefixed.ts#L132)

Returns current buffer size in bytes.

#### Returns

`number`

#### Implementation of

[`FramingCodec`](/api/transport/src/interfaces/framingcodec/).[`getBufferSize`](/api/transport/src/interfaces/framingcodec/#getbuffersize)

***

### hasBufferedData()

> **hasBufferedData**(): `boolean`

Defined in: [transport/src/framing/length-prefixed.ts:125](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/length-prefixed.ts#L125)

Returns true if there is buffered partial data.

#### Returns

`boolean`

#### Implementation of

[`FramingCodec`](/api/transport/src/interfaces/framingcodec/).[`hasBufferedData`](/api/transport/src/interfaces/framingcodec/#hasbuffereddata)

***

### reset()

> **reset**(): `void`

Defined in: [transport/src/framing/length-prefixed.ts:117](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/length-prefixed.ts#L117)

Resets internal buffer state.

#### Returns

`void`

#### Implementation of

[`FramingCodec`](/api/transport/src/interfaces/framingcodec/).[`reset`](/api/transport/src/interfaces/framingcodec/#reset)
