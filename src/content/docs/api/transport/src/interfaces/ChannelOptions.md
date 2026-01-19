---
editUrl: false
next: false
prev: false
title: "ChannelOptions"
---

Defined in: [transport/src/channel/types.ts:107](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L107)

Channel options for configuration.

## Type Parameters

### TReq

`TReq` = `unknown`

Request data type

### TRes

`TRes` = `unknown`

Response data type

### TNotif

`TNotif` = `unknown`

Notification data type

## Properties

### framing

> **framing**: [`FramingCodec`](/api/transport/src/interfaces/framingcodec/)

Defined in: [transport/src/channel/types.ts:116](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L116)

Framing codec for message boundaries.

***

### maxInboundFrames?

> `optional` **maxInboundFrames**: `number`

Defined in: [transport/src/channel/types.ts:147](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L147)

Maximum number of inbound frames to buffer before backpressure (optional).

***

### middleware?

> `optional` **middleware**: [`ChannelMiddleware`](/api/transport/src/interfaces/channelmiddleware/)[]

Defined in: [transport/src/channel/types.ts:142](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L142)

Middleware hooks for logging, metrics, debugging.

***

### protocol

> **protocol**: [`Protocol`](/api/transport/src/interfaces/protocol/)\<`TReq`, `TRes`, `TNotif`\>

Defined in: [transport/src/channel/types.ts:126](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L126)

Protocol layer for request/response.

***

### responseAccessor?

> `optional` **responseAccessor**: [`ResponseAccessor`](/api/transport/src/interfaces/responseaccessor/)

Defined in: [transport/src/channel/types.ts:137](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L137)

Response accessor for interpreting response messages.
If not provided, auto-detected based on protocol name.

***

### serialization

> **serialization**: [`SerializationCodec`](/api/transport/src/interfaces/serializationcodec/)

Defined in: [transport/src/channel/types.ts:121](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L121)

Serialization codec for data encoding.

***

### timeout?

> `optional` **timeout**: `number`

Defined in: [transport/src/channel/types.ts:131](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L131)

Default request timeout in milliseconds (default: 30000).

***

### transport

> **transport**: [`Transport`](/api/transport/src/interfaces/transport/)

Defined in: [transport/src/channel/types.ts:111](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L111)

Underlying transport.
