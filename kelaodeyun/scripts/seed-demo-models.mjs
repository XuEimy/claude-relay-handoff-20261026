// Presentation data for the isolated local demo. Never touches the primary DB.
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
export function seedDemoModels() {
  if (process.env.NODE_ENV === "production")
    throw Error("Demo data is local only");
  const path = new URL("../data/demo.db", import.meta.url);
  if (!existsSync(path)) return;
  const db = new DatabaseSync(path);
  const channel = db
    .prepare("SELECT id FROM channels WHERE enabled=1 LIMIT 1")
    .get();
  if (!channel) {
    db.close();
    return;
  }
  db.exec("PRAGMA busy_timeout=5000; BEGIN IMMEDIATE");
  try {
    const save = db.prepare(
      "INSERT INTO models VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,input_rate=excluded.input_rate,output_rate=excluded.output_rate,enabled=1",
    );
    for (const [key, name, input, output, max] of [
      ["haiku", "Claude Haiku 5.5", 8, 40, 4096],
      ["sonnet", "Claude Sonnet 5.5", 24, 120, 8192],
      ["opus", "Claude Opus 5.5", 40, 200, 16384],
    ])
      save.run(
        "demo-" + key,
        name,
        "demo-" + key,
        channel.id,
        input,
        output,
        max,
        1,
      );
    db.prepare(
      "UPDATE models SET enabled=0 WHERE name='演示助手（固定回复）'",
    ).run();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}
