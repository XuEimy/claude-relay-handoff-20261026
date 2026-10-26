import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
export const id = () => randomUUID();
export function openStore(path) {
  if (path !== ":memory:")
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ":memory:") chmodSync(path, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user',balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0),disabled INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS channels(id TEXT PRIMARY KEY,name TEXT NOT NULL,base_url TEXT NOT NULL,api_key TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS models(id TEXT PRIMARY KEY,name TEXT NOT NULL,upstream_id TEXT NOT NULL,channel_id TEXT NOT NULL REFERENCES channels(id),input_rate REAL NOT NULL,output_rate REAL NOT NULL,max_output INTEGER NOT NULL DEFAULT 2048,enabled INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,role TEXT NOT NULL,content TEXT NOT NULL,created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),amount INTEGER NOT NULL,kind TEXT NOT NULL,note TEXT NOT NULL,created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS usage(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),model TEXT NOT NULL,input_tokens INTEGER NOT NULL DEFAULT 0,output_tokens INTEGER NOT NULL DEFAULT 0,cost INTEGER NOT NULL DEFAULT 0,reserved INTEGER NOT NULL,status TEXT NOT NULL,created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS vouchers(hash TEXT PRIMARY KEY,label TEXT NOT NULL,amount INTEGER NOT NULL,used_by TEXT,created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),provider TEXT NOT NULL,amount INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',transaction_id TEXT,created TEXT NOT NULL,paid_at TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS paid_transaction ON orders(provider,transaction_id) WHERE transaction_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,detail TEXT NOT NULL,created TEXT NOT NULL);
  `);
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const tx = (fn) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      db.exec("COMMIT");
      return out;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const ledger = (user, amount, kind, note) => {
    run("UPDATE users SET balance=balance+? WHERE id=?", amount, user);
    run(
      "INSERT INTO ledger VALUES(?,?,?,?,?,?)",
      id(),
      user,
      amount,
      kind,
      note,
      new Date().toISOString(),
    );
  };
  // Interrupted requests are released on restart; uncertain upstream costs are borne by the operator.
  tx(() => {
    for (const u of all("SELECT * FROM usage WHERE status='streaming'")) {
      ledger(u.user_id, u.reserved, "release", "服务重启，释放预留额度");
      run("UPDATE usage SET status='interrupted',reserved=0 WHERE id=?", u.id);
    }
  });
  return { db, get, all, run, tx, ledger };
}
