import { transform } from "sucrase";
import reactRuntime from "../../../node_modules/react-preview/umd/react.production.min.js?raw";
import reactDomRuntime from "../../../node_modules/react-dom-preview/umd/react-dom.production.min.js?raw";
import { interactiveAnswerCanRun, interactiveAnswerFiles } from "./interactiveAnswer";

function script(source: string) {
  return `<script>${source.replace(/<\/script/gi, "<\\/script")}</script>`;
}

export function interactiveAnswerDocument(code: string, theme: "light" | "dark") {
  if (!interactiveAnswerCanRun(code, true)) throw new Error("组件为空或内容过长。");
  const compiled = transform(code, {
    transforms: ["typescript", "jsx", "imports"],
    jsxRuntime: "classic",
    production: true,
    filePath: "App.tsx",
  }).code;
  const css = interactiveAnswerFiles(code, theme)["/styles.css"];
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="root"></div>
${script(reactRuntime)}${script(reactDomRuntime)}
${script(`
const showError = (error) => {
  const node = document.createElement("p");
  node.setAttribute("role", "alert");
  node.textContent = "组件运行失败：" + (error && error.message || String(error));
  document.getElementById("root").replaceChildren(node);
};
window.addEventListener("error", (event) => { event.preventDefault(); showError(event.error || event.message); });
window.addEventListener("unhandledrejection", (event) => { event.preventDefault(); showError(event.reason); });
try {
  const module = { exports: {} };
  const require = (name) => {
    if (name === "react") return React;
    if (name === "react-dom" || name === "react-dom/client") return ReactDOM;
    throw new Error("暂不支持外部依赖：" + name);
  };
  ((require, module, exports) => {
${compiled}
})(require, module, module.exports);
  const App = module.exports.default;
  if (!App) throw new Error("组件需要 default export。");
  class Boundary extends React.Component {
    constructor(props) { super(props); this.state = { error: null }; }
    static getDerivedStateFromError(error) { return { error }; }
    render() { return this.state.error ? React.createElement("p", { role: "alert" }, "组件运行失败：" + this.state.error.message) : this.props.children; }
  }
  ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(Boundary, null, React.createElement(App)));
} catch (error) { showError(error); }
`)}
</body></html>`;
}
