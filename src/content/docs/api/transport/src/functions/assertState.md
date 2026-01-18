---
editUrl: false
next: false
prev: false
title: "assertState"
---

> **assertState**(`current`, `allowed`): `void`

Defined in: [transport/src/utils/assert.ts:8](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/utils/assert.ts#L8)

Asserts that current state is one of the allowed states.
Throws TransportError if not.

## Parameters

### current

[`TransportState`](/api/transport/src/type-aliases/transportstate/)

### allowed

[`TransportState`](/api/transport/src/type-aliases/transportstate/)[]

## Returns

`void`
