/** Reserve before the async PTY opens, so rapid splits cannot both launch Claude. */
const claimedThreads = new Set<string>();

export function claimFirstClaudeTerminal(input: {
  threadKey: string;
  cloud: boolean;
  existingTerminalCount: number;
  explicitTerminalId?: string;
  startClaude?: boolean;
}): boolean {
  if (
    !input.cloud ||
    input.existingTerminalCount > 0 ||
    input.explicitTerminalId !== undefined ||
    input.startClaude === false ||
    claimedThreads.has(input.threadKey)
  )
    return false;
  claimedThreads.add(input.threadKey);
  return true;
}

export function releaseFailedClaudeTerminal(threadKey: string): void {
  claimedThreads.delete(threadKey);
}
