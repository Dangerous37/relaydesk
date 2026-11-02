import { DatabaseSync } from 'node:sqlite';
import { decision } from './domain.mjs';

export class Store {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000;
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY, raw BLOB NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0, due INTEGER NOT NULL DEFAULT 0, outcome TEXT);
      CREATE INDEX IF NOT EXISTS queue ON events(state,due);`);
  }
  accept(event, raw) {
    const result = this.db.prepare('INSERT INTO events(id,raw) VALUES (?,?) ON CONFLICT(id) DO NOTHING').run(event.id, raw);
    if (result.changes) return 202;
    const prior = this.db.prepare('SELECT raw FROM events WHERE id=?').get(event.id);
    return raw.equals(prior.raw) ? 200 : 409;
  }
  next(now) {
    return this.db.prepare("SELECT id,raw,attempts FROM events WHERE state='pending' AND due<=? ORDER BY due,rowid LIMIT 1").get(now);
  }
  finish(row, outcome, now) {
    const attempt = row.attempts + 1;
    const { state, due } = decision(attempt, /^2\d\d$/.test(outcome), now);
    this.db.prepare('UPDATE events SET state=?,due=?,attempts=?,outcome=? WHERE id=?').run(state,due,attempt,outcome,row.id);
  }
  dead() {
    return this.db.prepare("SELECT id,attempts,outcome FROM events WHERE state='dead' ORDER BY rowid").all();
  }
}
