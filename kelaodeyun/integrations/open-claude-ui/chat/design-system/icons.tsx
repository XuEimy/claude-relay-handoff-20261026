import React from "react";
import {
  Microphone,
  DotsThree,
  SidebarSimple,
  Plus,
  MagnifyingGlass,
  ChatCircle,
  Sun,
  Moon,
  House,
  Trash,
  X,
  Square,
  ArrowUpRight,
  DownloadSimple,
  FileCode,
  PushPin,
  PencilSimple,
  Briefcase,
  Folder,
  Clock,
  SquaresFour,
  SlidersHorizontal,
  Gear,
  CaretDown,
  CaretUp,
  Check,
  Sparkle,
  Lightbulb,
  ThumbsUp,
  ThumbsDown,
  TerminalWindow,
  FileText,
  ArrowUp,
  Paperclip,
  ListChecks,
  SpinnerGap,
  CheckCircle,
  XCircle,
  Users,
  Copy,
  ArrowRight,
  CaretRight,
  WarningCircle,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
export {
  SidebarSimple as PanelLeft,
  Plus,
  MagnifyingGlass as Search,
  ChatCircle as MessageSquare,
  Sun,
  Moon,
  House as Home,
  Trash as Trash2,
  X,
  Square,
  ArrowUpRight,
  DownloadSimple as Download,
  FileCode,
  PushPin as Pin,
  PencilSimple as Pencil,
  Briefcase,
  Folder,
  Clock,
  SquaresFour,
  SlidersHorizontal,
  Gear,
  CaretDown,
  Check,
  Paperclip,
  ListChecks,
  SpinnerGap,
  CheckCircle,
  FileText,
};
const library = {
 sidebar: SidebarSimple, folder: Folder, artifacts: SquaresFour, home: House, chat: ChatCircle, mic: Microphone, more: DotsThree,
  spark: Sparkle,
  thinking: Lightbulb,
  up: ThumbsUp,
  down: ThumbsDown,
  tool: Gear,
  file: FileText,
  code: FileCode,
  check: Check,
  close: X,
  caret: CaretDown,
  expand: CaretUp,
  arrow: ArrowUpRight,
  send: ArrowUp,
  plus: Plus,
  team: Users,
  plan: ListChecks,
  review: CheckCircle,
  search: MagnifyingGlass,
  write: PencilSimple,
  clock: Clock,
  copy: Copy,
  next: ArrowRight,
  play: CaretRight,
  warning: WarningCircle,
  retry: ArrowCounterClockwise,
};
export function UiIcon({
  name,
  size = 16,
  ...props
}: {
  name: string;
  size?: number;
  [key: string]: any;
}) {
  const Icon = library[name] || Sparkle;
  return (
    <Icon
      size={size}
      weight="regular"
      aria-hidden="true"
      className="ui-icon"
      {...props}
    />
  );
}
