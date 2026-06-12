/**
 * E2E fixture: a child that traps SIGTERM and never exits on its own, and
 * never sends $init. Pins D8: every "force" kill in the Bun manager must use
 * SIGKILL - a bare kill() (SIGTERM) leaves this child alive forever, which is
 * exactly what a hung production child with a SIGTERM handler looks like.
 *
 * Prints TRAP-READY once the handler is installed so tests can synchronize.
 */
process.on("SIGTERM", () => {
  // Refuse to die.
});

console.log("TRAP-READY");

setInterval(() => {
  // Keep the event loop alive indefinitely.
}, 60_000);
