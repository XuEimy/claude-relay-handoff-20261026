import { RefreshIcon } from "~/components/ui/refresh-icon";
import { PlusIcon, SearchIcon } from "lucide-react";

import { openCommandPalette } from "../../commandPaletteBus";
import { Button } from "../ui/button";
import { PullRequestListGhost } from "./PullRequestGhosts";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";

function BranchMark({ joined }: { joined: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 72"
      className="h-20 w-32 text-muted-foreground/60"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 58h100" className="text-muted-foreground/30" stroke="currentColor" />
      <circle cx="10" cy="58" r="5" fill="currentColor" fillOpacity={0.25} />
      <circle cx="110" cy="58" r="5" fill="currentColor" fillOpacity={0.25} />
      {joined ? (
        <path d="M30 58c0-18 8-26 24-26h12c16 0 24 8 24 26" />
      ) : (
        <>
          <path d="M30 58c0-18 8-26 24-26h4" />
          <path
            d="M90 58c0-18-8-26-24-26h-4"
            strokeDasharray="2 7"
            className="text-muted-foreground/50"
          />
        </>
      )}
      <circle
        cx="60"
        cy="32"
        r={joined ? 5 : 4}
        fill={joined ? "currentColor" : "none"}
        fillOpacity={0.25}
        className={joined ? undefined : "text-muted-foreground/45"}
      />
    </svg>
  );
}

export function PullRequestListEmptyState({
  query,
  filtered,
  searching,
  hasProjects,
  canLoadMore,
  loadingMore,
  refreshing,
  onClearQuery,
  onLoadMore,
  onRefresh,
}: {
  query: string;
  filtered: boolean;
  searching: boolean;
  hasProjects: boolean;
  canLoadMore: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  onClearQuery: () => void;
  onLoadMore: () => void;
  onRefresh: () => void;
}) {
  if (!hasProjects) {
    return (
      <Empty>
        <BranchMark joined={false} />
        <EmptyHeader>
          <EmptyTitle>No projects in this workspace</EmptyTitle>
          <EmptyDescription>
            Add a project, and the pull requests from its repository appear here.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm" onClick={() => openCommandPalette({ open: "add-project" })}>
            <PlusIcon className="size-3.5" />
            添加项目
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (searching) {
    return (
      <PullRequestListGhost
        rows={5}
        caption={`Searching every host for “${query.length > 48 ? `${query.slice(0, 48)}…` : query}”`}
      />
    );
  }

  if (query.length > 0) {
    return (
      <Empty>
        <BranchMark joined={false} />
        <EmptyHeader>
          <EmptyTitle>
            没有匹配“{query.length > 48 ? `${query.slice(0, 48)}…` : query}”的结果
          </EmptyTitle>
          <EmptyDescription>
            已搜索所有代码托管服务。请减少关键词，或按编号、作者、分支搜索。
          </EmptyDescription>
        </EmptyHeader>
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" variant="outline" onClick={onClearQuery}>
            <SearchIcon className="size-3.5" />
            清空搜索
          </Button>
          <Button size="sm" variant="outline" disabled={refreshing} onClick={onRefresh}>
            <RefreshIcon size="sm" refreshing={refreshing} />
            {refreshing ? "正在检查…" : "再次检查"}
          </Button>
        </div>
      </Empty>
    );
  }

  return (
    <Empty>
      <BranchMark joined={false} />
      <EmptyHeader>
        <EmptyTitle>{filtered ? "没有符合筛选条件的拉取请求" : "暂无拉取请求"}</EmptyTitle>
        <EmptyDescription>
          {filtered
            ? "放宽状态、参与方式或项目筛选条件以查看更多。"
            : "此处显示工作区所有项目的拉取请求。"}
        </EmptyDescription>
      </EmptyHeader>
      <div className="flex flex-wrap justify-center gap-2">
        {canLoadMore ? (
          <Button size="sm" variant="outline" disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore ? "正在加载…" : "加载更多拉取请求"}
          </Button>
        ) : null}
        <Button size="sm" variant="outline" disabled={refreshing} onClick={onRefresh}>
          <RefreshIcon size="sm" refreshing={refreshing} />
          {refreshing ? "正在检查…" : "再次检查"}
        </Button>
      </div>
    </Empty>
  );
}
