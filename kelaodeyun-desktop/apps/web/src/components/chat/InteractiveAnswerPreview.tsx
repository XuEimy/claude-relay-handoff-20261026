import { interactiveAnswerDocument } from "./interactiveAnswerDocument";

export default function InteractiveAnswerPreview({
  code,
  theme,
}: {
  code: string;
  theme: "light" | "dark";
}) {
  const result = (() => {
    try {
      return { document: interactiveAnswerDocument(code, theme) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  })();
  if (result.error !== undefined)
    return (
      <p role="alert" className="p-4 text-sm text-muted-foreground">
        组件编译失败：{result.error}
      </p>
    );
  return (
    <iframe
      title="交互预览"
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={result.document}
      className="h-full w-full border-0"
      style={{ minHeight: 380 }}
    />
  );
}
