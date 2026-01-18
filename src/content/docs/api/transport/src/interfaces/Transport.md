---
editUrl: false
next: false
prev: false
title: "Transport"
---

Defined in: [transport/src/transport/types.ts:38](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L38)

Base transport interface for bidirectional byte streams.
Implementations: stdio, named pipes, unix sockets, TCP, etc.

## Properties

### state

> `readonly` **state**: [`TransportState`](/api/transport/src/type-aliases/transportstate/)

Defined in: [transport/src/transport/types.ts:42](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L42)

Current connection state.

## Methods

### connect()

> **connect**(): `Promise`\<`void`\>

Defined in: [transport/src/transport/types.ts:48](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L48)

Initiates connection.

#### Returns

`Promise`\<`void`\>

#### Throws

if already connected or invalid state

***

### disconnect()

> **disconnect**(): `Promise`\<`void`\>

Defined in: [transport/src/transport/types.ts:54](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L54)

Closes the connection gracefully.

#### Returns

`Promise`\<`void`\>

#### Throws

if not connected

***

### on()

> **on**\<`K`\>(`event`, `handler`): [`Unsubscribe`](/api/transport/src/type-aliases/unsubscribe/)

Defined in: [transport/src/transport/types.ts:72](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L72)

Subscribes to transport events.

#### Type Parameters

##### K

`K` *extends* keyof [`TransportEvents`](/api/transport/src/interfaces/transportevents/)

#### Parameters

##### event

`K`

##### handler

(`data`) => `void`

#### Returns

[`Unsubscribe`](/api/transport/src/type-aliases/unsubscribe/)

Unsubscribe function

***

### onData()

> **onData**(`handler`): [`Unsubscribe`](/api/transport/src/type-aliases/unsubscribe/)

Defined in: [transport/src/transport/types.ts:66](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L66)

Subscribes to data events.

#### Parameters

##### handler

(`data`) => `void`

#### Returns

[`Unsubscribe`](/api/transport/src/type-aliases/unsubscribe/)

Unsubscribe function

***

### write()

> **write**(`data`): `Promise`\<`void`\>

Defined in: [transport/src/transport/types.ts:60](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L60)

Writes data to the transport.

#### Parameters

##### data

`Buffer`

#### Returns

`Promise`\<`void`\>

#### Throws

if not connected or write fails
