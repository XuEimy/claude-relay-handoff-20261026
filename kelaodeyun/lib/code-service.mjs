import { randomUUID, createHash } from "node:crypto";
import { promises as fs, constants as fsConstants } from "node:fs";
import { resolve, join, dirname, relative, isAbsolute, sep } from "node:path";

const MAX_FILE = 120_000,
  MAX_EVENTS = 4000,
  MAX_OUTPUT = 1_500_000;
const hidden = new Set([
  "node_modules",
  ".git",
  ".env",
  ".env.local",
  ".claude",
  ".ssh",
  ".aws",
  ".DS_Store",
]);
const clock = () => new Date().toISOString();
const digest = (text) => createHash("sha256").update(text).digest("hex");
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const json = (res, status, body) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
};
const cleanInput = (value) =>
  JSON.parse(JSON.stringify(value ?? {}).slice(0, 150_000));
const brief = (value) =>
  typeof value === "string"
    ? value.slice(0, 40_000)
    : JSON.stringify(value ?? "").slice(0, 40_000);
const isInside = (root, target) => {
  const rel = relative(root, target);
  return !rel.startsWith(".." + sep) && rel !== ".." && !isAbsolute(rel);
};

/** Runs the official SDK's Claude Code subprocess; credentials never leave the server. */
async function* officialRunner(args) {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  // Explicitly clear API/gateway overrides so this adapter uses the server's official login.
  const childEnv = Object.fromEntries(
    [
      "PATH",
      "HOME",
      "LANG",
      "LC_ALL",
      "TMPDIR",
      "TEMP",
      "SystemRoot",
      "SSL_CERT_FILE",
      "SSL_CERT_DIR",
      "NODE_EXTRA_CA_CERTS",
    ]
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]]),
  );
  childEnv.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
  if (args.env.CODE_AUTH_HOME) childEnv.HOME = resolve(args.env.CODE_AUTH_HOME);
  if (args.env.CODE_CLAUDE_CONFIG_DIR)
    childEnv.CLAUDE_CONFIG_DIR = resolve(args.env.CODE_CLAUDE_CONFIG_DIR);
  const options = {
    cwd: args.cwd,
    model: args.model,
    permissionMode: args.mode,
    maxTurns: Math.max(
      1,
      Math.min(Number.parseInt(args.env.CODE_MAX_TURNS, 10) || 50, 200),
    ),
    includePartialMessages: true,
    abortController: args.abortController,
    canUseTool: args.canUseTool,
    settingSources: [],
    strictMcpConfig: true,
    mcpServers: {},
    env: childEnv,
    persistSession: true,
    tools: [
      "Read",
      "Write",
      "Edit",
      "Glob",
      "Grep",
      "Bash",
      "AskUserQuestion",
      "TodoWrite",
    ],
    disallowedTools: args.env.CODE_ALLOW_SHELL === "1" ? [] : ["Bash"],
    hooks: { PreToolUse: [{ hooks: [args.preToolUse] }] },
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append:
        "Work only inside the current project directory. Do not read credentials or change authentication configuration. Explain the work in Chinese.",
    },
    ...(args.resume ? { resume: args.resume } : {}),
    ...(args.env.CLAUDE_CODE_EXECUTABLE
      ? { pathToClaudeCodeExecutable: resolve(args.env.CLAUDE_CODE_EXECUTABLE) }
      : {}),
    ...(Number(args.env.CODE_MAX_BUDGET_USD) > 0
      ? { maxBudgetUsd: Number(args.env.CODE_MAX_BUDGET_USD) }
      : {}),
    stderr: () => {},
  };
  const stream = query({ prompt: args.prompt, options });
  try {
    for await (const item of stream) yield item;
  } finally {
    stream.close();
  }
}

async function* demoRunner(args) {
  const wait = (ms) =>
    new Promise((ok, no) => {
      if (args.signal.aborted) return no(new Error("aborted"));
      const timer = setTimeout(() => {
        args.signal.removeEventListener("abort", stop);
        ok();
      }, ms);
      const stop = () => {
        clearTimeout(timer);
        no(new Error("aborted"));
      };
      args.signal.addEventListener("abort", stop, { once: true });
    });
  yield { type: "system", subtype: "init", session_id: randomUUID() };
  const line =
    args.mode === "plan"
      ? "我会先检查项目文件，整理实现方案，暂不修改代码。"
      : "我会先检查项目，再修改首页，并验证结果。";
  for (const chunk of line.match(/.{1,5}/gu) || []) {
    await wait(30);
    yield {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: chunk },
      },
    };
  }
  const readId = randomUUID();
  yield {
    type: "assistant",
    message: {
      content: [
        {
          type: "tool_use",
          id: readId,
          name: "Read",
          input: { file_path: join(args.cwd, "index.html") },
        },
      ],
    },
  };
  const before = await fs.readFile(join(args.cwd, "index.html"), "utf8");
  yield {
    type: "user",
    message: {
      content: [{ type: "tool_result", tool_use_id: readId, content: before }],
    },
  };
  if (args.mode !== "plan") {
    const content = before
      .replace(/<h1>[\s\S]*?<\/h1>/, "<h1>让想法，成为作品。</h1>")
      .replace(
        /<p>[\s\S]*?<\/p>/,
        "<p>从一段对话开始，在云上构建你的下一个项目。</p>",
      );
    const input = { file_path: join(args.cwd, "index.html"), content };
    const toolId = randomUUID();
    yield {
      type: "assistant",
      message: {
        content: [{ type: "tool_use", id: toolId, name: "Write", input }],
      },
    };
    const permission = await args.canUseTool("Write", input, {
      signal: args.signal,
      toolUseID: toolId,
    });
    if (permission.behavior === "allow") {
      await fs.writeFile(input.file_path, content);
      yield {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: toolId,
              content: "已更新 index.html",
            },
          ],
        },
      };
    } else
      yield {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: toolId,
              content: "用户拒绝了修改，文件保持原样。",
              is_error: true,
            },
          ],
        },
      };
  }
  await wait(100);
  yield {
    type: "result",
    subtype: "success",
    result:
      args.mode === "plan"
        ? "建议：保留简洁页面结构，调整标题与说明，然后检查页面内容。以上是方案，尚未修改文件。"
        : "本轮处理完成。可在右侧文件面板查看内容，并在「修改」中检查实际差异。",
    total_cost_usd: 0,
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

export function createCodeService({ store, env = process.env, runner } = {}) {
  const { db, get, all, run, tx } = store;
  db.exec(`CREATE TABLE IF NOT EXISTS code_projects(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,baseline TEXT NOT NULL,created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS code_sessions(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES code_projects(id),user_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,cli_session TEXT,state TEXT NOT NULL DEFAULT 'idle',created TEXT NOT NULL,updated TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS code_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT NOT NULL REFERENCES code_sessions(id),type TEXT NOT NULL,data TEXT NOT NULL,created TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS code_events_session ON code_events(session_id,seq);`);
  tx(() => {
    for (const interrupted of all(
      "SELECT id FROM code_sessions WHERE state IN ('running','waiting')",
    )) {
      run(
        "UPDATE code_sessions SET state='stopped',updated=? WHERE id=?",
        clock(),
        interrupted.id,
      );
      run(
        "INSERT INTO code_events(session_id,type,data,created) VALUES(?,?,?,?)",
        interrupted.id,
        "status",
        JSON.stringify({ state: "stopped", message: "服务重启，任务已停止" }),
        clock(),
      );
      run(
        "INSERT INTO code_events(session_id,type,data,created) VALUES(?,?,?,?)",
        interrupted.id,
        "done",
        "{}",
        clock(),
      );
    }
  });
  const root = resolve(env.CODE_WORKSPACE_ROOT || "data/code-workspaces");
  const active = new Map(),
    clients = new Map(),
    writes = new Set();
  let closed = false;
  const demo = env.CODE_DEMO === "1";
  const execute = runner || (demo ? demoRunner : officialRunner);
  const projectFor = (user, id) =>
    get("SELECT * FROM code_projects WHERE id=? AND user_id=?", id, user.id) ||
    fail(404, "项目不存在");
  const sessionFor = (user, id) =>
    get("SELECT * FROM code_sessions WHERE id=? AND user_id=?", id, user.id) ||
    fail(404, "会话不存在");
  const projectRoot = (p) => join(root, p.user_id, p.id);
  const checkRoot = async (p) => {
    let current = sep;
    for (const part of projectRoot(p).split(sep).filter(Boolean)) {
      current = join(current, part);
      let st;
      try {
        st = await fs.lstat(current);
      } catch (e) {
        if (e.code === "ENOENT") fail(404, "项目目录不存在");
        throw e;
      }
      if (st.isSymbolicLink() || !st.isDirectory())
        fail(403, "项目路径不允许包含符号链接");
    }
  };
  const safePath = async (p, name, allowMissing = false) => {
    if (
      typeof name !== "string" ||
      !name ||
      name.length > 500 ||
      name.includes("\0") ||
      name.includes("\\") ||
      isAbsolute(name)
    )
      fail(400, "文件路径无效");
    const parts = name.split("/");
    if (
      parts.some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          part.startsWith(".") ||
          hidden.has(part) ||
          part.startsWith(".env") ||
          part.toLowerCase().includes("credentials"),
      )
    )
      fail(403, "不能访问这个文件");
    const base = projectRoot(p),
      target = resolve(base, name);
    if (!isInside(base, target)) fail(403, "文件必须位于项目内");
    // Validate every existing component, including configured root, against symlink escapes.
    const absoluteParts = target.split(sep).filter(Boolean);
    let current = sep;
    for (let i = 0; i < absoluteParts.length; i++) {
      current = join(current, absoluteParts[i]);
      let st;
      try {
        st = await fs.lstat(current);
      } catch (e) {
        if (e.code === "ENOENT" && allowMissing) return target;
        if (e.code === "ENOENT") fail(404, "文件不存在");
        throw e;
      }
      if (st.isSymbolicLink()) fail(403, "不允许访问符号链接");
      if (i < absoluteParts.length - 1 && !st.isDirectory())
        fail(400, "文件路径无效");
    }
    return target;
  };
  const tree = async (p) => {
    const files = [];
    const walk = async (directory, prefix = "", depth = 0) => {
      if (depth > 10 || files.length >= 300) return;
      let entries;
      try {
        entries = await fs.readdir(directory, { withFileTypes: true });
      } catch (e) {
        if (e.code === "ENOENT") return;
        throw e;
      }
      for (const entry of entries.sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        if (files.length >= 300) break;
        if (
          entry.isSymbolicLink() ||
          hidden.has(entry.name) ||
          entry.name.startsWith(".") ||
          entry.name.toLowerCase().includes("credentials")
        )
          continue;
        const path = prefix + entry.name;
        const target = await safePath(p, path);
        if (entry.isDirectory()) await walk(target, path + "/", depth + 1);
        else if (entry.isFile())
          files.push({ path, size: (await fs.stat(target)).size });
      }
    };
    // Do not traverse a root replaced by an agent or another local process.
    await checkRoot(p);
    await walk(projectRoot(p));
    return files;
  };
  const read = async (p, path) => {
    const target = await safePath(p, path),
      handle = await fs.open(
        target,
        fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
      );
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > MAX_FILE)
        fail(413, "仅支持 120KB 以内的文本文件");
      const content = await handle.readFile("utf8");
      if (content.includes("\0")) fail(415, "暂不支持编辑二进制文件");
      return { path, content, version: digest(content) };
    } finally {
      await handle.close();
    }
  };
  const rows = (id, after = 0) =>
    all(
      "SELECT seq,type,data,created FROM code_events WHERE session_id=? AND seq>? ORDER BY seq",
      id,
      after,
    ).map((row) => ({ ...row, data: JSON.parse(row.data) }));
  const event = (session, type, data) => {
    const info = run(
      "INSERT INTO code_events(session_id,type,data,created) VALUES(?,?,?,?)",
      session.id,
      type,
      JSON.stringify(data),
      clock(),
    );
    const value = {
      seq: Number(info.lastInsertRowid),
      type,
      data,
      created: clock(),
    };
    for (const res of clients.get(session.id) || [])
      if (!res.destroyed)
        res.write(
          `id: ${value.seq}\nevent: code\ndata: ${JSON.stringify(value)}\n\n`,
        );
    return value;
  };
  const state = (s, value, message) => {
    run(
      "UPDATE code_sessions SET state=?,updated=? WHERE id=?",
      value,
      clock(),
      s.id,
    );
    event(s, "status", { state: value, ...(message ? { message } : {}) });
  };
  const terminal = (s) => {
    event(s, "done", {});
    for (const res of clients.get(s.id) || []) res.end();
    clients.delete(s.id);
  };
  const toolPathAllowed = async (p, tool, input) => {
    if (
      ![
        "Read",
        "Write",
        "Edit",
        "Glob",
        "Grep",
        "Bash",
        "AskUserQuestion",
        "TodoWrite",
      ].includes(tool)
    )
      return false;
    if (tool === "Bash") return env.CODE_ALLOW_SHELL === "1";
    if (
      tool === "Glob" &&
      (typeof input.pattern !== "string" ||
        isAbsolute(input.pattern) ||
        input.pattern.split(/[\\/]/).includes(".."))
    )
      return false;
    const given = input.file_path || input.path;
    if (given) {
      const path = relative(projectRoot(p), resolve(projectRoot(p), given));
      if (path === "" && ["Glob", "Grep"].includes(tool)) return true;
      try {
        await safePath(p, path, tool === "Write");
      } catch {
        return false;
      }
    }
    return true;
  };
  const startRun = async (user, session, input) => {
    if (active.has(user.id)) fail(409, "请先完成或停止当前任务");
    if (
      typeof input.prompt !== "string" ||
      !input.prompt.trim() ||
      input.prompt.length > 20000
    )
      fail(400, "请输入 20000 字以内的任务");
    if (
      !["sonnet", "opus", "haiku"].includes(input.model || "sonnet") ||
      !["default", "plan"].includes(input.mode || "default")
    )
      fail(400, "模型或权限模式无效");
    if (closed) fail(503, "服务正在关闭");
    if (
      get(
        "SELECT count(*) AS n FROM code_events WHERE session_id=?",
        session.id,
      ).n > 20000
    )
      fail(409, "此会话已较长，请新建任务继续");
    const p = projectFor(user, session.project_id);
    await checkRoot(p);
    const task = {
      id: randomUUID(),
      session,
      controller: new AbortController(),
      pending: new Map(),
      output: 0,
      count: 0,
      plan: input.mode === "plan",
    };
    active.set(user.id, task);
    event(session, "user", { text: input.prompt.trim() });
    run(
      "UPDATE code_sessions SET title=? WHERE id=? AND title=?",
      input.prompt.trim().slice(0, 40),
      session.id,
      "新任务",
    );
    state(session, "running");
    const emit = (type, data) => {
      task.output += JSON.stringify(data).length;
      task.count++;
      if (task.output > MAX_OUTPUT || task.count > MAX_EVENTS) {
        task.controller.abort();
        throw Error("output-limit");
      }
      return event(session, type, data);
    };
    const previewFor = async (tool, toolInput) => {
      if (
        !["Write", "Edit"].includes(tool) ||
        !(await toolPathAllowed(p, tool, toolInput))
      )
        return undefined;
      const path = relative(
        projectRoot(p),
        resolve(projectRoot(p), toolInput.file_path || ""),
      );
      let before = null;
      try {
        before = (await read(p, path)).content;
      } catch (e) {
        if (e.status !== 404) return undefined;
      }
      let after = tool === "Write" ? toolInput.content : before;
      if (
        tool === "Edit" &&
        typeof before === "string" &&
        typeof toolInput.old_string === "string" &&
        toolInput.old_string.length
      )
        after = toolInput.replace_all
          ? before.split(toolInput.old_string).join(toolInput.new_string || "")
          : before.replace(
              toolInput.old_string,
              () => toolInput.new_string || "",
            );
      if (typeof after !== "string" || Buffer.byteLength(after) > MAX_FILE)
        return undefined;
      return { path, before, after };
    };
    const permission = async (tool, toolInput, options = {}) => {
      if (
        task.controller.signal.aborted ||
        (input.mode === "plan" && ["Write", "Edit", "Bash"].includes(tool)) ||
        !(await toolPathAllowed(p, tool, toolInput))
      )
        return { behavior: "deny", message: "该操作超出此项目允许范围" };
      if (["Read", "Glob", "Grep", "TodoWrite"].includes(tool))
        return { behavior: "allow", updatedInput: toolInput };
      const id = randomUUID();
      const preview = await previewFor(tool, toolInput);
      if (task.controller.signal.aborted)
        return { behavior: "deny", message: "任务已停止" };
      state(session, "waiting");
      emit("approval", {
        id,
        tool,
        input: cleanInput(toolInput),
        preview,
        ...(tool === "AskUserQuestion"
          ? { questions: toolInput.questions }
          : {}),
      });
      return new Promise((resolve) => {
        let settled = false;
        const finish = (response) => {
          if (settled) return;
          settled = true;
          task.pending.delete(id);
          clearTimeout(timer);
          options.signal?.removeEventListener("abort", aborted);
          task.controller.signal.removeEventListener("abort", aborted);
          if (!task.controller.signal.aborted)
            state(session, task.pending.size ? "waiting" : "running");
          resolve(response);
        };
        const aborted = () =>
          finish({ behavior: "deny", message: "任务已停止" });
        const timer = setTimeout(
          () => finish({ behavior: "deny", message: "等待批准超时" }),
          10 * 60_000,
        );
        task.pending.set(id, { finish, input: toolInput, tool });
        options.signal?.addEventListener("abort", aborted, { once: true });
        task.controller.signal.addEventListener("abort", aborted, {
          once: true,
        });
        if (task.controller.signal.aborted || options.signal?.aborted)
          aborted();
      });
    };
    const preToolUse = async (input) => {
      const allowed =
        !(task.plan && ["Write", "Edit", "Bash"].includes(input.tool_name)) &&
        (await toolPathAllowed(p, input.tool_name, input.tool_input || {}));
      if (!allowed)
        return {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: "该操作超出此项目允许范围",
          },
        };
      // Force all mutations/commands/questions through the browser even when local CLI rules would allow them.
      if (
        ["Write", "Edit", "Bash", "AskUserQuestion"].includes(input.tool_name)
      )
        return {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "ask",
            permissionDecisionReason: "请在网页中确认此操作",
          },
        };
      return {};
    };
    const timer = setTimeout(
      () => {
        task.timeout = true;
        task.controller.abort();
      },
      Math.max(
        30_000,
        Math.min(Number(env.CODE_RUN_TIMEOUT_MS) || 1_200_000, 3_600_000),
      ),
    );
    task.promise = (async () => {
      let hasResult = false,
        unmatchedPartial = "";
      try {
        for await (const msg of execute({
          prompt: input.prompt.trim(),
          cwd: projectRoot(p),
          model: input.model || "sonnet",
          mode: input.mode || "default",
          resume: session.cli_session,
          signal: task.controller.signal,
          abortController: task.controller,
          env,
          canUseTool: permission,
          preToolUse,
        })) {
          if (task.controller.signal.aborted) break;
          if (
            msg.type === "system" &&
            msg.subtype === "init" &&
            typeof msg.session_id === "string"
          )
            run(
              "UPDATE code_sessions SET cli_session=? WHERE id=?",
              msg.session_id,
              session.id,
            );
          if (
            msg.type === "stream_event" &&
            msg.event?.type === "content_block_delta" &&
            msg.event.delta?.type === "text_delta"
          ) {
            emit("text", { text: msg.event.delta.text });
            unmatchedPartial += msg.event.delta.text;
          }
          if (msg.type === "assistant")
            for (const block of msg.message?.content || []) {
              if (block.type === "tool_use")
                emit("tool", {
                  id: block.id,
                  name: block.name,
                  input: cleanInput(block.input),
                  preview: await previewFor(block.name, block.input || {}),
                  status: "running",
                });
              if (block.type === "text") {
                if (unmatchedPartial.startsWith(block.text))
                  unmatchedPartial = unmatchedPartial.slice(block.text.length);
                else if (block.text.startsWith(unmatchedPartial)) {
                  const remainder = block.text.slice(unmatchedPartial.length);
                  unmatchedPartial = "";
                  if (remainder) emit("text", { text: remainder });
                } else {
                  unmatchedPartial = "";
                  emit("text", { text: block.text });
                }
              }
            }
          if (msg.type === "user" && Array.isArray(msg.message?.content))
            for (const block of msg.message.content)
              if (block.type === "tool_result")
                emit("tool", {
                  id: block.tool_use_id,
                  status: "complete",
                  output: brief(block.content),
                  isError: !!block.is_error,
                });
          if (msg.type === "result") {
            hasResult = true;
            if (msg.subtype !== "success" || msg.is_error) {
              emit("error", {
                message:
                  "Claude Code 未完成任务。请检查服务端登录状态、额度或继续调整任务。",
              });
              state(session, "error");
            } else {
              emit("result", {
                text: brief(msg.result),
                usage: msg.usage || null,
                costUsd: Number(msg.total_cost_usd) || 0,
              });
              state(session, "complete");
            }
          }
        }
        if (task.controller.signal.aborted)
          state(
            session,
            task.timeout ? "error" : "stopped",
            task.timeout ? "任务执行超时" : "任务已停止",
          );
        else if (!hasResult) {
          emit("error", {
            message: "Claude Code 连接提前结束，请检查服务端登录状态。",
          });
          state(session, "error");
        }
      } catch {
        if (task.controller.signal.aborted)
          state(
            session,
            task.timeout ? "error" : "stopped",
            task.timeout ? "任务执行超时" : "任务已停止",
          );
        else {
          event(session, "error", {
            message:
              "Claude Code 启动或连接失败，请检查服务端 CLI 登录和网络配置。",
          });
          state(session, "error");
        }
      } finally {
        clearTimeout(timer);
        task.controller.abort();
        for (const pending of [...task.pending.values()])
          pending.finish({ behavior: "deny", message: "任务已结束" });
        if (active.get(user.id) === task) active.delete(user.id);
        terminal(session);
      }
    })();
    return task.id;
  };
  const handle = async (req, res, user, path, input = {}) => {
    if (!path.startsWith("/api/code/")) return false;
    const method = req.method,
      url = new URL(req.url, "http://localhost");
    if (path === "/api/code/status" && method === "GET") {
      let available = true;
      if (!demo && !runner && env.CLAUDE_CODE_EXECUTABLE) {
        try {
          await fs.access(
            resolve(env.CLAUDE_CODE_EXECUTABLE),
            fsConstants.R_OK,
          );
        } catch {
          available = false;
        }
      } else if (!demo && !runner) {
        try {
          await import("@anthropic-ai/claude-agent-sdk");
        } catch {
          available = false;
        }
      }
      json(res, 200, {
        available,
        mode: demo ? "demo" : "live",
        authentication: demo ? "mock" : "server-login",
        authenticated: null,
        shellEnabled: env.CODE_ALLOW_SHELL === "1",
        reason: !available
          ? "服务端未找到 Claude Code 运行时"
          : demo
            ? "演示模型 · 文件修改真实保存"
            : "通过服务端官方登录运行；登录与额度将在调用时确认",
      });
      return true;
    }
    if (path === "/api/code/projects") {
      if (method === "GET")
        json(res, 200, {
          projects: all(
            "SELECT id,name,created FROM code_projects WHERE user_id=? ORDER BY created DESC",
            user.id,
          ),
        });
      else if (method === "POST") {
        const name = typeof input.name === "string" ? input.name.trim() : "";
        if (!name || name.length > 80) fail(400, "请输入 80 字以内的项目名称");
        if (
          get(
            "SELECT count(*) AS n FROM code_projects WHERE user_id=?",
            user.id,
          ).n >= 50
        )
          fail(409, "最多创建 50 个项目");
        const p = {
            id: randomUUID(),
            user_id: user.id,
            name,
            created: clock(),
          },
          dir = projectRoot(p);
        await fs.mkdir(dir, { recursive: true, mode: 0o700 });
        await checkRoot(p);
        const initial = {
          "README.md":
            "# " +
            name +
            "\n\n这是你的云端项目。通过左侧对话检查、修改和构建代码。\n",
          "index.html":
            '<!doctype html>\n<html lang="zh-CN">\n<head><meta charset="UTF-8"><title>我的项目</title></head>\n<body>\n  <h1>你好，世界。</h1>\n  <p>这是你的第一个云端项目。</p>\n</body>\n</html>\n',
        };
        for (const [file, value] of Object.entries(initial))
          await fs.writeFile(join(dir, file), value, { mode: 0o600 });
        run(
          "INSERT INTO code_projects VALUES(?,?,?,?,?)",
          p.id,
          user.id,
          name,
          JSON.stringify(initial),
          p.created,
        );
        json(res, 201, { project: { id: p.id, name, created: p.created } });
      } else fail(405, "不支持此操作");
      return true;
    }
    const match = path.match(
      /^\/api\/code\/projects\/([^/]+)\/(tree|file|changes|sessions)$/,
    );
    if (match) {
      const p = projectFor(user, match[1]),
        action = match[2];
      if (action === "tree" && method === "GET")
        json(res, 200, { files: await tree(p) });
      else if (action === "file" && method === "GET")
        json(res, 200, await read(p, url.searchParams.get("path")));
      else if (action === "file" && method === "PUT") {
        if (active.has(user.id)) fail(409, "请等待任务结束后再保存文件");
        if (
          typeof input.content !== "string" ||
          Buffer.byteLength(input.content) > MAX_FILE ||
          input.content.includes("\0")
        )
          fail(413, "仅支持 120KB 以内的文本内容");
        const key = p.id + ":" + input.path;
        if (writes.has(key)) fail(409, "此文件正在保存，请稍后重试");
        writes.add(key);
        let temporary;
        try {
          const previous = await read(p, input.path);
          if (input.version !== previous.version)
            fail(409, "文件已发生变化，请重新打开后保存");
          const target = await safePath(p, input.path);
          temporary = join(
            dirname(target),
            ".kelaodeyun-" + randomUUID() + ".tmp",
          );
          await fs.writeFile(temporary, input.content, {
            flag: "wx",
            mode: 0o600,
          });
          await fs.rename(temporary, target);
          json(res, 200, {
            path: input.path,
            content: input.content,
            version: digest(input.content),
          });
        } finally {
          writes.delete(key);
          if (temporary) await fs.rm(temporary, { force: true });
        }
      } else if (action === "changes" && method === "GET") {
        const baseline = JSON.parse(p.baseline),
          files = [],
          entries = await tree(p),
          names = new Set([
            ...Object.keys(baseline),
            ...entries.map((f) => f.path),
          ]);
        let size = 0;
        for (const name of names) {
          let after = null;
          try {
            after = (await read(p, name)).content;
          } catch (e) {
            if (![404, 413, 415].includes(e.status)) throw e;
            if (e.status !== 404) continue;
          }
          const before = baseline[name] ?? null;
          if (after !== before) {
            size += (after?.length || 0) + (before?.length || 0);
            if (size > 1_000_000) break;
            files.push({
              path: name,
              before,
              after,
              status:
                before === null
                  ? "added"
                  : after === null
                    ? "deleted"
                    : "modified",
            });
          }
        }
        json(res, 200, { files });
      } else if (action === "sessions" && method === "GET")
        json(res, 200, {
          sessions: all(
            "SELECT id,title,state,created,updated FROM code_sessions WHERE project_id=? ORDER BY updated DESC",
            p.id,
          ),
        });
      else if (action === "sessions" && method === "POST") {
        if (
          get(
            "SELECT count(*) AS n FROM code_sessions WHERE project_id=?",
            p.id,
          ).n >= 200
        )
          fail(409, "此项目任务已达上限");
        const s = {
          id: randomUUID(),
          title: "新任务",
          state: "idle",
          created: clock(),
        };
        run(
          "INSERT INTO code_sessions VALUES(?,?,?,?,?,?,?,?)",
          s.id,
          p.id,
          user.id,
          s.title,
          null,
          s.state,
          s.created,
          s.created,
        );
        json(res, 201, { session: s });
      } else fail(405, "不支持此操作");
      return true;
    }
    const sm = path.match(
      /^\/api\/code\/sessions\/([^/]+)(?:\/(run|events|approval|stop))?$/,
    );
    if (sm) {
      const s = sessionFor(user, sm[1]),
        action = sm[2];
      if (!action && method === "GET")
        json(res, 200, {
          session: {
            id: s.id,
            projectId: s.project_id,
            title: s.title,
            state: s.state,
            created: s.created,
            updated: s.updated,
          },
          events: rows(s.id),
        });
      else if (action === "run" && method === "POST")
        json(res, 202, { runId: await startRun(user, s, input) });
      else if (action === "events" && method === "GET") {
        const after = Number(
          url.searchParams.get("after") || req.headers["last-event-id"] || 0,
        );
        if (!Number.isSafeInteger(after) || after < 0)
          fail(400, "事件位置无效");
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        });
        const set = clients.get(s.id) || new Set();
        clients.set(s.id, set);
        set.add(res);
        for (const item of rows(s.id, after))
          res.write(
            `id: ${item.seq}\nevent: code\ndata: ${JSON.stringify(item)}\n\n`,
          );
        if (
          !["running", "waiting"].includes(
            get("SELECT state FROM code_sessions WHERE id=?", s.id).state,
          )
        ) {
          res.end();
          set.delete(res);
        } else {
          const timer = setInterval(() => {
            if (!res.destroyed) res.write(": ping\n\n");
          }, 15_000);
          res.on("close", () => {
            clearInterval(timer);
            set.delete(res);
            if (!set.size) clients.delete(s.id);
          });
        }
      } else if (action === "approval" && method === "POST") {
        const task = active.get(user.id),
          pending = task?.session.id === s.id && task.pending.get(input.id);
        if (!pending) fail(409, "此操作已处理或已过期");
        if (typeof input.allow !== "boolean") fail(400, "请选择允许或拒绝");
        if (
          input.answers &&
          (typeof input.answers !== "object" ||
            Array.isArray(input.answers) ||
            Object.values(input.answers).some(
              (a) => typeof a !== "string" || a.length > 2000,
            ))
        )
          fail(400, "回答格式不正确");
        pending.finish(
          input.allow
            ? {
                behavior: "allow",
                updatedInput: {
                  ...pending.input,
                  ...(pending.tool === "AskUserQuestion" && input.answers
                    ? { answers: input.answers }
                    : {}),
                },
              }
            : { behavior: "deny", message: "用户拒绝了此操作，请调整方案" },
        );
        event(s, "approval_resolved", { id: input.id, allow: input.allow });
        json(res, 200, { ok: true });
      } else if (action === "stop" && method === "POST") {
        const task = active.get(user.id);
        if (task?.session.id === s.id) task.controller.abort();
        json(res, 200, { ok: true });
      } else fail(405, "不支持此操作");
      return true;
    }
    fail(404, "接口不存在");
  };
  return {
    handle,
    close: async () => {
      closed = true;
      const tasks = [...active.values()];
      for (const task of tasks) task.controller.abort();
      await Promise.allSettled(tasks.map((task) => task.promise));
      for (const set of clients.values()) for (const res of set) res.end();
      clients.clear();
    },
  };
}
