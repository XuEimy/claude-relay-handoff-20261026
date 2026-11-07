import React, { useEffect, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";

export const money = cents => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
export const localDate = value => value ? new Date(typeof value === "number" ? value * 1000 : value).toLocaleString("zh-CN", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
export const safeReturn = path => typeof path === "string" && /^\/(?![\/\\])/.test(path) && !/[\x00-\x1f\x7f\\]/.test(path) ? path : "/account";
export const flag = code => /^[a-z]{2}$/i.test(code || "") ? String.fromCodePoint(...code.toUpperCase().split("").map(c => c.charCodeAt(0) + 127397)) : "";
export const regionName = center => center ? [flag(center.location), center.city, center.location?.toUpperCase()].filter(Boolean).join(" ") : "未选择";
export const cycleUnit = (interval, count = 1) => interval === "year" ? count === 1 ? "年" : count === 2 ? "两年" : `${count}年` : count === 1 ? "月" : `${count}个月`;
export const cycleLabel = (interval, count = 1) => count === 1 ? `按${cycleUnit(interval, count)}` : cycleUnit(interval, count);
export const labels = { pending_payment: "等待付款", provisioning: "正在开通", purchasing: "正在开通", active: "运行中", past_due: "付款逾期", terminating: "正在清理", terminated: "已终止", needs_attention: "需要处理", checkout_expired: "付款已过期" };

export function StatusPill({ status, simulated }) {
  return <span className="vps-status-group"><span className={`vps-status vps-status-${status}`}><span aria-hidden="true" />{labels[status] || status}</span>{simulated && <span className="vps-simulated">测试</span>}</span>;
}
export function CopyButton({ value, label = "复制", sensitive = false }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState(false), timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true); setError(false); clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch { setError(true); }
  }
  return <button type="button" className="vps-copy" onClick={copy} aria-label={sensitive ? label : `${label}${value}`}><span aria-live="polite">{copied ? <><Check size={15} /> 已复制</> : error ? "请手动复制" : <><Copy size={15} /> {label}</>}</span></button>;
}
export function Skeleton({ className = "" }) {
  return <div className={`vps-skeleton ${className}`} aria-hidden="true"><span /><span /><span /></div>;
}
export function ConfirmDialog({ action, busy, onClose, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (action && !dialog.open) dialog.showModal();
    if (!action && dialog.open) dialog.close();
  }, [action]);
  return <dialog ref={ref} className="vps-dialog" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }} aria-labelledby="vps-dialog-title" aria-describedby="vps-dialog-description">
    {action && <><button type="button" className="vps-dialog-close" onClick={onClose} disabled={busy} aria-label="关闭"><X size={20} /></button><h2 id="vps-dialog-title">{action.title}</h2><p id="vps-dialog-description">{action.description}</p><div className="vps-dialog-actions"><button type="button" className="portal-button" onClick={onClose} disabled={busy} autoFocus>取消</button><button type="button" className="portal-button primary" onClick={onConfirm} disabled={busy} aria-live="polite">{busy ? "处理中…" : action.confirm || "确认"}</button></div></>}
  </dialog>;
}
export function Avatar({ user }) {
  return user.avatar ? <img className="vps-avatar" src={user.avatar} alt="" referrerPolicy="no-referrer" /> : <span className="vps-avatar vps-avatar-fallback" aria-hidden="true">{(user.name || user.email || "用").slice(0, 1).toUpperCase()}</span>;
}
