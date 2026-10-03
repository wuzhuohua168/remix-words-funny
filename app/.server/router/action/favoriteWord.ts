import { eq } from "drizzle-orm";
import { z } from "zod";
import { p } from "~/.server/common/orpc";
import { db } from "~/.server/db";
import { Favorite, WordSlugMap } from "~/.server/db/schema.graph";

// 收藏 / 更新收藏备注：入参旧 slug，折到 wordId 后按 (userId, wordId) 幂等 upsert。
export const favoriteWord = p.auth
  .input(
    z.object({
      wordSlug: z.string(),
      note: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ context: { userId }, input: { wordSlug, note } }) => {
    const [mapped] = await db
      .select({ wordId: WordSlugMap.wordId })
      .from(WordSlugMap)
      .where(eq(WordSlugMap.slug, wordSlug))
      .limit(1);

    if (!mapped) return { isFavorite: false };

    await db
      .insert(Favorite)
      .values({ userId: userId!, wordId: mapped.wordId, note: note ?? null })
      .onConflictDoUpdate({
        target: [Favorite.userId, Favorite.wordId],
        set: { note: note ?? null, updatedAt: new Date() },
      });

    return { isFavorite: true, wordId: mapped.wordId };
  });