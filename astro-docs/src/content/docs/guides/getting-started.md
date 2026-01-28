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
pnpm add @procwire/manager @procwire/client

# Optional codecs
pnpm add @procwire/codecs
```

## Quick Start

Documentation coming soon. For development progress, see the [GitHub repository](https://github.com/SebastianWebdev/ipc-bridge-core).
