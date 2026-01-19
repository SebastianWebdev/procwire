---
editUrl: false
next: false
prev: false
title: "ParsedMessage"
---

> **ParsedMessage**\<`TReq`, `TRes`, `TNotif`\> = \{ `kind`: `"request"`; `message`: `TReq`; \} \| \{ `kind`: `"response"`; `message`: `TRes`; \} \| \{ `kind`: `"notification"`; `message`: `TNotif`; \} \| \{ `error`: [`ProtocolDataError`](/api/transport/interfaces/protocoldataerror/); `kind`: `"invalid"`; `raw`: `unknown`; \}

Defined in: [transport/src/protocol/types.ts:31](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/protocol/types.ts#L31)

Parsed message discriminated union.
Represents the result of parsing an incoming protocol message.

## Type Parameters

### TReq

`TReq` = `unknown`

### TRes

`TRes` = `unknown`

### TNotif

`TNotif` = `unknown`
