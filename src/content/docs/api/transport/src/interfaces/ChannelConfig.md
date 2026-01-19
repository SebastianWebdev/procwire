---
editUrl: false
next: false
prev: false
title: "ChannelConfig"
---

Defined in: [transport/src/process/types.ts:49](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L49)

Channel configuration for control or data channels.

## Properties

### framing?

> `optional` **framing**: [`FramingCodec`](/api/transport/src/interfaces/framingcodec/) \| `"line-delimited"` \| `"length-prefixed"`

Defined in: [transport/src/process/types.ts:54](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L54)

Framing codec: predefined name or custom codec.

#### Default

```ts
'line-delimited' for control, 'length-prefixed' for data
```

***

### protocol?

> `optional` **protocol**: `"jsonrpc"` \| `"simple"` \| [`Protocol`](/api/transport/src/interfaces/protocol/)\<`unknown`, `unknown`, `unknown`\>

Defined in: [transport/src/process/types.ts:66](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L66)

Protocol: predefined name or custom protocol.

#### Default

```ts
'jsonrpc'
```

***

### responseAccessor?

> `optional` **responseAccessor**: [`ResponseAccessor`](/api/transport/src/interfaces/responseaccessor/)

Defined in: [transport/src/process/types.ts:77](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L77)

Custom response accessor for protocol-specific response handling.

***

### serialization?

> `optional` **serialization**: `"json"` \| `"raw"` \| [`SerializationCodec`](/api/transport/src/interfaces/serializationcodec/)\<`unknown`\>

Defined in: [transport/src/process/types.ts:60](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L60)

Serialization codec: predefined name or custom codec.

#### Default

```ts
'json'
```

***

### timeoutMs?

> `optional` **timeoutMs**: `number`

Defined in: [transport/src/process/types.ts:72](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/process/types.ts#L72)

Request timeout in milliseconds.

#### Default

```ts
30000
```
