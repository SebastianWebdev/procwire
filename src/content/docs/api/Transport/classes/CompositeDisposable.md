---
editUrl: false
next: false
prev: false
title: "CompositeDisposable"
---

Defined in: [transport/src/utils/disposables.ts:31](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/utils/disposables.ts#L31)

Collects multiple unsubscribe functions and disposes them all at once.
Useful for cleanup in components/channels that manage multiple subscriptions.

## Constructors

### Constructor

> **new CompositeDisposable**(): `CompositeDisposable`

#### Returns

`CompositeDisposable`

## Methods

### add()

> **add**(`unsubscribe`): `void`

Defined in: [transport/src/utils/disposables.ts:39](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/utils/disposables.ts#L39)

Adds an unsubscribe function to the composite.
If already disposed, calls it immediately.

#### Parameters

##### unsubscribe

[`Unsubscribe`](/api/transport/type-aliases/unsubscribe/)

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Defined in: [transport/src/utils/disposables.ts:51](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/utils/disposables.ts#L51)

Disposes all collected unsubscribe functions.
Safe to call multiple times (idempotent).

#### Returns

`void`

***

### isDisposed()

> **isDisposed**(): `boolean`

Defined in: [transport/src/utils/disposables.ts:70](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/utils/disposables.ts#L70)

Returns true if already disposed.

#### Returns

`boolean`
