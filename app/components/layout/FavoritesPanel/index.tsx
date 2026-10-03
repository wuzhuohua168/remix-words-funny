import { Button, Chip, Skeleton, Spinner } from "@heroui/react";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { ArrowLeft, Star } from "lucide-react";
import { useRef } from "react";
import useInfiniteScroll from "react-infinite-scroll-hook";
import { useNavigate } from "react-router";
import { orpc } from "~/common/orpcClient";
import {
  isWordDetailPanelDrawerOpenAtom,
  wordDetailSlugAtom,
} from "~/common/store";
import { Empty } from "~/components/common/Empty";
import { LuIcon } from "~/components/common/LuIcon";
import { useMobile } from "~/hooks/useMobile";
import { useMyUserInfo } from "~/hooks/useMyUserInfo";

// 我的收藏：按用户隔离的收藏词列表（按 WordEntry.wordId 记账）。
// 点条目开右侧词详情；星标按钮就地取消收藏。
export function FavoritesPanel() {
  const navigate = useNavigate();
  const { isLogin } = useMyUserInfo();
  const { isMobile } = useMobile();
  const setWordDetailSlug = useSetAtom(wordDetailSlugAtom);
  const setIsWordDetailPanelDrawerOpen = useSetAtom(
    isWordDetailPanelDrawerOpenAtom,
  );

  const favoritesQuery = useInfiniteQuery(
    orpc.loader.getFavoriteWords.infiniteOptions({
      input: (cursor: number | undefined) => ({ cursor: cursor ?? 0 }),
      initialPageParam: 0,
      getNextPageParam: ({ nextCursor }) => nextCursor,
      enabled: isLogin,
    }),
  );

  const unfavoriteWordMutation = useMutation(
    orpc.action.unfavoriteWord.mutationOptions(),
  );

  const [sentryRef, { rootRef }] = useInfiniteScroll({
    loading: favoritesQuery.isFetchingNextPage,
    hasNextPage: favoritesQuery.hasNextPage,
    onLoadMore: favoritesQuery.fetchNextPage,
    disabled: !!favoritesQuery.error,
    rootMargin: "0px 0px 200px 0px",
  });

  const topRef = useRef<HTMLDivElement>(null);

  const items =
    favoritesQuery.data?.pages.flatMap((page) => page.favorites) ?? [];

  return (
    <div className="flex h-screen w-full flex-col">
      <header className="border-separator flex h-18 shrink-0 items-center gap-3 border-b px-4">
        <Button isIconOnly variant="outline" onPress={() => navigate(-1)}>
          <LuIcon icon={ArrowLeft} />
        </Button>
        <div className="font-medium shrink-0">我的收藏</div>
        {isLogin && (
          <small className="text-muted">
            {favoritesQuery.isSuccess ? `共 ${items.length} 个词` : ""}
          </small>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto" ref={rootRef}>
        <div ref={topRef} />
        {renderContent()}
      </div>
    </div>
  );

  function renderContent() {
    if (!isLogin) {
      return <Empty label="登录后查看收藏" size={84} />;
    }

    if (favoritesQuery.isLoading) {
      return (
        <div className="divide-separator divide-y">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              className="flex h-20 items-center justify-between px-6"
              key={index}
            >
              <div className="space-y-2">
                <Skeleton className="h-8 w-52 rounded-sm" />
                <Skeleton className="h-3 w-28 rounded-sm" />
              </div>
              <Skeleton className="h-9 w-9 rounded-full" />
            </div>
          ))}
        </div>
      );
    }

    if (items.length === 0) {
      return <Empty label="还没有收藏的词" size={84} />;
    }

    return (
      <div className="flex w-full flex-col">
        {items.map((item) => (
          <div
            key={item.wordId}
            className="border-separator hover:bg-accent-soft box-border flex h-20 items-center justify-between border-b px-6"
          >
            <div
              className="flex min-w-0 flex-1 cursor-pointer flex-col justify-center gap-1"
              onClick={() => {
                setWordDetailSlug(item.slug);
                if (isMobile) setIsWordDetailPanelDrawerOpen(true);
              }}
            >
              <div className="flex items-center gap-2">
                <div className="font-merriweathers truncate text-3xl">
                  {item.lemma}
                </div>
                {!!item.kind && item.kind !== "word" && (
                  <Chip size="sm" variant="soft">
                    {item.kind}
                  </Chip>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!!item.usPronounce && (
                  <small className="text-muted">/{item.usPronounce}/</small>
                )}
                {!!item.note && (
                  <small className="text-muted truncate">· {item.note}</small>
                )}
              </div>
            </div>
            <Button
              isIconOnly
              size="sm"
              variant="primary"
              aria-label="取消收藏"
              isDisabled={unfavoriteWordMutation.isPending}
              onPress={async () => {
                await unfavoriteWordMutation.mutateAsync({
                  wordSlug: item.slug,
                });
                await favoritesQuery.refetch();
              }}
            >
              {unfavoriteWordMutation.isPending ? (
                <Spinner size="sm" />
              ) : (
                <LuIcon icon={Star} className="fill-current" />
              )}
            </Button>
          </div>
        ))}

        {favoritesQuery.isFetchingNextPage ? (
          <div className="my-6 flex items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <div ref={sentryRef} className="my-6 text-center text-sm text-muted">
            共 {items.length} 个结果
          </div>
        )}
      </div>
    );
  }
}