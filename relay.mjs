import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { decode, limit } from './domain.mjs';

export function signature(raw, secret) {
  return createHmac('sha256', secret).update(raw).digest('hex');
}

export function intake(store, secret) {
  return http.createServer({ requestTimeout: 10000, maxHeaderSize: 8192 }, async (req, res) => {
    const end = status => { res.writeHead(status, { Connection: 'close' }); res.end(); };
    if (req.method !== 'POST' || req.url !== '/events') return end(404);
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') return end(415);
    const length = Number(req.headers['content-length']);
    if (!Number.isSafeInteger(length) || req.headers['transfer-encoding']) return end(411);
    if (length > limit) return end(413);
    const sig = req.headers['x-relay-signature'] ?? '';
    if (!/^[a-f0-9]{64}$/.test(sig)) return end(401);
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks);
      if (!timingSafeEqual(Buffer.from(sig), Buffer.from(signature(raw, secret)))) return end(401);
      let event;
      try { event = decode(raw); } catch { return end(400); }
      end(store.accept(event, raw));
    } catch { end(503); }
  });
}

export function destination(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password) {
    throw new Error('Receiver must use HTTP on 127.0.0.1');
  }
  return url;
}

export async function deliver(store, url) {
  const row = store.next(Date.now());
  if (!row) return false;
  let outcome;
  try {
    const response = await fetch(url, { method: 'POST', redirect: 'manual',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': row.id },
      body: row.raw, signal: AbortSignal.timeout(3000) });
    outcome = String(response.status);
    await response.body?.cancel();
  } catch { outcome = 'transport'; }
  store.finish(row, outcome, Date.now());
  return true;
}
