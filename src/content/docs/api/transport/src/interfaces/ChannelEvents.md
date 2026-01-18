---
editUrl: false
next: false
prev: false
title: "ChannelEvents"
---

Defined in: [transport/src/channel/types.ts:84](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L84)

Channel events map.

## Extends

- [`EventMap`](/api/transport/src/interfaces/eventmap/)

## Indexable

\[`event`: `string`\]: `unknown`

## Properties

### close

> **close**: `void`

Defined in: [transport/src/channel/types.ts:93](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L93)

Fired when channel closes.

***

### error

> **error**: `Error`

Defined in: [transport/src/channel/types.ts:98](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L98)

Fired when channel error occurs.

***

### start

> **start**: `void`

Defined in: [transport/src/channel/types.ts:88](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L88)

Fired when channel starts (connects).
