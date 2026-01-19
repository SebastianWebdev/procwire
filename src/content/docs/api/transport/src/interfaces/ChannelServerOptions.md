---
editUrl: false
next: false
prev: false
title: "ChannelServerOptions"
---

Defined in: [transport/src/channel/types.ts:217](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L217)

Server-side channel factory options.

## Type Parameters

### TReq

`TReq` = `unknown`

### TRes

`TRes` = `unknown`

### TNotif

`TNotif` = `unknown`

## Properties

### createFraming()

> **createFraming**: () => [`FramingCodec`](/api/transport/src/interfaces/framingcodec/)

Defined in: [transport/src/channel/types.ts:226](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L226)

Framing codec factory (creates instance per connection).

#### Returns

[`FramingCodec`](/api/transport/src/interfaces/framingcodec/)

***

### createProtocol()

> **createProtocol**: () => [`Protocol`](/api/transport/src/interfaces/protocol/)\<`TReq`, `TRes`, `TNotif`\>

Defined in: [transport/src/channel/types.ts:236](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L236)

Protocol factory (creates instance per connection).

#### Returns

[`Protocol`](/api/transport/src/interfaces/protocol/)\<`TReq`, `TRes`, `TNotif`\>

***

### serialization

> **serialization**: [`SerializationCodec`](/api/transport/src/interfaces/serializationcodec/)

Defined in: [transport/src/channel/types.ts:231](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L231)

Serialization codec (can be shared across connections).

***

### server

> **server**: [`TransportServer`](/api/transport/src/interfaces/transportserver/)

Defined in: [transport/src/channel/types.ts:221](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L221)

Transport server for accepting connections.

***

### timeout?

> `optional` **timeout**: `number`

Defined in: [transport/src/channel/types.ts:241](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L241)

Default request timeout in milliseconds (optional).
