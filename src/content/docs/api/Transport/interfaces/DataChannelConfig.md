---
editUrl: false
next: false
prev: false
title: "DataChannelConfig"
---

Defined in: [transport/src/process/types.ts:83](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L83)

Data channel configuration.

## Properties

### channel?

> `optional` **channel**: [`ChannelConfig`](/api/transport/interfaces/channelconfig/)

Defined in: [transport/src/process/types.ts:105](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L105)

Channel configuration for data channel.

***

### enabled?

> `optional` **enabled**: `boolean`

Defined in: [transport/src/process/types.ts:88](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L88)

Whether data channel is enabled.

#### Default

```ts
false
```

***

### path?

> `optional` **path**: `string`

Defined in: [transport/src/process/types.ts:94](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L94)

Named pipe/unix socket path for data channel.
If not provided, auto-generated using PipePath.forModule(namespace, processId).

***

### transport?

> `optional` **transport**: `"pipe"`

Defined in: [transport/src/process/types.ts:100](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L100)

Transport type (currently only 'pipe' is supported).

#### Default

```ts
'pipe'
```
