// Simple echo worker for testing stdio transport
// Reads from stdin and writes back to stdout

process.stdin.on('data', (data) => {
  process.stdout.write(data);
});

process.on('SIGTERM', () => {
  process.exit(0);
});

// Signal ready
process.stdout.write('READY\n');
