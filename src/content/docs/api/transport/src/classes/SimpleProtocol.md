---
editUrl: false
next: false
prev: false
title: "SimpleProtocol"
---

Defined in: [transport/src/protocol/simple.ts:64](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/simple.ts#L64)

Minimal protocol implementation with no JSON-RPC overhead.

Provides a lightweight request/response/notification protocol
suitable for high-performance or custom IPC scenarios.

Message format:
- Request: `{ type: 'request', id, method, params? }`
- Response: `{ type: 'response', id, result?, error? }`
- Notification: `{ type: 'notification', method, params? }`

## Example

```ts
const protocol = new SimpleProtocol();
const req = protocol.createRequest('getUser', { id: 42 });
const res = protocol.createResponse(req.id, { name: 'Alice' });
```

## Implements

- [`Protocol`](/api/transport/src/interfaces/protocol/)\<[`SimpleRequest`](/api/transport/src/interfaces/simplerequest/), [`SimpleResponseMessage`](/api/transport/src/type-aliases/simpleresponsemessage/), [`SimpleNotification`](/api/transport/src/interfaces/simplenotification/)\>

## Constructors

### Constructor

> **new SimpleProtocol**(): `SimpleProtocol`

#### Returns

`SimpleProtocol`

## Properties

### name

> `readonly` **name**: `"simple"` = `"simple"`

Defined in: [transport/src/protocol/simple.ts:67](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/simple.ts#L67)

Protocol name identifier.

#### Implementation of

[`Protocol`](/api/transport/src/interfaces/protocol/).[`name`](/api/transport/src/interfaces/protocol/#name)

***

### version

> `readonly` **version**: `"1.0"` = `"1.0"`

Defined in: [transport/src/protocol/simple.ts:68](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/simple.ts#L68)

Protocol version.

#### Implementation of

[`Protocol`](/api/transport/src/interfaces/protocol/).[`version`](/api/transport/src/interfaces/protocol/#version)

## Methods

### createErrorResponse()

> **createErrorResponse**(`id`, `error`): [`SimpleErrorResponse`](/api/transport/src/interfaces/simpleerrorresponse/)

Defined in: [transport/src/protocol/simple.ts:123](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/simple.ts#L123)

Creates a simple protocol error response message.

#### Parameters

##### id

[`RequestId`](/api/transport/src/type-aliases/requestid/)

Request ID

##### error

[`ProtocolDataError`](/api/transport/src/interfaces/protocoldataerror/)

Error details

#### Returns

[`SimpleErrorResponse`](/api/transport/src/interfaces/simpleerrorresponse/)

Simple error response object

#### Implementation of

[`Protocol`](/api/transport/src/interfaces/protocol/).[`createErrorResponse`](/api/transport/src/interfaces/protocol/#createerrorresponse)

***

### createNotification()

> **createNotification**(`method`, `params?`): [`SimpleNotification`](/api/transport/src/interfaces/simplenotification/)

Defined in: [transport/src/protocol/simple.ts:139](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/simple.ts#L139)

Creates a simple protocol notification message.

#### Parameters

##### method

`string`

Method name (must be non-empty string)

##### params?

`unknown`

Optional parameters

#### Returns

[`SimpleNotification`](/api/transport/src/interfaces/simplenotification/)

Simple notification object

#### Throws

if method is invalid

#### Implementation of

[`Protocol`](/api/transport/src/interfaces/protocol/).[`createNotification`](/api/transport/src/interfaces/protocol/#createnotification)

***

### createRequest()

> **createRequest**(`method`, `params?`, `id?`): [`SimpleRequest`](/api/transport/src/interfaces/simplerequest/)

Defined in: [transport/src/protocol/simple.ts:81](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/simple.ts#L81)

Creates a simple protocol request message.

#### Parameters

##### method

`string`

Method name (must be non-empty string)

##### params?

`unknown`

Optional parameters

##### id?

[`RequestId`](/api/transport/src/type-aliases/requestid/)

Optional request ID (auto-generated if not provided)

#### Returns

[`SimpleRequest`](/api/transport/src/interfaces/simplerequest/)

Simple request object

#### Throws

if method is invalid

#### Implementation of

[`Protocol`](/api/transport/src/interfaces/protocol/).[`createRequest`](/api/transport/src/interfaces/protocol/#createrequest)

***

### createResponse()

> **createResponse**(`id`, `result`): [`SimpleResponse`](/api/transport/src/interfaces/simpleresponse/)

Defined in: [transport/src/protocol/simple.ts:108](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/simple.ts#L108)

Creates a simple protocol success response message.

#### Parameters

##### id

[`RequestId`](/api/transport/src/type-aliases/requestid/)

Request ID

##### result

`unknown`

Response result

#### Returns

[`SimpleResponse`](/api/transport/src/interfaces/simpleresponse/)

Simple response object

#### Implementation of

[`Protocol`](/api/transport/src/interfaces/protocol/).[`createResponse`](/api/transport/src/interfaces/protocol/#createresponse)

***

### isNotification()

> **isNotification**(`msg`): `msg is { kind: "notification"; message: SimpleNotification }`

Defined in: [transport/src/protocol/simple.ts:236](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/simple.ts#L236)

Type guard for notification messages.

#### Parameters

##### msg

[`ParsedMessage`](/api/transport/src/type-aliases/parsedmessage/)\<[`SimpleRequest`](/api/transport/src/interfaces/simplerequest/), [`SimpleResponseMessage`](/api/transport/src/type-aliases/simpleresponsemessage/), [`SimpleNotification`](/api/transport/src/interfaces/simplenotification/)\>

#### Returns

`msg is { kind: "notification"; message: SimpleNotification }`

#### Implementation of

[`Protocol`](/api/transport/src/interfaces/protocol/).[`isNotification`](/api/transport/src/interfaces/protocol/#isnotification)

***

### isRequest()

> **isRequest**(`msg`): `msg is { kind: "request"; message: SimpleRequest }`

Defined in: [transport/src/protocol/simple.ts:212](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/simple.ts#L212)

Type guard for request messages.

#### Parameters

##### msg

[`ParsedMessage`](/api/transport/src/type-aliases/parsedmessage/)\<[`SimpleRequest`](/api/transport/src/interfaces/simplerequest/), [`SimpleResponseMessage`](/api/transport/src/type-aliases/simpleresponsemessage/), [`SimpleNotification`](/api/transport/src/interfaces/simplenotification/)\>

#### Returns

`msg is { kind: "request"; message: SimpleRequest }`

#### Implementation of

[`Protocol`](/api/transport/src/interfaces/protocol/).[`isRequest`](/api/transport/src/interfaces/protocol/#isrequest)

***

### isResponse()

> **isResponse**(`msg`): `msg is { kind: "response"; message: SimpleResponseMessage }`

Defined in: [transport/src/protocol/simple.ts:224](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/simple.ts#L224)

Type guard for response messages.

#### Parameters

##### msg

[`ParsedMessage`](/api/transport/src/type-aliases/parsedmessage/)\<[`SimpleRequest`](/api/transport/src/interfaces/simplerequest/), [`SimpleResponseMessage`](/api/transport/src/type-aliases/simpleresponsemessage/), [`SimpleNotification`](/api/transport/src/interfaces/simplenotification/)\>

#### Returns

`msg is { kind: "response"; message: SimpleResponseMessage }`

#### Implementation of

[`Protocol`](/api/transport/src/interfaces/protocol/).[`isResponse`](/api/transport/src/interfaces/protocol/#isresponse)

***

### parseMessage()

> **parseMessage**(`data`): [`ParsedMessage`](/api/transport/src/type-aliases/parsedmessage/)\<[`SimpleRequest`](/api/transport/src/interfaces/simplerequest/), [`SimpleResponseMessage`](/api/transport/src/type-aliases/simpleresponsemessage/), [`SimpleNotification`](/api/transport/src/interfaces/simplenotification/)\>

Defined in: [transport/src/protocol/simple.ts:163](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/simple.ts#L163)

Parses incoming data as simple protocol message.
Does not throw - returns 'invalid' kind for malformed messages.

#### Parameters

##### data

`unknown`

Raw incoming data

#### Returns

[`ParsedMessage`](/api/transport/src/type-aliases/parsedmessage/)\<[`SimpleRequest`](/api/transport/src/interfaces/simplerequest/), [`SimpleResponseMessage`](/api/transport/src/type-aliases/simpleresponsemessage/), [`SimpleNotification`](/api/transport/src/interfaces/simplenotification/)\>

ParsedMessage discriminated union

#### Implementation of

[`Protocol`](/api/transport/src/interfaces/protocol/).[`parseMessage`](/api/transport/src/interfaces/protocol/#parsemessage)
