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

- [`TransportEvents`](/api/transport/interfaces/transportevents/)
- [`TransportServerEvents`](/api/transport/interfaces/transportserverevents/)
- [`ChannelEvents`](/api/transport/interfaces/channelevents/)
- [`ProcessManagerEvents`](/api/transport/interfaces/processmanagerevents/)
- [`ProcessHandleEvents`](/api/transport/interfaces/processhandleevents/)

## Indexable

\[`event`: `string`\]: `unknown`
