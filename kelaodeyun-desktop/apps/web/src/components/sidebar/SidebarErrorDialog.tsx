import { useState } from "react";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { useSidebarViewActive } from "./SidebarViewPanel";

export function SidebarErrorDialog({ message }: { message: string }) {
  const [dismissed, setDismissed] = useState(false);
  const active = useSidebarViewActive();
  return (
    <Dialog
      open={active && !dismissed}
      onOpenChange={(open) => {
        if (!open) setDismissed(true);
      }}
    >
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>操作未完成</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => setDismissed(true)}>知道了</Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
