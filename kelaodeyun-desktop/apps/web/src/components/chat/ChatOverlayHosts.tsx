import type {
  DeviceServiceState,
  EnvironmentId,
  MessageId,
  ScopedThreadRef,
  ThreadId,
} from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";

import { appAtomRegistry } from "~/rpc/atomRegistry";
import { useRightPanelStore } from "~/rightPanelStore";
import { DeviceSetup } from "../device/DeviceSetup";
import { PullRequestThreadDialog } from "../PullRequestThreadDialog";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { WizardPopup } from "../ui/wizard";
import { registerThreadOverlay } from "./threadOverlayRetention";

/**
 * Open state for overlays the chat view hosts. It lives in atoms rather than
 * ChatView state so opening or closing one renders only its host, not the
 * whole chat chrome. Each entry carries the thread it was opened for; a host
 * shows only its own thread's entry, and leaving that thread's route drops it.
 */
type ThreadOverlayAtom<T> = Atom.Writable<{ readonly threadKey: string; readonly value: T } | null>;

function makeThreadOverlayAtom<T>(label: string): ThreadOverlayAtom<T> {
  const atom = Atom.make<{ readonly threadKey: string; readonly value: T } | null>(null).pipe(
    Atom.keepAlive,
    Atom.withLabel(`chat:${label}`),
  );
  registerThreadOverlay((threadKey) => {
    const entry = appAtomRegistry.get(atom);
    if (entry !== null && entry.threadKey !== threadKey) closeThreadOverlay(atom);
  });
  return atom;
}

function closeThreadOverlay<T>(atom: ThreadOverlayAtom<T>): void {
  appAtomRegistry.set(atom, null);
}

function useThreadOverlay<T>(atom: ThreadOverlayAtom<T>, threadKey: string | null): T | null {
  const entry = useAtomValue(atom);
  return threadKey !== null && entry?.threadKey === threadKey ? entry.value : null;
}

const pullRequestThreadDialogAtom = makeThreadOverlayAtom<{
  readonly initialReference: string | null;
  readonly key: number;
}>("pull-request-thread-dialog");

export function openPullRequestThreadDialog(threadKey: string, reference?: string): void {
  appAtomRegistry.set(pullRequestThreadDialogAtom, {
    threadKey,
    value: { initialReference: reference ?? null, key: Date.now() },
  });
}

export function PullRequestThreadDialogHost(props: {
  readonly threadKey: string | null;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly cwd: string | null;
  readonly onPrepared: (input: {
    branch: string;
    worktreePath: string | null;
  }) => Promise<void> | void;
}) {
  const state = useThreadOverlay(pullRequestThreadDialogAtom, props.threadKey);
  if (state === null) return null;
  return (
    <PullRequestThreadDialog
      key={state.key}
      open
      environmentId={props.environmentId}
      threadId={props.threadId}
      cwd={props.cwd}
      initialReference={state.initialReference}
      onOpenChange={(open) => {
        if (!open) closeThreadOverlay(pullRequestThreadDialogAtom);
      }}
      onPrepared={props.onPrepared}
    />
  );
}

const deviceSetupDialogAtom = makeThreadOverlayAtom<true>("device-setup-dialog");

export function openDeviceSetupDialog(threadKey: string): void {
  appAtomRegistry.set(deviceSetupDialogAtom, { threadKey, value: true });
}

export function DeviceSetupDialogHost(props: {
  readonly threadKey: string | null;
  readonly threadRef: ScopedThreadRef | null;
  readonly state: DeviceServiceState;
}) {
  const open = useThreadOverlay(deviceSetupDialogAtom, props.threadKey) !== null;
  const { threadRef } = props;
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeThreadOverlay(deviceSetupDialogAtom);
      }}
    >
      <WizardPopup>
        {threadRef ? (
          <DeviceSetup
            environmentId={threadRef.environmentId}
            state={props.state}
            onComplete={() => {
              useRightPanelStore.getState().open(threadRef, "device");
              closeThreadOverlay(deviceSetupDialogAtom);
            }}
          />
        ) : null}
      </WizardPopup>
    </Dialog>
  );
}

const branchRestoreConfirmAtom = makeThreadOverlayAtom<true>("branch-restore-confirm");

export function openBranchRestoreConfirm(threadKey: string): void {
  appAtomRegistry.set(branchRestoreConfirmAtom, { threadKey, value: true });
}

export function BranchRestoreConfirmHost(props: {
  readonly threadKey: string | null;
  readonly threadBranch: string;
  readonly canWriteSourceControl: boolean;
  readonly onConfirm: () => void;
}) {
  const open = useThreadOverlay(branchRestoreConfirmAtom, props.threadKey) !== null;
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeThreadOverlay(branchRestoreConfirmAtom);
      }}
    >
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>
            切换到 <code className="font-medium">{props.threadBranch}</code>?
          </AlertDialogTitle>
          <AlertDialogDescription>
            你有未提交的更改。它们会随你切换到新分支；如果发生冲突，则无法切换。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>取消</AlertDialogClose>
          <Button
            variant="default"
            disabled={!props.canWriteSourceControl}
            onClick={() => {
              closeThreadOverlay(branchRestoreConfirmAtom);
              props.onConfirm();
            }}
          >
            切换分支
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

interface PendingRevert {
  readonly turnCount: number;
  readonly messageId: MessageId;
}

const revertConfirmAtom = makeThreadOverlayAtom<PendingRevert>("revert-confirm");

export function openRevertConfirm(threadKey: string, pending: PendingRevert): void {
  appAtomRegistry.set(revertConfirmAtom, { threadKey, value: pending });
}

export function RevertConfirmHost(props: {
  readonly threadKey: string;
  readonly onConfirm: (turnCount: number, messageId: MessageId, restoreFiles: boolean) => void;
}) {
  const pending = useThreadOverlay(revertConfirmAtom, props.threadKey);
  const confirm = (restoreFiles: boolean) => {
    if (pending === null) return;
    closeThreadOverlay(revertConfirmAtom);
    props.onConfirm(pending.turnCount, pending.messageId, restoreFiles);
  };
  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) closeThreadOverlay(revertConfirmAtom);
      }}
    >
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>从这里开始编辑？</AlertDialogTitle>
          <AlertDialogDescription>
            将对话回退到这条消息之前，并将提示词和附件放回输入框。“同时还原文件”也会撤销你自己的文件修改。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>取消</AlertDialogClose>
          <Button variant="destructive-outline" onClick={() => confirm(true)}>
            同时还原文件
          </Button>
          <Button onClick={() => confirm(false)}>回退对话并保留文件更改</Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
