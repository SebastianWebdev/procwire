---
editUrl: false
next: false
prev: false
title: "withTimeout"
---

> **withTimeout**\<`T`\>(`promise`, `ms`, `options?`): `Promise`\<`T`\>

Defined in: [transport/src/utils/time.ts:34](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/utils/time.ts#L34)

Wraps a promise with a timeout.
Throws TimeoutError if promise doesn't settle within ms.

## Type Parameters

### T

`T`

## Parameters

### promise

`Promise`\<`T`\>

Promise to wrap

### ms

`number`

Timeout in milliseconds

### options?

[`TimeoutOptions`](/api/transport/interfaces/timeoutoptions/)

Optional message and cause for timeout error

## Returns

`Promise`\<`T`\>

Promise that rejects with TimeoutError on timeout
