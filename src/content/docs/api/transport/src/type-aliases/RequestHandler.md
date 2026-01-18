---
editUrl: false
next: false
prev: false
title: "RequestHandler"
---

> **RequestHandler**\<`TReq`, `TRes`\> = (`request`) => `TRes` \| `Promise`\<`TRes`\>

Defined in: [transport/src/channel/types.ts:13](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L13)

Request handler function.

## Type Parameters

### TReq

`TReq` = `unknown`

Request data type

### TRes

`TRes` = `unknown`

Response data type

## Parameters

### request

`TReq`

## Returns

`TRes` \| `Promise`\<`TRes`\>
