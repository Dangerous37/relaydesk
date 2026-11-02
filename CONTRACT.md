# RelayDesk v1 contract
POST /events accepts UTF-8 JSON up to 16 KiB, with Content-Length and no transfer encoding. Fields are id (1–80 ASCII letters, digits, underscores or hyphens), type (booking.created or crm.updated) and data (object). The id namespace is shared across sources.

X-Relay-Signature is the lowercase hex HMAC-SHA256 of the exact request bytes with the shared UTF-8 secret. A new committed event returns 202. Identical signed bytes under the same ID return 200 without requeueing, including after terminal failure. Different bytes under an existing ID return 409. Authentication failures return 401, malformed envelopes 400, oversized payloads 413 and unsupported media types 415.

Worker POSTs the original bytes to one configured loopback HTTP endpoint with Idempotency-Key equal to the event id. Any 2xx completes delivery. Other statuses or transport errors retry after 1 and 2 seconds, then enter dead state on the third recorded failure. Inspect locally via CLI. A worker interruption before acknowledgment permits redelivery.

Storage port: accept(event, raw) returns HTTP status; next(now) returns a due envelope or undefined; finish(row, outcome, now) records a delivery decision. One worker per database is supported.
