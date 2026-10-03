import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { p } from "~/.server/common/orpc";
import { db } from "~/.server/db";
import { Favorite, WordEntry, WordSlugMap } from "~/.server/db/schema.graph";
import { PAGE_SIZE } from "~/common/constants";

// 收藏列表：按用户隔离，按收藏时间倒序（id 递增即加入顺序，取倒序）。
// 收藏按 WordEntry.wordId 记账，同一词跨多本书只算一条；
// 展示用的旧 slug 取该 wordId 下字典序最小的一个，保证稳定可复现。
export const getFavoriteWords = p.public
  .input(
    z.object({
      cursor: z.number().int().min(0).default(0),
    }),
  )
  .handler(async ({ context: { userId }, input: { cursor } }) => {
    if (!userId) {
      return { favorites: [], nextCursor: undefined, needLogin: true };
    }

    const rows = await db
      .select({
        wordId: Favorite.wordId,
        note: Favorite.note,
        createdAt: Favorite.createdAt,
        lemma: WordEntry.lemma,
        kind: WordEntry.kind,
        usPronounce: WordEntry.usPronounce,
        ukPronounce: WordEntry.ukPronounce,
        remember: WordEntry.remember,
      })
      .from(Favorite)
      .innerJoin(WordEntry, eq(WordEntry.wordId, Favorite.wordId))
      .where(eq(Favorite.userId, userId))
      .orderBy(asc(Favorite.id))
      .offset(PAGE_SIZE * cursor)
      .limit(PAGE_SIZE);

    const wordIds = rows.map((row) => row.wordId);
    const slugRows = wordIds.length
      ? await db
          .select({ wordId: WordSlugMap.wordId, slug: WordSlugMap.slug })
          .from(WordSlugMap)
          .where(inArray(WordSlugMap.wordId, wordIds))
          .orderBy(asc(WordSlugMap.slug))
      : [];

    const slugByWordId = new Map<string, string>();
    for (const row of slugRows) {
      if (!slugByWordId.has(row.wordId)) slugByWordId.set(row.wordId, row.slug);
    }

    const favorites = rows.map((row) => ({
      ...row,
      slug: slugByWordId.get(row.wordId) ?? "",
    }));

    return {
      favorites,
      nextCursor: rows.length ? cursor + 1 : undefined,
      needLogin: false,
    };
  });