import { Button, Spinner } from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { Star } from "lucide-react";
import { orpc } from "~/common/orpcClient";
import { isSignInModalOpenAtom } from "~/common/store";
import { LuIcon } from "~/components/common/LuIcon";
import { useMyUserInfo } from "~/hooks/useMyUserInfo";

// 词详情星标：收藏 / 取消收藏当前词（按 wordId 记账，与旧「已掌握」相互独立）。
export function WordFavoriteButton({ wordSlug }: { wordSlug: string }) {
  const { isLogin } = useMyUserInfo();
  const setIsSignInModalOpen = useSetAtom(isSignInModalOpenAtom);
  const queryClient = useQueryClient();

  const getIsWordFavoriteQuery = useQuery(
    orpc.loader.getIsWordFavorite.queryOptions({
      input: { wordSlug },
      enabled: !!wordSlug,
    }),
  );
  const isFavorite = !!getIsWordFavoriteQuery.data?.isFavorite;

  const favoriteWordMutation = useMutation(
    orpc.action.favoriteWord.mutationOptions(),
  );
  const unfavoriteWordMutation = useMutation(
    orpc.action.unfavoriteWord.mutationOptions(),
  );
  const isPending =
    favoriteWordMutation.isPending || unfavoriteWordMutation.isPending;

  const invalidate = async () => {
    await Promise.all([
      getIsWordFavoriteQuery.refetch(),
      queryClient.invalidateQueries({
        queryKey: orpc.loader.getFavoriteWords.queryKey({ input: { cursor: 0 } }),
      }),
    ]);
  };

  return (
    <Button
      isIconOnly
      size="sm"
      variant={isFavorite ? "primary" : "outline"}
      aria-label={isFavorite ? "取消收藏" : "收藏"}
      isDisabled={isPending}
      onPress={async () => {
        if (!isLogin) {
          setIsSignInModalOpen(true);
          return;
        }

        if (isFavorite) {
          await unfavoriteWordMutation.mutateAsync({ wordSlug });
        } else {
          await favoriteWordMutation.mutateAsync({ wordSlug });
        }

        await invalidate();
      }}
    >
      {isPending ? (
        <Spinner size="sm" />
      ) : (
        <LuIcon icon={Star} className={isFavorite ? "fill-current" : undefined} />
      )}
    </Button>
  );
}