---
editUrl: false
next: false
prev: false
title: "EventMap"
---

Defined in: [transport/src/utils/events.ts:12](https://github.com/SebastianWebdev/aspect-ipc/blob/eb2cd653a40fbf19409bad4ec132efda8c55ba0e/transport/src/utils/events.ts#L12)

Map of event names to their payload types.
Usage: interface MyEvents extends EventMap { 'data': Buffer; 'error': Error; }

## Extended by

- [`TransportEvents`](/api/transport/src/interfaces/transportevents/)
- [`TransportServerEvents`](/api/transport/src/interfaces/transportserverevents/)
- [`ChannelEvents`](/api/transport/src/interfaces/channelevents/)
- [`ProcessManagerEvents`](/api/transport/src/interfaces/processmanagerevents/)
- [`ProcessHandleEvents`](/api/transport/src/interfaces/processhandleevents/)

## Indexable

\[`event`: `string`\]: `unknown`
