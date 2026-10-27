import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import { openStore } from "../lib/store.mjs";
import { createCodeService } from "../lib/code-service.mjs";

async function harness(t, options = {}) {
  const root = await fs.mkdtemp(
    join(await fs.realpath(tmpdir()), "code-service-"),
  );
  const store = openStore(":memory:");
  const a = { id: randomUUID() },
    b = { id: randomUUID() };
  for (const user of [a, b])
    store.run(
      "INSERT INTO users VALUES(?,?,?,?,?,?,?,?)",
      user.id,
      user.id + "@test.com",
      "User",
      "unused",
      "user",
      0,
      0,
      new Date().toISOString(),
    );
  const service = createCodeService({
    store,
    env: { CODE_WORKSPACE_ROOT: root, CODE_DEMO: "1", ...options.env },
    runner: options.runner,
  });
  const server = http.createServer(async (req, res) => {
    try {
      let input = {};
      if (["POST", "PUT"].includes(req.method)) {
        let body = "";
        for await (const part of req) body += part;
        input = JSON.parse(body || "{}");
      }
      if (
        !(await service.handle(
          req,
          res,
          req.headers["x-user"] === "b" ? b : a,
          new URL(req.url, "http://local").pathname,
          input,
        ))
      )
        res.writeHead(404).end();
    } catch (e) {
      res.writeHead(e.status || 500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (
    path,
    input,
    method = input === undefined ? "GET" : "POST",
    user = "a",
  ) => {
    const response = await fetch(base + "/api/code" + path, {
      method,
      headers: { "Content-Type": "application/json", "x-user": user },
      ...(input !== undefined ? { body: JSON.stringify(input) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };
  const project = async (name) =>
    (await call("/projects", { name: name || "测试项目" })).data.project;
  const session = async (p) =>
    (await call("/projects/" + p.id + "/sessions", {})).data.session;
  const until = async (s, predicate) => {
    for (let i = 0; i < 200; i++) {
      const value = (await call("/sessions/" + s.id)).data;
      if (predicate(value)) return value;
      await wait(15);
    }
    throw Error("timed out");
  };
  t.after(async () => {
    await service.close();
    server.closeAllConnections();
    await new Promise((ok) => server.close(ok));
    store.db.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  return { call, project, session, until, base, root, a, b, store, service };
}

test("project isolation, text editing with conflict detection, real baseline changes", async (t) => {
  const h = await harness(t),
    p = await h.project();
  assert.equal((await h.call("/status")).data.mode, "demo");
  assert.equal((await h.call("/projects")).data.projects.length, 1);
  const prefix = "/projects/" + p.id;
  assert.equal((await h.call(prefix + "/tree")).data.files.length, 2);
  assert.equal(
    (await h.call(prefix + "/tree", undefined, "GET", "b")).status,
    404,
  );
  const file = (await h.call(prefix + "/file?path=index.html")).data;
  const saved = await h.call(
    prefix + "/file",
    { ...file, content: "<h1>changed</h1>" },
    "PUT",
  );
  assert.equal(saved.status, 200);
  assert.notEqual(saved.data.version, file.version);
  assert.equal(
    (await h.call(prefix + "/file", { ...file, content: "stale" }, "PUT"))
      .status,
    409,
  );
  const changes = (await h.call(prefix + "/changes")).data.files;
  assert.equal(changes.length, 1);
  assert.equal(changes[0].path, "index.html");
  assert.equal(changes[0].before, file.content);
  assert.equal(changes[0].after, "<h1>changed</h1>");
});

test("traversal, hidden secrets, binary files and symlinks are rejected", async (t) => {
  const h = await harness(t),
    p = await h.project(),
    prefix = "/projects/" + p.id;
  for (const name of [
    "../README.md",
    "/etc/passwd",
    ".env",
    ".npmrc",
    "nested/../../README.md",
    "a\\b",
  ])
    assert.notEqual(
      (await h.call(prefix + "/file?path=" + encodeURIComponent(name))).status,
      200,
    );
  await fs.symlink("/etc/passwd", join(h.root, h.a.id, p.id, "outside.txt"));
  assert.equal((await h.call(prefix + "/file?path=outside.txt")).status, 403);
  assert.ok(
    !(await h.call(prefix + "/tree")).data.files.some(
      (f) => f.path === "outside.txt",
    ),
  );
  await fs.writeFile(
    join(h.root, h.a.id, p.id, "binary.dat"),
    Buffer.from([0, 1, 2]),
  );
  assert.equal((await h.call(prefix + "/file?path=binary.dat")).status, 415);
});

test("demo approval writes actual file, replays SSE, preserves session across refresh", async (t) => {
  const h = await harness(t),
    p = await h.project(),
    s = await h.session(p),
    prefix = "/sessions/" + s.id;
  assert.equal(
    (await h.call(prefix + "/run", { prompt: "重新设计首页", model: "sonnet" }))
      .status,
    202,
  );
  const waiting = await h.until(
    s,
    (value) => value.session.state === "waiting",
  );
  const approval = waiting.events.find((e) => e.type === "approval");
  assert.equal(approval.data.tool, "Write");
  assert.equal(approval.data.preview.path, "index.html");
  assert.ok(approval.data.preview.before.includes("你好，世界"));
  assert.ok(approval.data.preview.after.includes("让想法，成为作品"));
  assert.equal(
    (await h.call("/projects/" + p.id + "/file?path=index.html")).data.content,
    approval.data.preview.before,
  );
  assert.equal(
    (
      await h.call(
        prefix + "/approval",
        { id: approval.data.id, allow: true },
        "POST",
        "b",
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await h.call(
        "/projects/" + p.id + "/file",
        { path: "index.html", content: "x", version: "x" },
        "PUT",
      )
    ).status,
    409,
  );
  assert.equal(
    (await h.call(prefix + "/approval", { id: approval.data.id, allow: true }))
      .status,
    200,
  );
  const done = await h.until(s, (value) => value.session.state === "complete");
  assert.ok(done.events.some((e) => e.type === "done"));
  assert.ok(done.events.some((e) => e.type === "approval_resolved"));
  assert.ok(
    (
      await h.call("/projects/" + p.id + "/file?path=index.html")
    ).data.content.includes("让想法，成为作品"),
  );
  const replay = await fetch(
    h.base + "/api/code" + prefix + "/events?after=" + approval.seq,
  );
  assert.equal(
    replay.headers.get("content-type"),
    "text/event-stream; charset=utf-8",
  );
  const text = await replay.text();
  assert.ok(text.includes("event: code"));
  assert.ok(text.includes('"type":"done"'));
  assert.ok(!text.includes('"type":"approval"'));
  assert.equal(
    (await h.call(prefix + "/approval", { id: approval.data.id, allow: true }))
      .status,
    409,
  );
  assert.equal((await h.call(prefix, undefined, "GET", "b")).status, 404);
});

test("denial preserves file, stopped pending task releases user lock, plan has no writes", async (t) => {
  const h = await harness(t),
    p = await h.project(),
    s = await h.session(p),
    prefix = "/sessions/" + s.id;
  await h.call(prefix + "/run", { prompt: "更新首页" });
  const waiting = await h.until(s, (v) => v.session.state === "waiting");
  assert.equal(
    (await h.call(prefix + "/run", { prompt: "重复任务" })).status,
    409,
  );
  await h.call(prefix + "/approval", {
    id: waiting.events.find((e) => e.type === "approval").data.id,
    allow: false,
  });
  await h.until(s, (v) => v.session.state === "complete");
  assert.equal(
    (await h.call("/projects/" + p.id + "/changes")).data.files.length,
    0,
  );
  await h.call(prefix + "/run", { prompt: "再次更新" });
  await h.until(s, (v) => v.session.state === "waiting");
  await h.call(prefix + "/stop", {});
  await h.until(s, (v) => v.session.state === "stopped");
  assert.equal(
    (await h.call(prefix + "/run", { prompt: "制定计划", mode: "plan" }))
      .status,
    202,
  );
  await h.until(s, (v) => v.session.state === "complete");
  assert.equal(
    (await h.call("/projects/" + p.id + "/changes")).data.files.length,
    0,
  );
});

test("SDK normalization, resume, hook boundary, structured questions and safe failures", async (t) => {
  let round = 0,
    resumed;
  async function* runner(args) {
    round++;
    resumed = args.resume;
    yield { type: "system", subtype: "init", session_id: "cli-owned-session" };
    const denied = await args.preToolUse({
      tool_name: "Read",
      tool_input: { file_path: "/etc/passwd" },
    });
    assert.equal(denied.hookSpecificOutput.permissionDecision, "deny");
    assert.equal(
      (
        await args.preToolUse({
          tool_name: "Write",
          tool_input: { file_path: join(args.cwd, "index.html") },
        })
      ).hookSpecificOutput.permissionDecision,
      "ask",
    );
    if (round === 2) throw Error("secret-token-that-must-not-leak");
    const answer = await args.canUseTool(
      "AskUserQuestion",
      {
        questions: [
          {
            question: "使用什么颜色？",
            header: "颜色",
            options: [
              { label: "暖白", description: "简洁" },
              { label: "黑色", description: "深色" },
            ],
            multiSelect: false,
          },
        ],
      },
      { signal: args.signal },
    );
    assert.equal(answer.updatedInput.answers["使用什么颜色？"], "暖白");
    yield {
      type: "assistant",
      message: { content: [{ type: "text", text: "已选择暖白。" }] },
    };
    yield {
      type: "result",
      subtype: "success",
      result: "完成",
      usage: { input_tokens: 20, output_tokens: 8 },
      total_cost_usd: 0.02,
    };
  }
  const h = await harness(t, { runner }),
    p = await h.project(),
    s = await h.session(p),
    prefix = "/sessions/" + s.id;
  await h.call(prefix + "/run", { prompt: "开始" });
  const waiting = await h.until(s, (v) => v.session.state === "waiting"),
    approval = waiting.events.find((e) => e.type === "approval");
  assert.equal(approval.data.questions.length, 1);
  await h.call(prefix + "/approval", {
    id: approval.data.id,
    allow: true,
    answers: { "使用什么颜色？": "暖白" },
  });
  const result = await h.until(s, (v) => v.session.state === "complete");
  assert.equal(
    result.events.find((e) => e.type === "result").data.costUsd,
    0.02,
  );
  await h.call(prefix + "/run", { prompt: "继续" });
  const failed = await h.until(s, (v) => v.session.state === "error");
  assert.equal(resumed, "cli-owned-session");
  assert.ok(
    !JSON.stringify(failed).includes("secret-token-that-must-not-leak"),
  );
});

test("SSE disconnect does not cancel active job and replay catches pending permission", async (t) => {
  const h = await harness(t),
    p = await h.project(),
    s = await h.session(p),
    prefix = "/sessions/" + s.id;
  await h.call(prefix + "/run", { prompt: "更新首页" });
  const controller = new AbortController();
  const response = await fetch(h.base + "/api/code" + prefix + "/events", {
    signal: controller.signal,
  });
  const reader = response.body.getReader();
  await reader.read();
  controller.abort();
  const waiting = await h.until(s, (v) => v.session.state === "waiting");
  assert.equal(waiting.session.state, "waiting");
  await h.call(prefix + "/stop", {});
  await h.until(s, (v) => v.session.state === "stopped");
});

test("partial text is not duplicated and later nonstream assistant blocks remain visible", async (t) => {
  async function* runner() {
    yield {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "先检查文件。" },
      },
    };
    yield {
      type: "assistant",
      message: { content: [{ type: "text", text: "先检查文件。" }] },
    };
    yield {
      type: "assistant",
      message: { content: [{ type: "text", text: "检查已完成。" }] },
    };
    yield { type: "result", subtype: "success", result: "完成" };
  }
  const h = await harness(t, { runner }),
    p = await h.project(),
    s = await h.session(p);
  await h.call("/sessions/" + s.id + "/run", { prompt: "检查项目" });
  const done = await h.until(s, (v) => v.session.state === "complete");
  assert.equal(
    done.events
      .filter((e) => e.type === "text")
      .map((e) => e.data.text)
      .join(""),
    "先检查文件。检查已完成。",
  );
});

test("Write can create new nested files after validating existing ancestors", async (t) => {
  async function* runner(args) {
    const file_path = join(args.cwd, "src", "components", "App.jsx");
    const hook = await args.preToolUse({
      tool_name: "Write",
      tool_input: { file_path, content: "export default 1;" },
    });
    assert.equal(hook.hookSpecificOutput.permissionDecision, "ask");
    const escaped = await args.preToolUse({
      tool_name: "Write",
      tool_input: {
        file_path: join(args.cwd, "linked", "new", "secret.txt"),
        content: "no",
      },
    });
    assert.equal(escaped.hookSpecificOutput.permissionDecision, "deny");
    const hidden = await args.preToolUse({
      tool_name: "Write",
      tool_input: {
        file_path: join(args.cwd, "new", ".env", "secret"),
        content: "no",
      },
    });
    assert.equal(hidden.hookSpecificOutput.permissionDecision, "deny");
    const answer = await args.canUseTool(
      "Write",
      { file_path, content: "export default 1;" },
      { signal: args.signal },
    );
    assert.equal(answer.behavior, "allow");
    await fs.mkdir(join(args.cwd, "src", "components"), { recursive: true });
    await fs.writeFile(file_path, "export default 1;");
    yield { type: "result", subtype: "success", result: "完成" };
  }
  const h = await harness(t, { runner }),
    p = await h.project(),
    s = await h.session(p),
    prefix = "/sessions/" + s.id;
  await fs.symlink(h.root, join(h.root, h.a.id, p.id, "linked"));
  await h.call(prefix + "/run", { prompt: "创建一个组件" });
  const waiting = await h.until(s, (v) => v.session.state === "waiting");
  await h.call(prefix + "/approval", {
    id: waiting.events.find((e) => e.type === "approval").data.id,
    allow: true,
  });
  await h.until(s, (v) => v.session.state === "complete");
  const file = await h.call(
    "/projects/" + p.id + "/file?path=src/components/App.jsx",
  );
  assert.equal(file.status, 200);
  assert.equal(file.data.content, "export default 1;");
});

test("multiple pending permissions stay waiting until each has been answered", async (t) => {
  async function* runner(args) {
    const decisions = await Promise.all(
      ["布局", "配色"].map((question) =>
        args.canUseTool("AskUserQuestion", {
          questions: [{ question, options: [{ label: "保留" }] }],
        }),
      ),
    );
    assert.deepEqual(
      decisions.map((d) => d.behavior),
      ["allow", "deny"],
    );
    yield { type: "result", subtype: "success", result: "已收到选择" };
  }
  const h = await harness(t, { runner }),
    p = await h.project(),
    s = await h.session(p),
    prefix = "/sessions/" + s.id;
  await h.call(prefix + "/run", { prompt: "确认两项选择" });
  const waiting = await h.until(
    s,
    (v) => v.events.filter((e) => e.type === "approval").length === 2,
  );
  const approvals = waiting.events.filter((e) => e.type === "approval");
  await h.call(prefix + "/approval", {
    id: approvals[0].data.id,
    allow: true,
    answers: { 布局: "保留" },
  });
  assert.equal((await h.call(prefix)).data.session.state, "waiting");
  await h.call(prefix + "/approval", {
    id: approvals[1].data.id,
    allow: false,
  });
  await h.until(s, (v) => v.session.state === "complete");
});
