import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { p } from "~/.server/common/orpc";
import { db } from "~/.server/db";
import { Favorite, WordSlugMap } from "~/.server/db/schema.graph";

// 取消收藏：入参旧 slug，折到 wordId 后删除该用户的收藏行。
export const unfavoriteWord = p.auth
  .input(z.object({ wordSlug: z.string() }))
  .handler(async ({ context: { userId }, input: { wordSlug } }) => {
    const [mapped] = await db
      .select({ wordId: WordSlugMap.wordId })
      .from(WordSlugMap)
      .where(eq(WordSlugMap.slug, wordSlug))
      .limit(1);

    if (!mapped) return { isFavorite: false };

    await db
      .delete(Favorite)
      .where(
        and(
          eq(Favorite.userId, userId!),
          eq(Favorite.wordId, mapped.wordId),
        ),
      );

    return { isFavorite: false };
  });