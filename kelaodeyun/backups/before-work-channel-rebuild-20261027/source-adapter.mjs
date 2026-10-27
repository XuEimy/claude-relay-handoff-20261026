import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import generateModule from "@babel/generator";
import * as t from "@babel/types";
const traverse = traverseModule.default || traverseModule,
  generate = generateModule.default || generateModule;
const icons = {
  "💡": "thinking",
  "👍": "up",
  "👎": "down",
  "⚙️": "tool",
  "📄": "file",
  "✦": "spark",
  "✓": "check",
  "✕": "close",
  "×": "close",
  "▾": "caret",
  "▴": "expand",
  "↗": "arrow",
  "↑": "send",
  "🤝": "team",
  "🏛️": "plan",
  "🔬": "search",
  "🎨": "write",
  "✅": "review",
  "⚠": "warning",
  "⚠️": "warning",
  "▶": "play",
  "⏳": "clock",
};
const pattern = new RegExp(
  "(" +
    Object.keys(icons)
      .sort((a, b) => b.length - a.length)
      .join("|") +
    ")",
  "gu",
);
function icon(name) {
  return t.jsxElement(
    t.jsxOpeningElement(
      t.jsxIdentifier("UiIcon"),
      [t.jsxAttribute(t.jsxIdentifier("name"), t.stringLiteral(name))],
      true,
    ),
    null,
    [],
    true,
  );
}
export function upstreamAdapter(here) {
  return {
    name: "upstream-host-adapter",
    setup(build) {
      build.onLoad({ filter: /code-examples\/.*\.tsx$/ }, async (args) => {
        let source = await readFile(args.path, "utf8");
        if (args.path.endsWith("CoworkAgentCanvas.tsx")) {
          const patches = [
            [
              "export const CoworkAgentCanvas: React.FC = () => {",
              "export const CoworkAgentCanvas: React.FC<any> = ({agents: suppliedAgents, artifacts: suppliedArtifacts, onDirective, onAudit, onArtifact}) => {",
            ],
            [
              "const [agents, setAgents] = useState<CoworkAgent[]>(DEFAULT_AGENTS);",
              "const agents: CoworkAgent[] = suppliedAgents || DEFAULT_AGENTS;",
            ],
            [
              "const [artifacts] = useState<SharedArtifact[]>(DEFAULT_ARTIFACTS);",
              "const artifacts: SharedArtifact[] = suppliedArtifacts || DEFAULT_ARTIFACTS;",
            ],
            [
              "{agent.avatarIcon}",
              "<UiIcon name={agent.avatarIcon} size={20}/>",
            ],
            ["Claude Cowork 多智能体协同空间", "任务工作区"],
            ["多 Agent 并发任务分派、实时状态拓扑与共享工件网格", ""],
            [
              "4 个活动 Agent",
              '{agents.filter(a => a.status === "running").length} 项进行中',
            ],
            ["协作团队成员", "工作步骤"],
            ["当前活跃委派任务 (Task Delegation)", "当前步骤"],
            ["团队共享产物 (Artifacts Pool)", "产出文件"],
            ["发送协同指令", "补充要求"],
            ["查看审计日志", "查看过程"],
            [
              'type="button"\n                className="px-3 py-1.5 rounded-lg bg-',
              'type="button" onClick={() => onDirective?.(selectedAgent.id)}\n                className="px-3 py-1.5 rounded-lg bg-',
            ],
            [
              'type="button"\n                className="px-3 py-1.5 rounded-lg border',
              'type="button" onClick={() => onAudit?.(selectedAgent.id)}\n                className="px-3 py-1.5 rounded-lg border',
            ],
            [
              "key={art.id}",
              'key={art.id} role="button" tabIndex={0} onClick={() => onArtifact?.(art)} onKeyDown={e => {if(e.key === "Enter" || e.key === " "){e.preventDefault();onArtifact?.(art)}}}',
            ],
            [
              "onClick={() => setSelectedAgentId(agent.id)}",
              'onClick={() => setSelectedAgentId(agent.id)} onKeyDown={e => {if(e.key === "Enter" || e.key === " "){e.preventDefault();setSelectedAgentId(agent.id)}}}',
            ],
          ];
          for (const [from, to] of patches) {
            if (!source.includes(from))
              throw Error("Cowork upstream patch drift: " + from);
            source = source.replace(from, to);
          }
        }
        const ast = parse(source, {
          sourceType: "module",
          plugins: ["typescript", "jsx"],
        });
        traverse(ast, {
          JSXText(path) {
            if (!pattern.test(path.node.value)) {
              pattern.lastIndex = 0;
              return;
            }
            pattern.lastIndex = 0;
            const parts = path.node.value.split(pattern);
            path.replaceWithMultiple(
              parts
                .filter(Boolean)
                .map((part) =>
                  icons[part] ? icon(icons[part]) : t.jsxText(part),
                ),
            );
            path.skip();
          },
        });
        ast.program.body.unshift(
          t.importDeclaration(
            [t.importSpecifier(t.identifier("UiIcon"), t.identifier("UiIcon"))],
            t.stringLiteral(resolve(here, "chat/design-system/icons.tsx")),
          ),
        );
        return {
          contents: generate(ast, { comments: false }).code,
          loader: "tsx",
          resolveDir: dirname(args.path),
        };
      });
    },
  };
}
