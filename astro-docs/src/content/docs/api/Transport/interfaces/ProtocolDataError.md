---
editUrl: false
next: false
prev: false
title: "ProtocolDataError"
---

Defined in: [transport/src/protocol/types.ts:10](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/types.ts#L10)

Protocol error data structure (not the runtime error class).
Used in error responses at protocol level.

## Properties

### code

> **code**: `number`

Defined in: [transport/src/protocol/types.ts:14](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/types.ts#L14)

Error code (e.g., -32600 for JSON-RPC, or custom codes).

***

### data?

> `optional` **data**: `unknown`

Defined in: [transport/src/protocol/types.ts:24](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/types.ts#L24)

Optional additional error data.

***

### message

> **message**: `string`

Defined in: [transport/src/protocol/types.ts:19](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/types.ts#L19)

Human-readable error message.
