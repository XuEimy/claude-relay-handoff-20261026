export function readTasks() {
  try {
    const x = JSON.parse(
      localStorage.getItem("kelaodeyun.ui.tasks.v1") || "[]",
    );
    return Array.isArray(x)
      ? x
          .filter(
            (t) =>
              t &&
              typeof t.id === "string" &&
              typeof t.title === "string" &&
              typeof t.prompt === "string",
          )
          .map((t) => ({
            ...t,
            step: Math.min(4, Math.max(0, Number(t.step) || 0)),
            notes: Array.isArray(t.notes)
              ? t.notes.filter((n) => typeof n === "string")
              : [],
            status:
              t.status === "running"
                ? "paused"
                : ["review", "done", "paused", "denied"].includes(t.status)
                  ? t.status
                  : "paused",
          }))
      : [];
  } catch {
    return [];
  }
}
export function advanceTasks(tasks) {
  return tasks.map((t) =>
    t.status !== "running"
      ? t
      : {
          ...t,
          step: Math.min(4, t.step + 1),
          status: t.step >= 3 ? "review" : "running",
        },
  );
}
export function agentStatus(task, index) {
  if (!task) return "idle";
  if (task.status === "review" && index === 3) return "waiting_review";
  if (task.status === "done" || index < task.step) return "completed";
  if (task.status === "running" && index === task.step) return "running";
  return "idle";
}
