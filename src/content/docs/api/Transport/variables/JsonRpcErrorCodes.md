---
editUrl: false
next: false
prev: false
title: "JsonRpcErrorCodes"
---

> `const` **JsonRpcErrorCodes**: `object`

Defined in: [transport/src/protocol/jsonrpc.ts:8](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/jsonrpc.ts#L8)

JSON-RPC 2.0 error codes.

## Type Declaration

### INTERNAL\_ERROR

> `readonly` **INTERNAL\_ERROR**: `-32603` = `-32603`

Internal JSON-RPC error.

### INVALID\_PARAMS

> `readonly` **INVALID\_PARAMS**: `-32602` = `-32602`

Invalid method parameter(s).

### INVALID\_REQUEST

> `readonly` **INVALID\_REQUEST**: `-32600` = `-32600`

The JSON sent is not a valid Request object.

### METHOD\_NOT\_FOUND

> `readonly` **METHOD\_NOT\_FOUND**: `-32601` = `-32601`

The method does not exist / is not available.

### PARSE\_ERROR

> `readonly` **PARSE\_ERROR**: `-32700` = `-32700`

Invalid JSON was received by the server.

## See

https://www.jsonrpc.org/specification#error_object
