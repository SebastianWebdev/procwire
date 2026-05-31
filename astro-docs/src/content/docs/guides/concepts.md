---
title: Core Concepts
description: Core concepts for Procwire IPC library
---

# Core Concepts

## Dual-Channel Architecture

Procwire uses a dual-channel architecture to optimize for different use cases:

| Channel           | Transport                | Protocol     | Characteristics                             |
| ----------------- | ------------------------ | ------------ | ------------------------------------------- |
| **Control Plane** | stdio                    | JSON-RPC 2.0 | Small messages (<1KB), rare, infrastructure |
| **Data Plane**    | Named Pipe / Unix Socket | Binary       | Large messages (MB/GB), frequent, user data |

## Why Two Channels?

### Control Plane (stdio)

- Handshake at startup
- Heartbeat (health checks)
- Shutdown commands
- Schema exchange
- JSON-RPC is fine here - messages are small and rare

### Data Plane (named pipe)

- User data: embeddings, vectors, images
- Computation results
- Streaming data
- **Binary protocol required** - JSON-RPC would destroy performance

## Key Insight

> JSON-RPC on Data Plane = ~30 MB/s
> Binary Protocol on Data Plane = ~2.5 GB/s

This 80x difference is why Procwire uses a binary wire format on the data plane.

## Highlights

- **Binary wire format** with 11-byte header
- **Zero JSON serialization** for user data
- **Zero-copy accumulation** for large payloads
- **Schema-first design** - parent defines the contract

More documentation is on the way.
