import { MessageSquareIcon, TerminalIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function WorkspaceModeBar({
  terminalActive,
  cwd,
  onTerminal,
  onChat,
}: {
  terminalActive: boolean;
  cwd: string;
  onTerminal: () => void;
  onChat: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border/80 px-3 py-2">
      <div className="flex shrink-0 items-center gap-1" role="group" aria-label="工作区视图">
        <Button
          size="sm"
          variant={terminalActive ? "secondary" : "ghost"}
          aria-pressed={terminalActive}
          onClick={onTerminal}
        >
          <TerminalIcon />
          终端
        </Button>
        <Button
          size="sm"
          variant={terminalActive ? "ghost" : "secondary"}
          aria-pressed={!terminalActive}
          onClick={onChat}
        >
          <MessageSquareIcon />
          对话
        </Button>
      </div>
      <Tooltip>
        <TooltipTrigger
          render={<span className="min-w-0 truncate font-mono text-xs text-muted-foreground" />}
        >
          {cwd}
        </TooltipTrigger>
        <TooltipPopup>{cwd}</TooltipPopup>
      </Tooltip>
    </div>
  );
}
