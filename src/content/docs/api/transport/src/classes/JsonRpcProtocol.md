---
editUrl: false
next: false
prev: false
title: "JsonRpcProtocol"
---

Defined in: [transport/src/protocol/jsonrpc.ts:77](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/jsonrpc.ts#L77)

JSON-RPC 2.0 protocol implementation.

Follows the JSON-RPC 2.0 specification for request/response messaging.
Provides strict validation and automatic ID generation.

## Example

```ts
const protocol = new JsonRpcProtocol();
const req = protocol.createRequest('getUser', { id: 42 });
const res = protocol.createResponse(req.id, { name: 'Alice' });
```

## Implements

- [`Protocol`](/api/transport/src/interfaces/protocol/)\<[`JsonRpcRequest`](/api/transport/src/interfaces/jsonrpcrequest/), [`JsonRpcResponseMessage`](/api/transport/src/type-aliases/jsonrpcresponsemessage/), [`JsonRpcNotification`](/api/transport/src/interfaces/jsonrpcnotification/)\>

## Constructors

### Constructor

> **new JsonRpcProtocol**(): `JsonRpcProtocol`

#### Returns

`JsonRpcProtocol`

## Properties

### name

> `readonly` **name**: `"jsonrpc"` = `"jsonrpc"`

Defined in: [transport/src/protocol/jsonrpc.ts:80](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/jsonrpc.ts#L80)

Protocol name identifier.

#### Implementation of

[`Protocol`](/api/transport/src/interfaces/protocol/).[`name`](/api/transport/src/interfaces/protocol/#name)

***

### version

> `readonly` **version**: `"2.0"` = `"2.0"`

Defined in: [transport/src/protocol/jsonrpc.ts:81](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/jsonrpc.ts#L81)

Protocol version.

#### Implementation of

[`Protocol`](/api/transport/src/interfaces/protocol/).[`version`](/api/transport/src/interfaces/protocol/#version)

## Methods

### createErrorResponse()

> **createErrorResponse**(`id`, `error`): [`JsonRpcErrorResponse`](/api/transport/src/interfaces/jsonrpcerrorresponse/)

Defined in: [transport/src/protocol/jsonrpc.ts:136](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/jsonrpc.ts#L136)

Creates a JSON-RPC 2.0 error response message.

#### Parameters

##### id

[`RequestId`](/api/transport/src/type-aliases/requestid/)

Request ID

##### error

[`ProtocolDataError`](/api/transport/src/interfaces/protocoldataerror/)

Error details

#### Returns

[`JsonRpcErrorResponse`](/api/transport/src/interfaces/jsonrpcerrorresponse/)

JSON-RPC error response object

#### Implementation of

[`Protocol`](/api/transport/src/interfaces/protocol/).[`createErrorResponse`](/api/transport/src/interfaces/protocol/#createerrorresponse)

***

### createNotification()

> **createNotification**(`method`, `params?`): [`JsonRpcNotification`](/api/transport/src/interfaces/jsonrpcnotification/)

Defined in: [transport/src/protocol/jsonrpc.ts:152](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/jsonrpc.ts#L152)

Creates a JSON-RPC 2.0 notification message.

#### Parameters

##### method

`string`

Method name (must be non-empty string)

##### params?

`unknown`

Optional parameters

#### Returns

[`JsonRpcNotification`](/api/transport/src/interfaces/jsonrpcnotification/)

JSON-RPC notification object

#### Throws

if method is invalid

#### Implementation of

[`Protocol`](/api/transport/src/interfaces/protocol/).[`createNotification`](/api/transport/src/interfaces/protocol/#createnotification)

***

### createRequest()

> **createRequest**(`method`, `params?`, `id?`): [`JsonRpcRequest`](/api/transport/src/interfaces/jsonrpcrequest/)

Defined in: [transport/src/protocol/jsonrpc.ts:94](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/jsonrpc.ts#L94)

Creates a JSON-RPC 2.0 request message.

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

[`JsonRpcRequest`](/api/transport/src/interfaces/jsonrpcrequest/)

JSON-RPC request object

#### Throws

if method is invalid

#### Implementation of

[`Protocol`](/api/transport/src/interfaces/protocol/).[`createRequest`](/api/transport/src/interfaces/protocol/#createrequest)

***

### createResponse()

> **createResponse**(`id`, `result`): [`JsonRpcResponse`](/api/transport/src/interfaces/jsonrpcresponse/)

Defined in: [transport/src/protocol/jsonrpc.ts:121](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/jsonrpc.ts#L121)

Creates a JSON-RPC 2.0 success response message.

#### Parameters

##### id

[`RequestId`](/api/transport/src/type-aliases/requestid/)

Request ID

##### result

`unknown`

Response result

#### Returns

[`JsonRpcResponse`](/api/transport/src/interfaces/jsonrpcresponse/)

JSON-RPC response object

#### Implementation of

[`Protocol`](/api/transport/src/interfaces/protocol/).[`createResponse`](/api/transport/src/interfaces/protocol/#createresponse)

***

### isNotification()

> **isNotification**(`msg`): `msg is { kind: "notification"; message: JsonRpcNotification }`

Defined in: [transport/src/protocol/jsonrpc.ts:251](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/jsonrpc.ts#L251)

Type guard for notification messages.

#### Parameters

##### msg

[`ParsedMessage`](/api/transport/src/type-aliases/parsedmessage/)\<[`JsonRpcRequest`](/api/transport/src/interfaces/jsonrpcrequest/), [`JsonRpcResponseMessage`](/api/transport/src/type-aliases/jsonrpcresponsemessage/), [`JsonRpcNotification`](/api/transport/src/interfaces/jsonrpcnotification/)\>

#### Returns

`msg is { kind: "notification"; message: JsonRpcNotification }`

#### Implementation of

[`Protocol`](/api/transport/src/interfaces/protocol/).[`isNotification`](/api/transport/src/interfaces/protocol/#isnotification)

***

### isRequest()

> **isRequest**(`msg`): `msg is { kind: "request"; message: JsonRpcRequest }`

Defined in: [transport/src/protocol/jsonrpc.ts:227](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/jsonrpc.ts#L227)

Type guard for request messages.

#### Parameters

##### msg

[`ParsedMessage`](/api/transport/src/type-aliases/parsedmessage/)\<[`JsonRpcRequest`](/api/transport/src/interfaces/jsonrpcrequest/), [`JsonRpcResponseMessage`](/api/transport/src/type-aliases/jsonrpcresponsemessage/), [`JsonRpcNotification`](/api/transport/src/interfaces/jsonrpcnotification/)\>

#### Returns

`msg is { kind: "request"; message: JsonRpcRequest }`

#### Implementation of

[`Protocol`](/api/transport/src/interfaces/protocol/).[`isRequest`](/api/transport/src/interfaces/protocol/#isrequest)

***

### isResponse()

> **isResponse**(`msg`): `msg is { kind: "response"; message: JsonRpcResponseMessage }`

Defined in: [transport/src/protocol/jsonrpc.ts:239](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/jsonrpc.ts#L239)

Type guard for response messages.

#### Parameters

##### msg

[`ParsedMessage`](/api/transport/src/type-aliases/parsedmessage/)\<[`JsonRpcRequest`](/api/transport/src/interfaces/jsonrpcrequest/), [`JsonRpcResponseMessage`](/api/transport/src/type-aliases/jsonrpcresponsemessage/), [`JsonRpcNotification`](/api/transport/src/interfaces/jsonrpcnotification/)\>

#### Returns

`msg is { kind: "response"; message: JsonRpcResponseMessage }`

#### Implementation of

[`Protocol`](/api/transport/src/interfaces/protocol/).[`isResponse`](/api/transport/src/interfaces/protocol/#isresponse)

***

### parseMessage()

> **parseMessage**(`data`): [`ParsedMessage`](/api/transport/src/type-aliases/parsedmessage/)\<[`JsonRpcRequest`](/api/transport/src/interfaces/jsonrpcrequest/), [`JsonRpcResponseMessage`](/api/transport/src/type-aliases/jsonrpcresponsemessage/), [`JsonRpcNotification`](/api/transport/src/interfaces/jsonrpcnotification/)\>

Defined in: [transport/src/protocol/jsonrpc.ts:176](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/jsonrpc.ts#L176)

Parses incoming data as JSON-RPC 2.0 message.
Does not throw - returns 'invalid' kind for malformed messages.

#### Parameters

##### data

`unknown`

Raw incoming data

#### Returns

[`ParsedMessage`](/api/transport/src/type-aliases/parsedmessage/)\<[`JsonRpcRequest`](/api/transport/src/interfaces/jsonrpcrequest/), [`JsonRpcResponseMessage`](/api/transport/src/type-aliases/jsonrpcresponsemessage/), [`JsonRpcNotification`](/api/transport/src/interfaces/jsonrpcnotification/)\>

ParsedMessage discriminated union

#### Implementation of

[`Protocol`](/api/transport/src/interfaces/protocol/).[`parseMessage`](/api/transport/src/interfaces/protocol/#parsemessage)
