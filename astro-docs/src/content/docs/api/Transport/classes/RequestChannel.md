---
editUrl: false
next: false
prev: false
title: "RequestChannel"
---

Defined in: [transport/src/channel/request-channel.ts:109](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/request-channel.ts#L109)

Request channel implementation.
Combines Transport + Framing + Serialization + Protocol layers
to provide high-level request/response and notification patterns.

## Type Parameters

### TReq

`TReq` = `unknown`

Request message type (wire format)

### TRes

`TRes` = `unknown`

Response message type (wire format)

### TNotif

`TNotif` = `unknown`

Notification message type (wire format)

## Implements

- [`Channel`](/api/transport/interfaces/channel/)\<`TReq`, `TRes`, `TNotif`\>

## Constructors

### Constructor

> **new RequestChannel**\<`TReq`, `TRes`, `TNotif`\>(`options`): `RequestChannel`\<`TReq`, `TRes`, `TNotif`\>

Defined in: [transport/src/channel/request-channel.ts:131](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/request-channel.ts#L131)

#### Parameters

##### options

[`ChannelOptions`](/api/transport/interfaces/channeloptions/)\<`TReq`, `TRes`, `TNotif`\>

#### Returns

`RequestChannel`\<`TReq`, `TRes`, `TNotif`\>

## Accessors

### isConnected

#### Get Signature

> **get** **isConnected**(): `boolean`

Defined in: [transport/src/channel/request-channel.ts:147](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/request-channel.ts#L147)

Returns true if channel is connected and ready.

##### Returns

`boolean`

Returns true if channel is connected and ready.

#### Implementation of

[`Channel`](/api/transport/interfaces/channel/).[`isConnected`](/api/transport/interfaces/channel/#isconnected)

## Methods

### close()

> **close**(): `Promise`\<`void`\>

Defined in: [transport/src/channel/request-channel.ts:182](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/request-channel.ts#L182)

Closes the channel gracefully.

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Channel`](/api/transport/interfaces/channel/).[`close`](/api/transport/interfaces/channel/#close)

***

### notify()

> **notify**(`method`, `params?`): `Promise`\<`void`\>

Defined in: [transport/src/channel/request-channel.ts:280](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/request-channel.ts#L280)

Sends a notification (fire-and-forget).

#### Parameters

##### method

`string`

##### params?

`unknown`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Channel`](/api/transport/interfaces/channel/).[`notify`](/api/transport/interfaces/channel/#notify)

***

### on()

> **on**\<`K`\>(`event`, `handler`): [`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)

Defined in: [transport/src/channel/request-channel.ts:328](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/request-channel.ts#L328)

Subscribes to channel events.

#### Type Parameters

##### K

`K` *extends* keyof [`ChannelEvents`](/api/transport/interfaces/channelevents/)

#### Parameters

##### event

`K`

##### handler

(`data`) => `void`

#### Returns

[`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)

#### Implementation of

[`Channel`](/api/transport/interfaces/channel/).[`on`](/api/transport/interfaces/channel/#on)

***

### onNotification()

> **onNotification**(`handler`): [`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)

Defined in: [transport/src/channel/request-channel.ts:315](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/request-channel.ts#L315)

Registers handler for incoming notifications.

#### Parameters

##### handler

[`NotificationHandler`](/api/transport/type-aliases/notificationhandler/)\<`TNotif`\>

#### Returns

[`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)

#### Implementation of

[`Channel`](/api/transport/interfaces/channel/).[`onNotification`](/api/transport/interfaces/channel/#onnotification)

***

### onRequest()

> **onRequest**(`handler`): [`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)

Defined in: [transport/src/channel/request-channel.ts:302](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/request-channel.ts#L302)

Registers handler for incoming requests.

#### Parameters

##### handler

[`RequestHandler`](/api/transport/type-aliases/requesthandler/)\<`TReq`, `TRes`\>

#### Returns

[`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)

#### Implementation of

[`Channel`](/api/transport/interfaces/channel/).[`onRequest`](/api/transport/interfaces/channel/#onrequest)

***

### request()

> **request**(`method`, `params?`, `timeout?`): `Promise`\<`unknown`\>

Defined in: [transport/src/channel/request-channel.ts:219](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/request-channel.ts#L219)

Sends a request and waits for response.

#### Parameters

##### method

`string`

##### params?

`unknown`

##### timeout?

`number`

#### Returns

`Promise`\<`unknown`\>

#### Implementation of

[`Channel`](/api/transport/interfaces/channel/).[`request`](/api/transport/interfaces/channel/#request)

***

### start()

> **start**(): `Promise`\<`void`\>

Defined in: [transport/src/channel/request-channel.ts:154](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/request-channel.ts#L154)

Starts the channel (connects transport and begins message processing).

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Channel`](/api/transport/interfaces/channel/).[`start`](/api/transport/interfaces/channel/#start)
