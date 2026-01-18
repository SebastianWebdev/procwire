---
editUrl: false
next: false
prev: false
title: "ServerAddress"
---

Defined in: [transport/src/transport/types.ts:81](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L81)

Server address information.

## Properties

### type

> **type**: `"pipe"` \| `"unix"` \| `"tcp"`

Defined in: [transport/src/transport/types.ts:85](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L85)

Address type (pipe name, unix socket path, TCP port, etc.)

***

### value

> **value**: `string` \| `number`

Defined in: [transport/src/transport/types.ts:90](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/transport/types.ts#L90)

Address value (platform-specific).
