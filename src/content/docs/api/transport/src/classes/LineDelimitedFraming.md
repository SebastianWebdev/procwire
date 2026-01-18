---
editUrl: false
next: false
prev: false
title: "LineDelimitedFraming"
---

Defined in: [transport/src/framing/line-delimited.ts:37](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/line-delimited.ts#L37)

Line-delimited framing codec.
Format: {payload}{delimiter}

Each frame is terminated by a delimiter byte (default newline).
Handles partial chunks and multiple frames per chunk.

## Example

```ts
const framing = new LineDelimitedFraming();
const encoded = framing.encode(Buffer.from('hello')); // Buffer<'hello\n'>
const frames = framing.decode(Buffer.from('world\n')); // [Buffer<'world'>]
```

## Implements

- [`FramingCodec`](/api/transport/src/interfaces/framingcodec/)

## Constructors

### Constructor

> **new LineDelimitedFraming**(`options`): `LineDelimitedFraming`

Defined in: [transport/src/framing/line-delimited.ts:43](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/line-delimited.ts#L43)

#### Parameters

##### options

[`LineDelimitedFramingOptions`](/api/transport/src/interfaces/linedelimitedframingoptions/) = `{}`

#### Returns

`LineDelimitedFraming`

## Methods

### decode()

> **decode**(`chunk`): `Buffer`\<`ArrayBufferLike`\>[]

Defined in: [transport/src/framing/line-delimited.ts:71](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/line-delimited.ts#L71)

Decodes incoming chunk and extracts complete frames.
Buffers partial data until delimiter is found.

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

Defined in: [transport/src/framing/line-delimited.ts:54](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/line-delimited.ts#L54)

Encodes a payload with delimiter.
If payload already ends with delimiter, does not add another one.

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

Defined in: [transport/src/framing/line-delimited.ts:130](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/line-delimited.ts#L130)

Returns current buffer size in bytes.

#### Returns

`number`

#### Implementation of

[`FramingCodec`](/api/transport/src/interfaces/framingcodec/).[`getBufferSize`](/api/transport/src/interfaces/framingcodec/#getbuffersize)

***

### hasBufferedData()

> **hasBufferedData**(): `boolean`

Defined in: [transport/src/framing/line-delimited.ts:123](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/line-delimited.ts#L123)

Returns true if there is buffered partial data.

#### Returns

`boolean`

#### Implementation of

[`FramingCodec`](/api/transport/src/interfaces/framingcodec/).[`hasBufferedData`](/api/transport/src/interfaces/framingcodec/#hasbuffereddata)

***

### reset()

> **reset**(): `void`

Defined in: [transport/src/framing/line-delimited.ts:116](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/line-delimited.ts#L116)

Resets internal buffer state.

#### Returns

`void`

#### Implementation of

[`FramingCodec`](/api/transport/src/interfaces/framingcodec/).[`reset`](/api/transport/src/interfaces/framingcodec/#reset)
