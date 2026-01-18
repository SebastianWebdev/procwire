---
editUrl: false
next: false
prev: false
title: "ResponseAccessor"
---

Defined in: [transport/src/channel/types.ts:27](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L27)

Response accessor for interpreting protocol-specific response messages.
Abstracts away protocol differences for generic channel implementation.

## Methods

### getError()

> **getError**(`message`): `unknown`

Defined in: [transport/src/channel/types.ts:47](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L47)

Extracts error data from error response.

#### Parameters

##### message

`unknown`

#### Returns

`unknown`

***

### getResponseId()

> **getResponseId**(`message`): [`RequestId`](/api/transport/src/type-aliases/requestid/) \| `undefined`

Defined in: [transport/src/channel/types.ts:32](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L32)

Extracts request ID from a response message.

#### Parameters

##### message

`unknown`

#### Returns

[`RequestId`](/api/transport/src/type-aliases/requestid/) \| `undefined`

Request ID or undefined if message is not a response

***

### getResult()

> **getResult**(`message`): `unknown`

Defined in: [transport/src/channel/types.ts:42](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L42)

Extracts result data from success response.

#### Parameters

##### message

`unknown`

#### Returns

`unknown`

***

### isErrorResponse()

> **isErrorResponse**(`message`): `boolean`

Defined in: [transport/src/channel/types.ts:37](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L37)

Checks if response message represents an error.

#### Parameters

##### message

`unknown`

#### Returns

`boolean`
