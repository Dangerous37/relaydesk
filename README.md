# RelayDesk

**[Open the interactive delivery lab](https://dangerous37.github.io/relaydesk/)**. Queue a booking, crash the worker after the receiver commits, then retry. Turn receiver deduplication off and see why one queued event can create two appointments. The lab uses a browser service worker and IndexedDB. The Node.js drill below exercises the SQLite implementation.

A booking system times out waiting for a webhook acknowledgment and sends the same booking again. RelayDesk gives the sender a durable receipt, then delivers the event to a local CRM adapter on a separate retry schedule.

## Try the failure drill

Use Node.js 24.x (tested with 24.14.1) and npm. SQLite, HTTP, HMAC and tests use Node's standard library. Node may print an experimental SQLite warning.

```sh
npm ci --offline
npm test
npm run demo
```

The demo starts real intake and receiver processes/services on ephemeral loopback ports and creates a temporary database. It signs two synthetic fixtures, stops and restarts intake, then resubmits the booking. The receiver returns 503 once for the booking and always for the CRM update. Assertions check delivery counts and the dead-letter report. The temporary database is removed on exit.

## Run your own queue

Set RELAY_SECRET to a random shared secret of at least 32 bytes through your shell environment. Set RELAY_DB to an absolute SQLite path when running commands from different directories. Start these in separate terminals with the same database:

```sh
node cli.mjs serve 8090
node cli.mjs worker http://127.0.0.1:8091/inbox
```

Supply your own local receiver on port 8091. Sign the exact bytes sent to POST /events as specified in [CONTRACT.md](CONTRACT.md). Use opaque, non-sensitive event IDs. Inspect exhausted deliveries with `node cli.mjs dead`. It prints IDs, attempt counts and status codes or the word transport. The demo contains a runnable signed sender and receiver.

## Delivery guarantees and limits

SQLite commits the receipt and pending delivery in one insert. A repeated ID with different bytes is a conflict, even when only whitespace differs. A worker records the result after the HTTP call. If it stops between a receiver side effect and that update, the event can be sent again. Use the Idempotency-Key at the receiver and commit that key with its side effect. Three recorded failures exhaust the retry budget. Eventual success is not guaranteed.

Run one worker per database. No worker leasing, high availability, automatic purge or dead-letter replay is implemented. IDs are retained with their payloads. SQLite holds plaintext request bodies, so restrict filesystem access. The HMAC authenticates intake bytes without a freshness window. The destination is fixed per worker, loopback HTTP only, with redirects disabled. This workbench uses synthetic data and has no vendor account integrations or production deployment.

## Code map

`domain.mjs` validates envelopes and decides retry timing. `store.mjs` persists state. `relay.mjs` adapts HTTP requests and responses to the store port. `cli.mjs` wires the processes together.

## Resumen en español

RelayDesk recibe eventos firmados de reservas y CRM, reconoce duplicados y conserva las entregas pendientes aunque se cierre el proceso. Ejecuta `npm run demo` para observar una reserva que se recupera tras un fallo y una actualización de CRM que agota sus tres intentos. Todo funciona en tu equipo con datos sintéticos.
