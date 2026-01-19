---
editUrl: false
next: false
prev: false
title: "FramingCodec"
---

Defined in: [transport/src/framing/types.ts:5](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/types.ts#L5)

Framing codec interface for message boundary detection in byte streams.
Implementations: line-delimited, length-prefixed, etc.

## Methods

### decode()

> **decode**(`chunk`): `Buffer`\<`ArrayBufferLike`\>[]

Defined in: [transport/src/framing/types.ts:20](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/types.ts#L20)

Decodes incoming chunk and extracts complete messages.
May buffer partial data internally.

#### Parameters

##### chunk

`Buffer`

Incoming data chunk

#### Returns

`Buffer`\<`ArrayBufferLike`\>[]

Array of complete message payloads (may be empty if buffering)

***

### encode()

> **encode**(`payload`): `Buffer`

Defined in: [transport/src/framing/types.ts:11](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/types.ts#L11)

Encodes a message payload into a framed buffer.

#### Parameters

##### payload

`Buffer`

Raw message data

#### Returns

`Buffer`

Framed buffer ready for transmission

***

### getBufferSize()

> **getBufferSize**(): `number`

Defined in: [transport/src/framing/types.ts:37](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/types.ts#L37)

Returns current buffer size (bytes).
Useful for monitoring and debugging.

#### Returns

`number`

***

### hasBufferedData()

> **hasBufferedData**(): `boolean`

Defined in: [transport/src/framing/types.ts:31](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/types.ts#L31)

Returns true if decoder has buffered partial data.

#### Returns

`boolean`

***

### reset()

> **reset**(): `void`

Defined in: [transport/src/framing/types.ts:26](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/types.ts#L26)

Resets internal decoder state and clears buffers.
Used for error recovery or connection restart.

#### Returns

`void`
