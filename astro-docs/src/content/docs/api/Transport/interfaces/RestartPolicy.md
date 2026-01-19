---
editUrl: false
next: false
prev: false
title: "RestartPolicy"
---

Defined in: [transport/src/process/types.ts:23](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L23)

Restart policy configuration.

## Properties

### backoffMs

> **backoffMs**: `number`

Defined in: [transport/src/process/types.ts:37](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L37)

Initial backoff delay in milliseconds.

***

### enabled

> **enabled**: `boolean`

Defined in: [transport/src/process/types.ts:27](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L27)

Whether automatic restart is enabled.

***

### maxBackoffMs?

> `optional` **maxBackoffMs**: `number`

Defined in: [transport/src/process/types.ts:43](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L43)

Maximum backoff delay in milliseconds (optional).
Caps exponential backoff growth.

***

### maxRestarts

> **maxRestarts**: `number`

Defined in: [transport/src/process/types.ts:32](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L32)

Maximum number of restart attempts.
