import { ArrowRight, Folder, Terminal, MessageSquare } from "lucide-react";

const modes = [
  { id: "sessions", icon: MessageSquare, title: "接着上次的思路。", label: "继续会话", description: "在对应服务器中找到已有 Claude 会话，读取最近的文本历史，再从原来的工作目录继续。" },
  { id: "terminal", icon: Terminal, title: "终端，就在手边。", label: "远程终端", description: "在当前环境打开终端，查看项目、运行命令。切换服务器时，工作空间跟随你的选择。" },
  { id: "files", icon: Folder, title: "文件，来去自如。", label: "云端文件", description: "浏览项目目录、预览和下载文件。把本地文件拖入窗口，即可上传到当前云端目录。" },
];
export default function AppShowcase({ compact = false }) {
  return <section className={`app-showcase${compact ? " app-showcase-compact" : ""}`} aria-labelledby={compact ? "download-app-heading" : "home-app-heading"}>
    <div className="app-showcase-heading"><h2 id={compact ? "download-app-heading" : "home-app-heading"}>你的云端工作，<br />在一处继续。</h2><p>会话、终端与文件，跟随当前的服务器和项目。</p></div>
    <div className="app-showcase-layout">
      <div className="app-showcase-copy">
        <div className="app-feature-list">{modes.map(({id, label, icon: Icon, description}) => (
          <article className="app-feature-expanded" key={id}>
            <h3><Icon size={20} />{label}</h3>
            <p>{description}</p>
          </article>
        ))}</div>
        <a className="app-showcase-link" href={compact ? "/guide" : "/download"}>{compact ? "了解使用条件" : "了解桌面 App"}<ArrowRight size={18}/></a>
      </div>
      <figure className="app-real-preview" id="app-feature-preview" onContextMenu={event => event.preventDefault()} onDragStart={event => event.preventDefault()}>
        <img src="/images/app/workspace.png?v=20261105-2" width="1280" height="1000" alt="kelaodeyun 桌面 App 实际界面：左侧云端文件目录，右侧为新会话输入区。" loading="lazy" draggable={false} />
      </figure>
    </div>
  </section>;
}
