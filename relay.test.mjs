import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from './store.mjs';
import { deliver, destination } from './relay.mjs';
import { decode, decision } from './domain.mjs';

test('backoff and terminal states', () => {
  assert.deepEqual(decision(1,false,7), { state:'pending', due:1007 });
  assert.deepEqual(decision(2,false,7), { state:'pending', due:2007 });
  assert.equal(decision(3,false,7).state, 'dead');
  assert.equal(decision(3,true,7).state, 'delivered');
});

test('rejects unsupported envelopes and malformed UTF-8', () => {
  for (const raw of ['null', '{"id":"x","type":"other","data":{}}', '{"id":"x","type":"crm.updated","data":[]}', Buffer.from([255])]) {
    assert.throws(() => decode(Buffer.from(raw)));
  }
});

test('a transport failure stays pending until due', async () => {
  const store = new Store(':memory:');
  try {
    store.accept({ id:'synthetic' }, Buffer.from('{}'));
    await deliver(store, 'invalid url');
    assert.equal(store.next(0), undefined);
    assert.equal(store.next(Date.now()+2000).attempts, 1);
  } finally { store.db.close(); }
});

test('destination is restricted to a local HTTP receiver', () => {
  for (const url of ['https://127.0.0.1', 'http://example.invalid', 'http://name@127.0.0.1']) {
    assert.throws(() => destination(url));
  }
});
