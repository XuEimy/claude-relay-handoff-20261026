import React, { useState, useEffect } from "react";
import { UiIcon } from "../../open-claude-ui/chat/design-system/icons";
export function Framework({ section, chats, onOpenChat }) {
  const [projects, setProjects] = useState(() => {
      try {
        return (
          JSON.parse(localStorage.getItem("kelaodeyun.web.projects.v1")) || []
        );
      } catch {
        return [];
      }
    }),
    [selected, setSelected] = useState(null),
    [name, setName] = useState(""),
    [creating, setCreating] = useState(false),
    [tab, setTab] = useState("技能");
  useEffect(() => {
    localStorage.setItem(
      "kelaodeyun.web.projects.v1",
      JSON.stringify(projects),
    );
  }, [projects]);
  const project = projects.find((p) => p.id === selected);
  const title = { projects: "项目", artifacts: "作品", customize: "自定义" }[
    section
  ];
  return (
    <section className="web-library">
      <header>
        <h2>{title}</h2>
        {section === "projects" && (
          <button className="primary" onClick={() => setCreating(true)}>
            <UiIcon name="plus" /> 新建项目
          </button>
        )}
      </header>
      {creating && section === "projects" && (
        <form
          className="web-create"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const p = {
              id: crypto.randomUUID(),
              name: name.trim(),
              instructions: "",
            };
            setProjects((v) => [p, ...v]);
            setSelected(p.id);
            setCreating(false);
            setName("");
          }}
        >
          <input
            autoFocus
            aria-label="项目名称"
            placeholder="项目名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="primary">创建</button>
          <button type="button" onClick={() => setCreating(false)}>
            取消
          </button>
        </form>
      )}
      {section === "projects" &&
        (project ? (
          <>
            <button className="web-back" onClick={() => setSelected(null)}>
              ← 全部项目
            </button>
            <h3>{project.name}</h3>
            <label className="project-instructions">
              项目说明
              <textarea
                value={project.instructions}
                placeholder="目标、背景和工作要求"
                onChange={(e) =>
                  setProjects((v) =>
                    v.map((p) =>
                      p.id === project.id
                        ? { ...p, instructions: e.target.value }
                        : p,
                    ),
                  )
                }
              />
            </label>
            <p className="muted">说明保存在此浏览器，尚未接入模型上下文。</p>
          </>
        ) : projects.length ? (
          <div className="web-directory">
            {projects.map((p) => (
              <button key={p.id} onClick={() => setSelected(p.id)}>
                <UiIcon name="folder" />
                <span>{p.name}</span>
                <UiIcon name="next" />
              </button>
            ))}
          </div>
        ) : (
          <p className="web-empty">将相关的工作放在一个项目里。</p>
        ))}
      {section === "artifacts" && <p className="web-empty">暂无作品。</p>}
      {section === "customize" && (
        <>
          <div className="web-tabs" role="tablist">
            {["技能", "连接器", "插件"].map((t) => (
              <button
                role="tab"
                aria-selected={tab === t}
                key={t}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="web-empty">
            {tab === "技能"
              ? "暂无已添加的技能。"
              : tab === "连接器"
                ? "暂无已连接的服务。"
                : "暂无已安装的插件。"}
          </p>
        </>
      )}
    </section>
  );
}
