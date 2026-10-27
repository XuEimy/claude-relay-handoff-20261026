export const SESSION_KEY = "kelaodeyun.web.sessions.v2";
function parse(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key) || "null");
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
function messages(value) {
  return Array.isArray(value)
    ? value
        .filter(
          (m) =>
            m &&
            ["user", "assistant"].includes(m.role) &&
            typeof m.text === "string",
        )
        .map((m, i) => ({
          id: m.id || "message-" + i,
          role: m.role,
          text: m.text,
          files: Array.isArray(m.files)
            ? m.files.filter((f) => typeof f === "string")
            : [],
        }))
        .filter((m) => m.text || m.files.length)
    : [];
}
export function loadSessions(storage) {
  const current = parse(storage, SESSION_KEY);
  if (current)
    return current
      .filter(
        (s) => s && typeof s.id === "string" && typeof s.title === "string",
      )
      .map((s) => ({
        ...s,
        channel: s.channel === "cowork" ? "cowork" : "chat",
        messages: messages(s.messages),
      }));
  const chats =
    parse(storage, "kelaodeyun.web.chats.v1") ??
    parse(storage, "kelaodeyun.ui.chats.v1") ??
    parse(storage, "claude-reconstruction-chats") ??
    [];
  const work = parse(storage, "kelaodeyun.ui.tasks.v1") ?? [];
  return [
    ...chats
      .filter(
        (c) =>
          c &&
          typeof c.id === "string" &&
          typeof c.title === "string" &&
          !c.id.startsWith("sample-"),
      )
      .map((c) => ({
        id: c.id,
        title: c.title,
        channel: "chat",
        model: c.model || "Sonnet 5.5",
        messages: messages(c.messages),
      })),
    ...work
      .filter(
        (t) => t && typeof t.id === "string" && typeof t.prompt === "string",
      )
      .map((t) => ({
        id: "cowork-" + t.id,
        title: t.title || t.prompt.slice(0, 36),
        channel: "cowork",
        model: t.model || "Sonnet 5.5",
        messages: [
          { id: "original", role: "user", text: t.prompt, files: [] },
          ...(Array.isArray(t.notes) ? t.notes : [])
            .filter((n) => typeof n === "string")
            .map((text, i) => ({
              id: "note-" + i,
              role: "user",
              text,
              files: [],
            })),
        ],
      })),
  ];
}
export function appendUserMessage(
  session,
  { text, files = [], channel, model, effort },
  id = crypto.randomUUID(),
) {
  const clean = text.trim();
  if (!clean && !files.length) return session;
  return {
    ...(session || {
      id,
      title: clean.slice(0, 36) || "附件对话",
      channel,
      messages: [],
    }),
    model,
    effort,
    connection: "offline",
    messages: [
      ...(session?.messages || []),
      {
        id: crypto.randomUUID(),
        role: "user",
        text: clean,
        files: files.map((f) => (typeof f === "string" ? f : f.name)),
      },
    ],
  };
}

export function saveSessions(storage, sessions) {
  try {
    storage.setItem(SESSION_KEY, JSON.stringify(sessions));
    return true;
  } catch {
    return false;
  }
}
