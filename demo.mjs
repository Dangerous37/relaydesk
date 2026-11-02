import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { signature } from './relay.mjs';

const folder = await mkdtemp(join(tmpdir(), 'relaydesk-'));
const secret = randomBytes(32).toString('hex');
const env = { ...process.env, RELAY_DB: join(folder, 'demo.sqlite'), RELAY_SECRET: secret };
const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const children = new Set();
function start(...args) {
  const proc = spawn(process.execPath, [cli, ...args], { env, stdio: ['ignore', 'pipe', 'inherit'] });
  children.add(proc);
  proc.once('close', () => children.delete(proc));
  return proc;
}
async function stop(proc) {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  const closed = once(proc, 'close');
  proc.kill();
  await closed;
}
async function serve() {
  const proc = start('serve', '0');
  const [chunk] = await once(proc.stdout, 'data', { signal: AbortSignal.timeout(5000) });
  const port = /listening (\d+)/.exec(String(chunk))[1];
  return { proc, url: 'http://127.0.0.1:' + port + '/events' };
}
const calls = new Map();
const receiver = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const event = JSON.parse(Buffer.concat(chunks));
  assert.equal(req.headers['idempotency-key'], event.id);
  const count = (calls.get(event.id) || 0) + 1;
  calls.set(event.id, count);
  res.writeHead(event.type === 'booking.created' && count > 1 ? 204 : 503).end();
});

try {
  receiver.listen(0, '127.0.0.1');
  await once(receiver, 'listening');
  let service = await serve();
  async function post(raw, sig = signature(raw, secret)) {
    return (await fetch(service.url, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Relay-Signature': sig }, body: raw })).status;
  }
  const fixture = name => readFile(new URL(name + '.json', import.meta.url));
  const booking = await fixture('booking');
  const crm = await fixture('crm');
  assert.equal(await post(booking, '0'.repeat(64)), 401);
  assert.equal(await post('x'.repeat(16385)), 413);
  assert.equal(await post('{}'), 400);
  assert.equal(await post(booking), 202);
  assert.equal(await post(crm), 202);
  await stop(service.proc);
  service = await serve();
  assert.equal(await post(booking), 200);
  assert.equal(await post(String(booking) + ' '), 409);
  console.log('Restart verified: pending events retained, duplicate accepted, conflict rejected.');
  const worker = start('worker', 'http://127.0.0.1:' + receiver.address().port);
  const deadline = Date.now() + 12000;
  let dead;
  while (Date.now() < deadline) {
    if (calls.get('demo-crm') === 3) {
      const inspector = start('dead');
      let out = '';
      inspector.stdout.on('data', chunk => { out += chunk; });
      assert.equal((await once(inspector, 'close'))[0], 0);
      dead = JSON.parse(out);
      if (dead.length) break;
    }
    await sleep(100);
  }
  await stop(worker);
  assert.deepEqual(dead, [{ id: 'demo-crm', attempts: 3, outcome: '503' }]);
  assert.equal(calls.get('demo-booking'), 2);
  assert.equal(await post(crm), 200);
  console.log('Booking: 503 → 204. CRM dead letter:', JSON.stringify(dead[0]));
} finally {
  await Promise.all([...children].map(stop));
  if (receiver.listening) await new Promise(resolve => receiver.close(resolve));
  await rm(folder, { recursive: true, force: true });
}
