import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { p } from "~/.server/common/orpc";
import { db } from "~/.server/db";
import { Favorite, WordSlugMap } from "~/.server/db/schema.graph";

// 查询单个词是否已收藏（词详情页星标按钮的初始态）。
// 入参用旧 slug，内部经 WordSlugMap 折到 wordId。
export const getIsWordFavorite = p.public
  .input(z.object({ wordSlug: z.string() }))
  .handler(async ({ context: { userId }, input: { wordSlug } }) => {
    if (!userId) return { isFavorite: false, note: null };

    const [row] = await db
      .select({ note: Favorite.note })
      .from(Favorite)
      .innerJoin(WordSlugMap, eq(WordSlugMap.wordId, Favorite.wordId))
      .where(
        and(eq(WordSlugMap.slug, wordSlug), eq(Favorite.userId, userId)),
      )
      .limit(1);

    return { isFavorite: !!row, note: row?.note ?? null };
  });