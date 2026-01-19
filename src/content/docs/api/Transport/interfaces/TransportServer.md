---
editUrl: false
next: false
prev: false
title: "TransportServer"
---

Defined in: [transport/src/transport/types.ts:122](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L122)

Transport server interface for accepting client connections.
Implementations: named pipe server, unix socket server, TCP server.

## Properties

### address

> `readonly` **address**: [`ServerAddress`](/api/transport/interfaces/serveraddress/) \| `null`

Defined in: [transport/src/transport/types.ts:131](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L131)

Server address (only available when listening).

***

### isListening

> `readonly` **isListening**: `boolean`

Defined in: [transport/src/transport/types.ts:126](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L126)

Returns true if server is currently listening.

## Methods

### close()

> **close**(): `Promise`\<`void`\>

Defined in: [transport/src/transport/types.ts:143](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L143)

Stops the server and closes all active connections.

#### Returns

`Promise`\<`void`\>

***

### listen()

> **listen**(`address`): `Promise`\<[`ServerAddress`](/api/transport/interfaces/serveraddress/)\>

Defined in: [transport/src/transport/types.ts:138](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L138)

Starts listening for connections.

#### Parameters

##### address

Platform-specific address (pipe name, socket path, port)

`string` | `number`

#### Returns

`Promise`\<[`ServerAddress`](/api/transport/interfaces/serveraddress/)\>

#### Throws

if already listening

***

### on()

> **on**\<`K`\>(`event`, `handler`): [`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)

Defined in: [transport/src/transport/types.ts:155](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L155)

Subscribes to server events.

#### Type Parameters

##### K

`K` *extends* keyof [`TransportServerEvents`](/api/transport/interfaces/transportserverevents/)

#### Parameters

##### event

`K`

##### handler

(`data`) => `void`

#### Returns

[`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)

Unsubscribe function

***

### onConnection()

> **onConnection**(`handler`): [`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)

Defined in: [transport/src/transport/types.ts:149](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L149)

Subscribes to new connection events.

#### Parameters

##### handler

(`transport`) => `void`

#### Returns

[`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)

Unsubscribe function
