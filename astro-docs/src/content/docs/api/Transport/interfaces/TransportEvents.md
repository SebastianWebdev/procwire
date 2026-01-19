---
editUrl: false
next: false
prev: false
title: "TransportEvents"
---

Defined in: [transport/src/transport/types.ts:12](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L12)

Transport events map.

## Extends

- [`EventMap`](/api/transport/interfaces/eventmap/)

## Extended by

- [`StdioTransportEvents`](/api/transport/interfaces/stdiotransportevents/)

## Indexable

\[`event`: `string`\]: `unknown`

## Properties

### connect

> **connect**: `void`

Defined in: [transport/src/transport/types.ts:16](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L16)

Fired when transport successfully connects.

***

### data

> **data**: `Buffer`

Defined in: [transport/src/transport/types.ts:31](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L31)

Fired when data is received.

***

### disconnect

> **disconnect**: `void`

Defined in: [transport/src/transport/types.ts:21](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L21)

Fired when transport disconnects (graceful or error).

***

### error

> **error**: `Error`

Defined in: [transport/src/transport/types.ts:26](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L26)

Fired when an error occurs.
