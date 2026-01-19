---
editUrl: false
next: false
prev: false
title: "ChannelMiddleware"
---

Defined in: [transport/src/channel/types.ts:54](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L54)

Middleware hook for channel operations.
Useful for logging, metrics, debugging, and transformation.

## Methods

### onError()?

> `optional` **onError**(`error`): `void` \| `Promise`\<`void`\>

Defined in: [transport/src/channel/types.ts:78](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L78)

Called when an error occurs.

#### Parameters

##### error

`Error`

#### Returns

`void` \| `Promise`\<`void`\>

***

### onIncomingRequest()?

> `optional` **onIncomingRequest**(`request`): `void` \| `Promise`\<`void`\>

Defined in: [transport/src/channel/types.ts:68](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L68)

Called when receiving an incoming request.

#### Parameters

##### request

`unknown`

#### Returns

`void` \| `Promise`\<`void`\>

***

### onIncomingResponse()?

> `optional` **onIncomingResponse**(`response`): `void` \| `Promise`\<`void`\>

Defined in: [transport/src/channel/types.ts:63](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L63)

Called after receiving a response.

#### Parameters

##### response

`unknown`

#### Returns

`void` \| `Promise`\<`void`\>

***

### onOutgoingRequest()?

> `optional` **onOutgoingRequest**(`request`): `void` \| `Promise`\<`void`\>

Defined in: [transport/src/channel/types.ts:58](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L58)

Called before sending a request.

#### Parameters

##### request

`unknown`

#### Returns

`void` \| `Promise`\<`void`\>

***

### onOutgoingResponse()?

> `optional` **onOutgoingResponse**(`response`): `void` \| `Promise`\<`void`\>

Defined in: [transport/src/channel/types.ts:73](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/channel/types.ts#L73)

Called before sending a response.

#### Parameters

##### response

`unknown`

#### Returns

`void` \| `Promise`\<`void`\>
