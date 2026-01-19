---
editUrl: false
next: false
prev: false
title: "StdioTransportEvents"
---

Defined in: [transport/src/transport/stdio-transport.ts:55](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/stdio-transport.ts#L55)

Extended transport events for stdio transport (includes stderr and exit events).

## Extends

- [`TransportEvents`](/api/transport/interfaces/transportevents/)

## Indexable

\[`event`: `string`\]: `unknown`

## Properties

### connect

> **connect**: `void`

Defined in: [transport/src/transport/types.ts:16](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L16)

Fired when transport successfully connects.

#### Inherited from

[`TransportEvents`](/api/transport/interfaces/transportevents/).[`connect`](/api/transport/interfaces/transportevents/#connect)

***

### data

> **data**: `Buffer`

Defined in: [transport/src/transport/types.ts:31](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L31)

Fired when data is received.

#### Inherited from

[`TransportEvents`](/api/transport/interfaces/transportevents/).[`data`](/api/transport/interfaces/transportevents/#data)

***

### disconnect

> **disconnect**: `void`

Defined in: [transport/src/transport/types.ts:21](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L21)

Fired when transport disconnects (graceful or error).

#### Inherited from

[`TransportEvents`](/api/transport/interfaces/transportevents/).[`disconnect`](/api/transport/interfaces/transportevents/#disconnect)

***

### error

> **error**: `Error`

Defined in: [transport/src/transport/types.ts:26](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L26)

Fired when an error occurs.

#### Inherited from

[`TransportEvents`](/api/transport/interfaces/transportevents/).[`error`](/api/transport/interfaces/transportevents/#error)

***

### exit

> **exit**: `object`

Defined in: [transport/src/transport/stdio-transport.ts:64](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/stdio-transport.ts#L64)

Fired when child process exits.

#### code

> **code**: `number` \| `null`

#### signal

> **signal**: `Signals` \| `null`

***

### stderr

> **stderr**: `string`

Defined in: [transport/src/transport/stdio-transport.ts:59](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/stdio-transport.ts#L59)

Fired when stderr data is received.
