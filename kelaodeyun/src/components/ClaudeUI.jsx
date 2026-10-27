import React from "react";
import "../claude-chat.css";

const glyphs = {
  sidebar: "\ue0dd",
  plus: "\ue001",
  projects: "\ue0c9",
  artifacts: "\ue017",
  code: "\ue048",
  customize: "\ue100",
  sort: "\ue070",
  search: "\ue0d3",
  apps: "\uf031",
  micdown: "\uf003",
  down: "\ue027",
  chat: "\ue037",
  cowork: "\ue0f1",
  mic: "\ue0ab",
  send: "\ue00f",
  more: "\ue061",
  copy: "\ue056",
  audio: "\ue0e4",
  good: "\ue0fb",
  bad: "\ue0f9",
  retry: "\ue11d",
  files: "\ue06c",
  share: "\ue0da",
};
export function Glyph({ name }) {
  return (
    <span className="cc-icon" aria-hidden="true">
      {glyphs[name]}
    </span>
  );
}
export function Tool({ name, label, className = "", children, ...props }) {
  return (
    <button
      type="button"
      className={"cc-tool " + className}
      aria-label={label}
      title={label}
      {...props}
    >
      {name ? <Glyph name={name} /> : children}
    </button>
  );
}
export function Greeting({ name }) {
  return <h1 className="cc-greeting"><img src="/claude-assets/spark.svg" alt="" /><span>Good afternoon, {name}</span></h1>;
}
export function Composer({ children, ...props }) {
  return <form className="cc-composer" {...props}>{children}</form>;
}
export function ModelMenu({ options, value, onChange, children }) {
  return <div className="cc-popover cc-model-menu" role="menu" aria-label="模型">
    <div className="cc-menu-heading">Models</div>
    {options.map(option => <button type="button" role="menuitemradio" aria-checked={option.id === value} key={option.id} onClick={() => onChange(option.id)}><span>{option.name}{option.description && <small>{option.description}</small>}</span>{option.id === value && <span className="cc-check">✓</span>}</button>)}
    {!options.length && <p>暂无可用模型</p>}
    {children}
  </div>;
}
