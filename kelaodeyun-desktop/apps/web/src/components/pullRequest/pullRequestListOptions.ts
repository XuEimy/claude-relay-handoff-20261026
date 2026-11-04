import type { PullRequestInvolvement, PullRequestListState } from "@t3tools/contracts";
import {
  CalendarArrowDownIcon,
  CalendarArrowUpIcon,
  ClockIcon,
  EyeIcon,
  LayersIcon,
  ListChecksIcon,
  Maximize2Icon,
  Minimize2Icon,
  PenLineIcon,
  UserLockIcon,
} from "lucide-react";

import type { PullRequestFilterOption } from "./PullRequestListFilters";
import type { PullRequestListSort } from "./pullRequestListPreferences";
import { PullRequestGlyph } from "./pullRequestIcons";

export const INVOLVEMENT_TABS = [
  { value: "all", label: "全部", Icon: LayersIcon },
  { value: "reviewing", label: "我参与审查的", Icon: EyeIcon },
  { value: "authored", label: "我创建的", Icon: PenLineIcon },
] as const satisfies ReadonlyArray<PullRequestFilterOption<PullRequestInvolvement>>;

export const STATE_TABS = [
  { value: "all", label: "全部", Icon: LayersIcon },
  { value: "open", label: "打开", Icon: PullRequestGlyph.pullRequest },
  { value: "closed", label: "已关闭", Icon: PullRequestGlyph.closed },
  { value: "merged", label: "已合并", Icon: PullRequestGlyph.merged },
] as const satisfies ReadonlyArray<PullRequestFilterOption<PullRequestListState>>;

export const SORT_OPTIONS = [
  { value: "ready", label: "合并就绪程度", Icon: ListChecksIcon },
  { value: "blocked", label: "等待我处理", Icon: UserLockIcon },
  { value: "updated", label: "最近更新", Icon: ClockIcon },
  { value: "newest", label: "最新创建", Icon: CalendarArrowDownIcon },
  { value: "oldest", label: "最早创建", Icon: CalendarArrowUpIcon },
  { value: "largest", label: "改动最多", Icon: Maximize2Icon },
  { value: "smallest", label: "改动最少", Icon: Minimize2Icon },
] as const satisfies ReadonlyArray<PullRequestFilterOption<PullRequestListSort>>;
