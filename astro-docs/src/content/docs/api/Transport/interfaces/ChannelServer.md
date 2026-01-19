---
editUrl: false
next: false
prev: false
title: "ChannelServer"
---

Defined in: [transport/src/channel/types.ts:248](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L248)

Server-side channel manager.
Accepts connections and creates Channel instances.

## Type Parameters

### TReq

`TReq` = `unknown`

### TRes

`TRes` = `unknown`

### TNotif

`TNotif` = `unknown`

## Properties

### isListening

> `readonly` **isListening**: `boolean`

Defined in: [transport/src/channel/types.ts:252](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L252)

Returns true if server is listening.

## Methods

### close()

> **close**(): `Promise`\<`void`\>

Defined in: [transport/src/channel/types.ts:262](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L262)

Stops the server and closes all channels.

#### Returns

`Promise`\<`void`\>

***

### listen()

> **listen**(`address`): `Promise`\<`void`\>

Defined in: [transport/src/channel/types.ts:257](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L257)

Starts listening for connections.

#### Parameters

##### address

`string` | `number`

#### Returns

`Promise`\<`void`\>

***

### onConnection()

> **onConnection**(`handler`): [`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)

Defined in: [transport/src/channel/types.ts:268](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L268)

Subscribes to new channel connections.

#### Parameters

##### handler

(`channel`) => `void`

#### Returns

[`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)

Unsubscribe function
