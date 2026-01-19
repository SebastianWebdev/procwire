---
editUrl: false
next: false
prev: false
title: "LineDelimitedFramingOptions"
---

Defined in: [transport/src/framing/line-delimited.ts:7](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/line-delimited.ts#L7)

Options for LineDelimitedFraming.

## Properties

### delimiter?

> `optional` **delimiter**: `number`

Defined in: [transport/src/framing/line-delimited.ts:11](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/line-delimited.ts#L11)

Delimiter byte (default: 0x0A = '\n').

***

### maxBufferSize?

> `optional` **maxBufferSize**: `number`

Defined in: [transport/src/framing/line-delimited.ts:17](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/line-delimited.ts#L17)

Maximum buffer size before throwing error (default: 8MB).
Prevents DoS from infinitely long lines without delimiter.

***

### stripDelimiter?

> `optional` **stripDelimiter**: `boolean`

Defined in: [transport/src/framing/line-delimited.ts:22](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/line-delimited.ts#L22)

Whether to strip delimiter from decoded frames (default: true).
