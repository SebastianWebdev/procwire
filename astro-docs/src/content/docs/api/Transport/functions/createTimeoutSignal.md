---
editUrl: false
next: false
prev: false
title: "createTimeoutSignal"
---

> **createTimeoutSignal**(`ms`): `object`

Defined in: [transport/src/utils/time.ts:63](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/utils/time.ts#L63)

Creates a timeout signal that resolves after ms.
Useful for race conditions with manual cancellation.

## Parameters

### ms

`number`

## Returns

`object`

Object with promise and cancel function

### cancel()

> **cancel**: () => `void`

#### Returns

`void`

### promise

> **promise**: `Promise`\<`never`\>
