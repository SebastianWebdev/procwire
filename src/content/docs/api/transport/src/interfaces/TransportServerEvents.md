---
editUrl: false
next: false
prev: false
title: "TransportServerEvents"
---

Defined in: [transport/src/transport/types.ts:96](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L96)

Transport server events map.

## Extends

- [`EventMap`](/api/transport/src/interfaces/eventmap/)

## Indexable

\[`event`: `string`\]: `unknown`

## Properties

### close

> **close**: `void`

Defined in: [transport/src/transport/types.ts:110](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L110)

Fired when server closes.

***

### connection

> **connection**: [`Transport`](/api/transport/src/interfaces/transport/)

Defined in: [transport/src/transport/types.ts:105](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L105)

Fired when new client connection is established.

***

### error

> **error**: `Error`

Defined in: [transport/src/transport/types.ts:115](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L115)

Fired when server error occurs.

***

### listening

> **listening**: [`ServerAddress`](/api/transport/src/interfaces/serveraddress/)

Defined in: [transport/src/transport/types.ts:100](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L100)

Fired when server starts listening.
