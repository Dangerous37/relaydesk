import { setTimeout as sleep } from 'node:timers/promises';
import { Store } from './store.mjs';
import { intake, deliver, destination } from './relay.mjs';

const [command, arg] = process.argv.slice(2);
const store = new Store(process.env.RELAY_DB || 'relaydesk.sqlite');
if (command === 'serve') {
  const secret = process.env.RELAY_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('Set RELAY_SECRET to at least 32 bytes');
  const server = intake(store, secret);
  server.listen(Number(arg ?? 8090), '127.0.0.1', () => console.log('listening', server.address().port));
} else if (command === 'worker') {
  const url = destination(arg);
  for (;;) if (!await deliver(store, url)) await sleep(200);
} else if (command === 'dead') {
  console.log(JSON.stringify(store.dead(), null, 2));
} else {
  console.error('Usage: node cli.mjs serve [port] | worker <loopback-url> | dead');
  process.exitCode = 1;
}
