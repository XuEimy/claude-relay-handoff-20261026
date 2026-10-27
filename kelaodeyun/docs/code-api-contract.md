# Claude Code 服务接口

服务实现：`lib/code-service.mjs`。宿主 API 完成登录、请求来源与 JSON 校验后，调用 `await code.handle(req,res,user,path,input)`；返回 `true` 表示已处理。文件保存使用 PUT，宿主也需解析 PUT 请求体。关闭时先 `await code.close()`，再关闭 SQLite。

## 模式

- `CODE_DEMO=1`：模拟模型事件，但项目文件、批准、保存、差异和会话持久化都实际执行。演示修改固定为首页标题与段落，不能代表模型生成能力。
- 其他情况：官方 `@anthropic-ai/claude-agent-sdk` 启动其 Claude Code 子进程。登录凭据留在服务端；API 网关密钥不传入子进程。`/status` 的 `authenticated:null` 表示尚未确认登录，不能把 SDK 已安装当作订阅可用的证明。
- `CLAUDE_CODE_EXECUTABLE` 可指定已安装的 CLI；留空使用 SDK 对应运行时。
- `CODE_AUTH_HOME` 可指定运行用户 HOME；`CODE_CLAUDE_CONFIG_DIR` 可指定官方 Claude 配置目录。需由运维使用官方登录流程配置。
- `CODE_WORKSPACE_ROOT`：项目存放根目录，默认 `data/code-workspaces`，其下按账户 ID 和项目 ID 分开。
- `CODE_RUN_TIMEOUT_MS`：任务最长运行时间，默认 20 分钟、下限 30 秒、上限 60 分钟；批准等待最多 10 分钟。
- `CODE_MAX_TURNS`：单轮任务代理循环最多步数，默认 50，范围 1–200。
- `CODE_MAX_BUDGET_USD`：可选，传给 SDK 的单轮预算限制。返回的 `costUsd` 为 SDK 报告值，不是本网站人民币扣款。当前 Code 不沿用聊天 API 模型的人民币费率。
- `CODE_ALLOW_SHELL=1` 才开放 Bash；每次命令仍需网页批准。默认关闭。cwd、路径检查和权限回调不是 OS 沙箱；公网多租户开放命令前应配置进程/容器隔离与资源限制。

## 账户范围接口

所有地址均以 `/api/code` 开头，当前登录用户只能访问本人项目和会话。

| 方法与路径 | 请求/结果 |
|---|---|
| GET `/status` | `{available,mode,authentication,authenticated:null,shellEnabled,reason}` |
| GET `/projects` | `{projects:[{id,name,created}]}` |
| POST `/projects` | `{name}` → `{project}`，创建 README.md 和 index.html |
| GET `/projects/:id/tree` | `{files:[{path,size}]}`，最多 300 个文件，跳过隐藏、依赖与符号链接 |
| GET `/projects/:id/file?path=...` | `{path,content,version}`，文本最大 120KB |
| PUT `/projects/:id/file` | `{path,content,version}` → 同上；版本不符或任务运行中返回 409 |
| GET `/projects/:id/changes` | `{files:[{path,before,after,status}]}`，与创建项目时快照比较，并非 Git 工作区状态 |
| GET `/projects/:id/sessions` | `{sessions:[{id,title,state,created,updated}]}` |
| POST `/projects/:id/sessions` | `{}` → `{session}` |
| GET `/sessions/:id` | `{session:{id,projectId,title,state,...},events}` |
| POST `/sessions/:id/run` | `{prompt,model:'sonnet'|'opus'|'haiku',mode:'default'|'plan'}` → 202 `{runId}` |
| GET `/sessions/:id/events?after=N` | SSE，重放 N 之后事件，然后订阅；完成后结束连接 |
| POST `/sessions/:id/approval` | `{id,allow:boolean,answers?:{question:string}}` → `{ok:true}` |
| POST `/sessions/:id/stop` | `{}` → `{ok:true}` |

## 流事件

SSE 格式为 `id: seq`、`event: code`、`data: JSON`；JSON 为 `{seq,type,data,created}`。刷新后先读取会话历史，再从最后 seq 连接流。断开流不会取消运行，显式 stop 才取消。

| type | data |
|---|---|
| user | `{text}` |
| status | `{state:'running'|'waiting'|'complete'|'error'|'stopped',message?}` |
| text | `{text}`，增量文本，已排除 assistant 完整消息的重复文本 |
| tool | 开始 `{id,name,input,status:'running'}`；结束 `{id,status:'complete',output,isError}` |
| approval | `{id,tool,input,questions?}`，执行暂停等待网页答复 |
| approval_resolved | `{id,allow}` |
| result | `{text,usage,costUsd}` |
| error | `{message}`，不会透传 SDK stderr 或原始异常 |
| done | `{}` |

服务重启会将先前运行中的任务记为 stopped，并补写 status/done。官方 CLI 会话 ID 服务端保存，下一轮通过 SDK resume 恢复。每个账户同一时刻仅一项任务，单次最多 4000 个事件和约 1.5MB 事件输出；项目上限 50 个，每项目最多 200 个会话。

## 已验证范围

`node --test tests/code-service.test.mjs` 验证账户归属、路径/符号链接保护、保存冲突、真实文件差异、批准/拒绝/停止/计划、SSE 重放与断线、SDK 事件归一化、会话恢复参数、结构化提问和错误脱敏。模拟 runner 测试不等于已验证美国服务器的实际登录或模型推理。


## 美国服务器接入

链路：浏览器登录本站 → 本站 `/api/code` → 官方 Agent SDK → 同机 Claude Code CLI → 官方服务。网页通过 SSE 显示进度，批准经 POST 返回 CLI；不把订阅凭据交给浏览器。

使用运行本站后端的专用系统用户，通过官方 CLI 登录流程完成订阅登录。将 `CLAUDE_CODE_EXECUTABLE` 指向该服务器的 CLI，或留空使用 SDK 配套版本；设置持久化的 `CODE_AUTH_HOME` / `CODE_CLAUDE_CONFIG_DIR` 和 `CODE_WORKSPACE_ROOT`。保持 `CODE_DEMO=0`。不要复制本地演示服务器启动配置到生产。

先执行 `node --env-file-if-exists=.env scripts/check-code-runtime.mjs`：只做结构化协议握手，不发送用户任务、不打印凭据；成功不代表已验证推理额度。随后在独立测试项目中验证 Read、Write 批准、拒绝、停止、刷新恢复和真实用量。通过独立容器/执行用户隔离、资源限制与网络规则后，才能设 `CODE_ALLOW_SHELL=1` 验证 Bash；默认不开放命令。

反向代理需关闭 `/api/code/*/events` 缓冲并延长读取超时。数据库、项目目录和官方 CLI 会话目录均需持久化；本实现单 Node 进程维护活动任务，不支持直接横向多副本共享任务。Code 差异是创建项目时的快照差异，未实现 Git 提交/推送或代码回滚；费用由 SDK 报告，未套用网页聊天的人民币费率。

## 本次运行证据 2026-10-27

- 安装官方 `@anthropic-ai/claude-agent-sdk` 0.3.311；服务端动态导入，浏览器不包含运行时或凭据。
- 本机已有 CLI 2.0.76：空输入流握手成功，SDK 初始化返回 3 个模型条目；没有发送推理请求，也没有验证订阅额度。随 SDK 的本机原生运行时被系统 SIGKILL；未更改系统保护，目标 Linux 服务器仍需实测。
- 本机 CLI 的 REA 静态分析达到 20 秒上限，没有产出可用于行为归因的语义结果；保留记录 `ev_3b1a550957c0b0393558bcb5daaf98ec84754b0969b16fd6233fb14cecfcc184`，不声称完整反编译。实现依据为官方 SDK 类型、协议握手与应用端测试。
- 浏览器隔离演示验证了创建项目、发任务、Read/Write 事件、刷新保留批准、允许写入以及实际文件差异。证据目录 `evidence/claude-code-20261027/`。

参考：[官方 Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview)、[网页批准与提问](https://code.claude.com/docs/en/agent-sdk/user-input)。
