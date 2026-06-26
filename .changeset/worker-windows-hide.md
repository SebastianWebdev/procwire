---
"@procwire/runtime-core": minor
"@procwire/core": minor
"@procwire/bun-core": minor
---

Hide the worker's console window on Windows by default.

`Module.executable(command, args, options)` now accepts a `windowsHide` option,
and the parent passes it through to the spawn (Node `child_process.spawn` and
`Bun.spawn`). It defaults to `true`, so a packaged app (e.g. Electron) no longer
flashes a console window for each spawned worker — a Procwire worker is a
headless IPC child, so no console is wanted in normal use. The flag has no effect
on Linux/macOS. Pass `windowsHide: false` to spawn a worker with a visible
console for debugging.
