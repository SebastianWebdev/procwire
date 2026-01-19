---
editUrl: false
next: false
prev: false
title: "createUnsubscribe"
---

> **createUnsubscribe**(`fn`): [`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)

Defined in: [transport/src/utils/disposables.ts:17](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/utils/disposables.ts#L17)

Converts a function to an Unsubscribe function.
Ensures idempotency (can be called multiple times safely).

## Parameters

### fn

() => `void`

## Returns

[`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)
