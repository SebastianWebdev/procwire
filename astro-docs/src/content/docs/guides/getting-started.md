---
title: Getting Started
description: Getting started guide for Procwire
sidebar:
  order: 0
---

## Current Status

Procwire v2.0 is under active development with significant API changes:

- **New binary protocol** for data plane (replaces JSON-RPC)
- **Builder pattern** for type-safe API
- **Response types**: none, ack, result, stream
- **Cancellation** with AbortController support
- **Target performance**: >1 GB/s for large payloads

## Installation

```bash
# Core packages (when v2.0 is released)
pnpm add @procwire/core @procwire/client

# Optional: codecs are included, but can install separately
pnpm add @procwire/codecs

# Low-level protocol (usually not needed directly)
pnpm add @procwire/protocol
```

## Quick Start

Documentation coming soon. For development progress, see the [GitHub repository](https://github.com/SebastianWebdev/ipc-bridge-core).
