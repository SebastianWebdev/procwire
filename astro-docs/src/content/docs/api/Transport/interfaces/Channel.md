---
editUrl: false
next: false
prev: false
title: "Channel"
---

Defined in: [transport/src/channel/types.ts:158](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L158)

High-level communication channel combining all layers.
Provides request/response and notification patterns.

## Type Parameters

### TReq

`TReq` = `unknown`

Request data type (wire format)

### TRes

`TRes` = `unknown`

Response data type (wire format)

### TNotif

`TNotif` = `unknown`

Notification data type (wire format)

## Properties

### isConnected

> `readonly` **isConnected**: `boolean`

Defined in: [transport/src/channel/types.ts:162](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L162)

Returns true if channel is connected and ready.

## Methods

### close()

> **close**(): `Promise`\<`void`\>

Defined in: [transport/src/channel/types.ts:172](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L172)

Closes the channel gracefully.

#### Returns

`Promise`\<`void`\>

***

### notify()

> **notify**(`method`, `params?`): `Promise`\<`void`\>

Defined in: [transport/src/channel/types.ts:190](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L190)

Sends a notification (fire-and-forget, no response expected).

#### Parameters

##### method

`string`

Method name

##### params?

`unknown`

Optional parameters

#### Returns

`Promise`\<`void`\>

***

### on()

> **on**\<`K`\>(`event`, `handler`): [`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)

Defined in: [transport/src/channel/types.ts:208](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L208)

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

Unsubscribe function

***

### onNotification()

> **onNotification**(`handler`): [`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)

Defined in: [transport/src/channel/types.ts:202](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L202)

Registers handler for incoming notifications.

#### Parameters

##### handler

[`NotificationHandler`](/api/transport/type-aliases/notificationhandler/)\<`TNotif`\>

#### Returns

[`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)

Unsubscribe function

***

### onRequest()

> **onRequest**(`handler`): [`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)

Defined in: [transport/src/channel/types.ts:196](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L196)

Registers handler for incoming requests.

#### Parameters

##### handler

[`RequestHandler`](/api/transport/type-aliases/requesthandler/)\<`TReq`, `TRes`\>

#### Returns

[`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)

Unsubscribe function

***

### request()

> **request**(`method`, `params?`, `timeout?`): `Promise`\<`unknown`\>

Defined in: [transport/src/channel/types.ts:183](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L183)

Sends a request and waits for response.

#### Parameters

##### method

`string`

Method name

##### params?

`unknown`

Optional parameters

##### timeout?

`number`

Optional timeout override (ms)

#### Returns

`Promise`\<`unknown`\>

Promise resolving to response result

#### Throws

if request times out

#### Throws

if response is an error

***

### start()

> **start**(): `Promise`\<`void`\>

Defined in: [transport/src/channel/types.ts:167](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L167)

Starts the channel (connects transport).

#### Returns

`Promise`\<`void`\>
