---
editUrl: false
next: false
prev: false
title: "LengthPrefixedFramingOptions"
---

Defined in: [transport/src/framing/length-prefixed.ts:7](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/length-prefixed.ts#L7)

Options for LengthPrefixedFraming.

## Properties

### maxMessageSize?

> `optional` **maxMessageSize**: `number`

Defined in: [transport/src/framing/length-prefixed.ts:12](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/framing/length-prefixed.ts#L12)

Maximum message size in bytes (default: 32MB).
Prevents DoS from malicious large length headers.
