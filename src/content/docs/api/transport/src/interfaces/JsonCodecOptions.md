---
editUrl: false
next: false
prev: false
title: "JsonCodecOptions"
---

Defined in: [transport/src/serialization/json.ts:7](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/json.ts#L7)

Options for JSON codec configuration.

## Properties

### replacer()?

> `optional` **replacer**: (`key`, `value`) => `unknown`

Defined in: [transport/src/serialization/json.ts:12](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/json.ts#L12)

Function to transform values during serialization.
Applied during JSON.stringify().

#### Parameters

##### key

`string`

##### value

`unknown`

#### Returns

`unknown`

***

### reviver()?

> `optional` **reviver**: (`key`, `value`) => `unknown`

Defined in: [transport/src/serialization/json.ts:18](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/json.ts#L18)

Function to transform values during deserialization.
Applied during JSON.parse().

#### Parameters

##### key

`string`

##### value

`unknown`

#### Returns

`unknown`

***

### space?

> `optional` **space**: `string` \| `number`

Defined in: [transport/src/serialization/json.ts:24](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/json.ts#L24)

Indentation for formatted JSON output.
Useful for debugging. Default: undefined (compact).
