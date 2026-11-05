import type { ScopedThreadRef } from "@t3tools/contracts";
import { isAtomCommandInterrupted } from "@t3tools/client-runtime/state/runtime";
import * as Schema from "effect/Schema";

import { resolveBrowserDefaults } from "~/browser/browserDefaults";
import { isWebUrl } from "~/browser/browserLinkTarget";
import type { OpenPreviewMutation } from "~/browser/openFileInPreview";
import { isPreviewAvailableFor, previewRuntimeFor } from "~/browser/previewRuntime";
import { recordVisitForThread } from "~/browserHistoryStore";
import { applyPreviewServerSnapshot } from "~/previewStateStore";
import { useRightPanelStore } from "~/rightPanelStore";

const terminalLinkErrorContext = {
  environmentId: Schema.String,
  threadId: Schema.String,
  targetOrigin: Schema.String,
  cause: Schema.Defect(),
};

export class TerminalLinkPreviewOpenError extends Schema.TaggedError<TerminalLinkPreviewOpenError>()(
  "TerminalLinkPreviewOpenError",
  terminalLinkErrorContext,
) {
  override get message(): string {
    return `Failed to open terminal link ${this.targetOrigin} in preview for thread ${this.threadId}.`;
  }
}

interface OpenTerminalLinkInPreviewInput<E> {
  readonly url: string;
  readonly threadRef: ScopedThreadRef;
  readonly openPreview: OpenPreviewMutation<E>;
  readonly fallbackToBrowser: () => void;
  readonly forceBrowser: boolean;
}

export async function openTerminalLinkInPreview<E>(
  input: OpenTerminalLinkInPreviewInput<E>,
): Promise<void> {
  if (!isWebUrl(input.url)) {
    input.fallbackToBrowser();
    return;
  }
  if (!isPreviewAvailableFor(input.threadRef.environmentId) || !input.threadRef.threadId) {
    throw new Error("当前云端工作区的内置浏览器尚未就绪，请连接后重试。");
  }

  const errorContext = {
    environmentId: input.threadRef.environmentId,
    threadId: input.threadRef.threadId,
    targetOrigin: new URL(input.url).origin,
  };

  const defaults = await resolveBrowserDefaults();
  const runtime = previewRuntimeFor(input.threadRef.environmentId);
  const result = await input.openPreview({
    environmentId: input.threadRef.environmentId,
    input: {
      threadId: input.threadRef.threadId,
      url: input.url,
      viewport: defaults.viewport,
      profileId: defaults.profileId,
      ...(runtime === undefined ? {} : { runtime }),
    },
  });
  if (result._tag === "Failure") {
    if (isAtomCommandInterrupted(result)) {
      return;
    }
    throw new TerminalLinkPreviewOpenError({ ...errorContext, cause: result.cause });
  }
  recordVisitForThread(input.threadRef, input.url);
  applyPreviewServerSnapshot(input.threadRef, result.value);
  useRightPanelStore.getState().openBrowser(input.threadRef, result.value.tabId);
}
