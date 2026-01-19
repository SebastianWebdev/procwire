---
editUrl: false
next: false
prev: false
title: "ProcessHandleEvents"
---

Defined in: [transport/src/process/types.ts:222](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L222)

Process handle events.

## Extends

- [`EventMap`](/api/transport/src/interfaces/eventmap/)

## Indexable

\[`event`: `string`\]: `unknown`

## Properties

### error

> **error**: `Error`

Defined in: [transport/src/process/types.ts:236](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L236)

Fired when an error occurs.

***

### exit

> **exit**: `object`

Defined in: [transport/src/process/types.ts:231](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L231)

Fired when process exits.

#### code

> **code**: `number` \| `null`

#### signal

> **signal**: `string` \| `null`

***

### stateChange

> **stateChange**: `object`

Defined in: [transport/src/process/types.ts:226](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L226)

Fired when process state changes.

#### from

> **from**: [`ProcessState`](/api/transport/src/type-aliases/processstate/)

#### to

> **to**: [`ProcessState`](/api/transport/src/type-aliases/processstate/)
