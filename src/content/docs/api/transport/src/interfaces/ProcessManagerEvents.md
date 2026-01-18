---
editUrl: false
next: false
prev: false
title: "ProcessManagerEvents"
---

Defined in: [transport/src/process/types.ts:187](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L187)

Process manager events.

## Extends

- [`EventMap`](/api/transport/src/interfaces/eventmap/)

## Indexable

\[`event`: `string`\]: `unknown`

## Properties

### crash

> **crash**: `object`

Defined in: [transport/src/process/types.ts:201](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L201)

Fired when a process crashes.

#### error

> **error**: `Error`

#### id

> **id**: `string`

***

### error

> **error**: `object`

Defined in: [transport/src/process/types.ts:216](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L216)

Fired when an error occurs.

#### error

> **error**: `Error`

#### id

> **id**: `string`

***

### exit

> **exit**: `object`

Defined in: [transport/src/process/types.ts:196](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L196)

Fired when a process exits.

#### code

> **code**: `number` \| `null`

#### id

> **id**: `string`

#### signal

> **signal**: `string` \| `null`

***

### ready

> **ready**: `object`

Defined in: [transport/src/process/types.ts:211](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L211)

Fired when a process is ready (channels connected).

#### id

> **id**: `string`

***

### restart

> **restart**: `object`

Defined in: [transport/src/process/types.ts:206](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L206)

Fired when a process restart is attempted.

#### attempt

> **attempt**: `number`

#### delayMs

> **delayMs**: `number`

#### id

> **id**: `string`

***

### spawn

> **spawn**: `object`

Defined in: [transport/src/process/types.ts:191](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L191)

Fired when a process is spawned.

#### id

> **id**: `string`

#### pid

> **pid**: `number`
