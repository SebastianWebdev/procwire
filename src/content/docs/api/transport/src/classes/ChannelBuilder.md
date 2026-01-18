---
editUrl: false
next: false
prev: false
title: "ChannelBuilder"
---

Defined in: [transport/src/channel/builder.ts:23](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/builder.ts#L23)

Fluent API builder for creating channels.
Provides ergonomic configuration with validation.

## Example

```ts
const channel = new ChannelBuilder()
  .withTransport(transport)
  .withFraming(new LineDelimitedFraming())
  .withSerialization(new JsonCodec())
  .withProtocol(new JsonRpcProtocol())
  .withTimeout(5000)
  .build();
```

## Type Parameters

### TReq

`TReq` = `unknown`

### TRes

`TRes` = `unknown`

### TNotif

`TNotif` = `unknown`

## Constructors

### Constructor

> **new ChannelBuilder**\<`TReq`, `TRes`, `TNotif`\>(): `ChannelBuilder`\<`TReq`, `TRes`, `TNotif`\>

#### Returns

`ChannelBuilder`\<`TReq`, `TRes`, `TNotif`\>

## Methods

### build()

> **build**(): [`Channel`](/api/transport/src/interfaces/channel/)\<`TReq`, `TRes`, `TNotif`\>

Defined in: [transport/src/channel/builder.ts:101](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/builder.ts#L101)

Builds and returns the configured channel.

#### Returns

[`Channel`](/api/transport/src/interfaces/channel/)\<`TReq`, `TRes`, `TNotif`\>

#### Throws

if required configuration is missing

***

### withFraming()

> **withFraming**(`framing`): `this`

Defined in: [transport/src/channel/builder.ts:44](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/builder.ts#L44)

Sets the framing codec.

#### Parameters

##### framing

[`FramingCodec`](/api/transport/src/interfaces/framingcodec/)

#### Returns

`this`

***

### withMaxInboundFrames()

> **withMaxInboundFrames**(`max`): `this`

Defined in: [transport/src/channel/builder.ts:92](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/builder.ts#L92)

Sets the maximum inbound frames limit.

#### Parameters

##### max

`number`

#### Returns

`this`

***

### withMiddleware()

> **withMiddleware**(`middleware`): `this`

Defined in: [transport/src/channel/builder.ts:84](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/builder.ts#L84)

Adds middleware to the channel.

#### Parameters

##### middleware

[`ChannelMiddleware`](/api/transport/src/interfaces/channelmiddleware/)

#### Returns

`this`

***

### withProtocol()

> **withProtocol**\<`R`, `S`, `N`\>(`protocol`): `ChannelBuilder`\<`R`, `S`, `N`\>

Defined in: [transport/src/channel/builder.ts:60](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/builder.ts#L60)

Sets the protocol layer.

#### Type Parameters

##### R

`R`

##### S

`S`

##### N

`N`

#### Parameters

##### protocol

[`Protocol`](/api/transport/src/interfaces/protocol/)\<`R`, `S`, `N`\>

#### Returns

`ChannelBuilder`\<`R`, `S`, `N`\>

***

### withResponseAccessor()

> **withResponseAccessor**(`accessor`): `this`

Defined in: [transport/src/channel/builder.ts:76](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/builder.ts#L76)

Sets the response accessor for interpreting response messages.

#### Parameters

##### accessor

[`ResponseAccessor`](/api/transport/src/interfaces/responseaccessor/)

#### Returns

`this`

***

### withSerialization()

> **withSerialization**(`serialization`): `this`

Defined in: [transport/src/channel/builder.ts:52](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/builder.ts#L52)

Sets the serialization codec.

#### Parameters

##### serialization

[`SerializationCodec`](/api/transport/src/interfaces/serializationcodec/)

#### Returns

`this`

***

### withTimeout()

> **withTimeout**(`timeoutMs`): `this`

Defined in: [transport/src/channel/builder.ts:68](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/builder.ts#L68)

Sets the default request timeout in milliseconds.

#### Parameters

##### timeoutMs

`number`

#### Returns

`this`

***

### withTransport()

> **withTransport**(`transport`): `this`

Defined in: [transport/src/channel/builder.ts:36](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/builder.ts#L36)

Sets the transport layer.

#### Parameters

##### transport

[`Transport`](/api/transport/src/interfaces/transport/)

#### Returns

`this`
