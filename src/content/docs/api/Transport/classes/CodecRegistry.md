---
editUrl: false
next: false
prev: false
title: "CodecRegistry"
---

Defined in: [transport/src/serialization/registry.ts:18](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/registry.ts#L18)

Global codec registry for serialization codecs.

Provides a static registry to register and lookup codecs by name or content type.
Thread-safe in Node.js (single-threaded event loop).

## Example

```ts
import { CodecRegistry, JsonCodec } from '@procwire/transport';

CodecRegistry.register(new JsonCodec());
const codec = CodecRegistry.get('json');
```

## Constructors

### Constructor

> **new CodecRegistry**(): `CodecRegistry`

#### Returns

`CodecRegistry`

## Methods

### get()

> `static` **get**(`name`): [`SerializationCodec`](/api/transport/interfaces/serializationcodec/)\<`unknown`\> \| `undefined`

Defined in: [transport/src/serialization/registry.ts:89](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/registry.ts#L89)

Retrieves a codec by name.

#### Parameters

##### name

`string`

Codec name (e.g., 'json', 'raw')

#### Returns

[`SerializationCodec`](/api/transport/interfaces/serializationcodec/)\<`unknown`\> \| `undefined`

Codec instance or undefined if not found

#### Example

```ts
const codec = CodecRegistry.get('json');
if (codec) {
  const buffer = codec.serialize({ foo: 'bar' });
}
```

***

### getByContentType()

> `static` **getByContentType**(`contentType`): [`SerializationCodec`](/api/transport/interfaces/serializationcodec/)\<`unknown`\> \| `undefined`

Defined in: [transport/src/serialization/registry.ts:104](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/registry.ts#L104)

Retrieves a codec by content type.

#### Parameters

##### contentType

`string`

Content type (e.g., 'application/json')

#### Returns

[`SerializationCodec`](/api/transport/interfaces/serializationcodec/)\<`unknown`\> \| `undefined`

Codec instance or undefined if not found

#### Example

```ts
const codec = CodecRegistry.getByContentType('application/json');
```

***

### list()

> `static` **list**(): `string`[]

Defined in: [transport/src/serialization/registry.ts:119](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/registry.ts#L119)

Lists all registered codec names.

#### Returns

`string`[]

Array of codec names

#### Example

```ts
const names = CodecRegistry.list();
console.log(names); // ['json', 'raw']
```

***

### register()

> `static` **register**(`codec`): `void`

Defined in: [transport/src/serialization/registry.ts:34](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/registry.ts#L34)

Registers a serialization codec in the global registry.

#### Parameters

##### codec

[`SerializationCodec`](/api/transport/interfaces/serializationcodec/)

Codec to register

#### Returns

`void`

#### Throws

if a codec with the same name or content type already exists

#### Example

```ts
CodecRegistry.register(new JsonCodec());
CodecRegistry.register(new RawCodec());
```

***

### unregister()

> `static` **unregister**(`name`): `boolean`

Defined in: [transport/src/serialization/registry.ts:64](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/serialization/registry.ts#L64)

Unregisters a codec by name.

#### Parameters

##### name

`string`

Name of the codec to unregister

#### Returns

`boolean`

true if codec was found and removed, false otherwise

#### Example

```ts
CodecRegistry.unregister('json');
```
