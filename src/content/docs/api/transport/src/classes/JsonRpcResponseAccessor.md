---
editUrl: false
next: false
prev: false
title: "JsonRpcResponseAccessor"
---

Defined in: [transport/src/channel/request-channel.ts:31](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/request-channel.ts#L31)

JSON-RPC response accessor implementation.

## Implements

- [`ResponseAccessor`](/api/transport/src/interfaces/responseaccessor/)

## Constructors

### Constructor

> **new JsonRpcResponseAccessor**(): `JsonRpcResponseAccessor`

#### Returns

`JsonRpcResponseAccessor`

## Methods

### getError()

> **getError**(`message`): `unknown`

Defined in: [transport/src/channel/request-channel.ts:55](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/request-channel.ts#L55)

Extracts error data from error response.

#### Parameters

##### message

`unknown`

#### Returns

`unknown`

#### Implementation of

[`ResponseAccessor`](/api/transport/src/interfaces/responseaccessor/).[`getError`](/api/transport/src/interfaces/responseaccessor/#geterror)

***

### getResponseId()

> **getResponseId**(`message`): [`RequestId`](/api/transport/src/type-aliases/requestid/) \| `undefined`

Defined in: [transport/src/channel/request-channel.ts:32](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/request-channel.ts#L32)

Extracts request ID from a response message.

#### Parameters

##### message

`unknown`

#### Returns

[`RequestId`](/api/transport/src/type-aliases/requestid/) \| `undefined`

Request ID or undefined if message is not a response

#### Implementation of

[`ResponseAccessor`](/api/transport/src/interfaces/responseaccessor/).[`getResponseId`](/api/transport/src/interfaces/responseaccessor/#getresponseid)

***

### getResult()

> **getResult**(`message`): `unknown`

Defined in: [transport/src/channel/request-channel.ts:48](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/request-channel.ts#L48)

Extracts result data from success response.

#### Parameters

##### message

`unknown`

#### Returns

`unknown`

#### Implementation of

[`ResponseAccessor`](/api/transport/src/interfaces/responseaccessor/).[`getResult`](/api/transport/src/interfaces/responseaccessor/#getresult)

***

### isErrorResponse()

> **isErrorResponse**(`message`): `boolean`

Defined in: [transport/src/channel/request-channel.ts:44](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/request-channel.ts#L44)

Checks if response message represents an error.

#### Parameters

##### message

`unknown`

#### Returns

`boolean`

#### Implementation of

[`ResponseAccessor`](/api/transport/src/interfaces/responseaccessor/).[`isErrorResponse`](/api/transport/src/interfaces/responseaccessor/#iserrorresponse)
