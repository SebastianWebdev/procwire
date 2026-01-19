---
editUrl: false
next: false
prev: false
title: "Protocol"
---

Defined in: [transport/src/protocol/types.ts:48](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/types.ts#L48)

Protocol layer interface for request/response messaging.
Implementations: JSON-RPC 2.0, SimpleProtocol.

Generic type parameters represent the wire format of messages,
not application-level data types.

## Type Parameters

### TReq

`TReq` = `unknown`

Request message type (wire format)

### TRes

`TRes` = `unknown`

Response message type (wire format)

### TNotif

`TNotif` = `unknown`

Notification message type (wire format)

## Properties

### name

> `readonly` **name**: `string`

Defined in: [transport/src/protocol/types.ts:52](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/types.ts#L52)

Protocol name identifier.

***

### version

> `readonly` **version**: `string`

Defined in: [transport/src/protocol/types.ts:57](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/types.ts#L57)

Protocol version.

## Methods

### createErrorResponse()

> **createErrorResponse**(`id`, `error`): `TRes`

Defined in: [transport/src/protocol/types.ts:82](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/types.ts#L82)

Creates an error response message.

#### Parameters

##### id

[`RequestId`](/api/transport/type-aliases/requestid/)

Request ID this error corresponds to

##### error

[`ProtocolDataError`](/api/transport/interfaces/protocoldataerror/)

Error details

#### Returns

`TRes`

Wire format error response message

***

### createNotification()

> **createNotification**(`method`, `params?`): `TNotif`

Defined in: [transport/src/protocol/types.ts:90](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/types.ts#L90)

Creates a notification message (no response expected).

#### Parameters

##### method

`string`

Method name

##### params?

`unknown`

Optional parameters

#### Returns

`TNotif`

Wire format notification message

***

### createRequest()

> **createRequest**(`method`, `params?`, `id?`): `TReq`

Defined in: [transport/src/protocol/types.ts:66](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/types.ts#L66)

Creates a request message.

#### Parameters

##### method

`string`

Method name

##### params?

`unknown`

Optional parameters

##### id?

[`RequestId`](/api/transport/type-aliases/requestid/)

Optional request ID (auto-generated if not provided)

#### Returns

`TReq`

Wire format request message

***

### createResponse()

> **createResponse**(`id`, `result`): `TRes`

Defined in: [transport/src/protocol/types.ts:74](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/types.ts#L74)

Creates a success response message.

#### Parameters

##### id

[`RequestId`](/api/transport/type-aliases/requestid/)

Request ID this response corresponds to

##### result

`unknown`

Response result data

#### Returns

`TRes`

Wire format response message

***

### isNotification()

> **isNotification**(`msg`): `msg is { kind: "notification"; message: TNotif }`

Defined in: [transport/src/protocol/types.ts:118](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/types.ts#L118)

Type guard for notification messages.

#### Parameters

##### msg

[`ParsedMessage`](/api/transport/type-aliases/parsedmessage/)\<`TReq`, `TRes`, `TNotif`\>

#### Returns

`msg is { kind: "notification"; message: TNotif }`

***

### isRequest()

> **isRequest**(`msg`): `msg is { kind: "request"; message: TReq }`

Defined in: [transport/src/protocol/types.ts:104](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/types.ts#L104)

Type guard for request messages.

#### Parameters

##### msg

[`ParsedMessage`](/api/transport/type-aliases/parsedmessage/)\<`TReq`, `TRes`, `TNotif`\>

#### Returns

`msg is { kind: "request"; message: TReq }`

***

### isResponse()

> **isResponse**(`msg`): `msg is { kind: "response"; message: TRes }`

Defined in: [transport/src/protocol/types.ts:111](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/types.ts#L111)

Type guard for response messages.

#### Parameters

##### msg

[`ParsedMessage`](/api/transport/type-aliases/parsedmessage/)\<`TReq`, `TRes`, `TNotif`\>

#### Returns

`msg is { kind: "response"; message: TRes }`

***

### parseMessage()

> **parseMessage**(`data`): [`ParsedMessage`](/api/transport/type-aliases/parsedmessage/)\<`TReq`, `TRes`, `TNotif`\>

Defined in: [transport/src/protocol/types.ts:99](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/types.ts#L99)

Parses incoming message and determines its type.
Does not throw - returns 'invalid' kind for malformed messages.

#### Parameters

##### data

`unknown`

Raw incoming data

#### Returns

[`ParsedMessage`](/api/transport/type-aliases/parsedmessage/)\<`TReq`, `TRes`, `TNotif`\>

ParsedMessage discriminated union
