// Anthropic model lifecycle catalogue checked 2026-10-27. Not a claim of site/account access.
export const MODEL_CATALOGUE_CHECKED = "2026-10-27";
export const MODEL_CATALOGUE_SOURCE =
  "https://platform.claude.com/docs/en/about-claude/model-deprecations";
const model = (name, id, family, group = "legacy", note = "") => ({
  name: "Claude " + name,
  id,
  family,
  group,
  note,
  url: MODEL_CATALOGUE_SOURCE,
});
export const CLAUDE_MODELS = [
  model("Fable 5.1", "claude-fable-5-1", "fable", "current"),
  model("Opus 5.5", "claude-opus-5-5", "opus", "current"),
  model("Sonnet 5.5", "claude-sonnet-5-5", "sonnet", "current"),
  model("Haiku 5.5", "claude-haiku-5-5", "haiku", "current"),
  model("Fable 5", "claude-fable-5", "fable"),
  model("Opus 5", "claude-opus-5", "opus"),
  model("Opus 4.8", "claude-opus-4-8", "opus"),
  model("Opus 4.7", "claude-opus-4-7", "opus"),
  model("Opus 4.6", "claude-opus-4-6", "opus"),
  model("Opus 4.5", "claude-opus-4-5-20251101", "opus"),
  model("Sonnet 5", "claude-sonnet-5", "sonnet"),
  model("Sonnet 4.6", "claude-sonnet-4-6", "sonnet"),
  model(
    "Sonnet 4.5",
    "claude-sonnet-4-5-20250929",
    "sonnet",
    "legacy",
    "11 月 30 日退役",
  ),
  model("Haiku 4.5", "claude-haiku-4-5-20251001", "haiku"),
  model("Mythos 5.1", "claude-mythos-5-1", "mythos", "restricted", "受限访问"),
  model("Mythos 5", "claude-mythos-5", "mythos", "restricted", "受限访问"),
  {
    ...model(
      "Mythos Preview",
      "claude-mythos-preview",
      "mythos",
      "restricted",
      "受限预览",
    ),
    url: MODEL_CATALOGUE_SOURCE,
  },
];
