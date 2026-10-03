import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { p } from "~/.server/common/orpc";
import { db } from "~/.server/db";
import { Translation } from "~/.server/db/schema";
import {
  LearningState,
  Plan,
  StageRef,
  WordEntry,
  WordSlugMap,
} from "~/.server/db/schema.graph";

// 背诵队列：先出「到期复习」，再补「新词」，合计不超过 limit。
// 学习状态按 WordEntry.wordId 记账，与旧的书级 UsersToWords 完全分离。
// 释义从旧 Translation 表按一个代表 slug 取，避免为背诵页单独建 Sense 表。
// 新词取词范围受生效计划的 Plan.stageSlugs 限制（空数组 = 全部词表）；
// 到期复习不受范围限制，避免换计划后隐藏进行中的复习。

const MAX_SENSES = 4;

export const getStudyQueue = p.public
  .input(
    z.object({
      limit: z.number().int().min(1).max(100).default(20),
    }),
  )
  .handler(async ({ context: { userId }, input: { limit } }) => {
    if (!userId) {
      return {
        needLogin: true,
        cards: [],
        stats: { due: 0, newAvailable: 0, learning: 0, mastered: 0, tracked: 0 },
        plan: { dailyNew: 20, dailyReview: 100, stageSlugs: [] },
      };
    }

    const now = new Date();

    const [plan] = await db
      .select({
        dailyNew: Plan.dailyNew,
        dailyReview: Plan.dailyReview,
        stageSlugs: Plan.stageSlugs,
      })
      .from(Plan)
      .where(and(eq(Plan.userId, userId), eq(Plan.active, true)))
      .limit(1);

    const dailyNew = plan?.dailyNew ?? 20;

    // 计划选定的词表范围：非空时只从这些 Stage 取新词。
    const stageSlugs = plan?.stageSlugs ?? [];
    const stageFilter = stageSlugs.length
      ? inArray(
          WordEntry.wordId,
          db
            .select({ wordId: StageRef.wordId })
            .from(StageRef)
            .where(inArray(StageRef.stageSlug, stageSlugs)),
        )
      : undefined;

    const dueRows = await db
      .select({
        wordId: WordEntry.wordId,
        lemma: WordEntry.lemma,
        kind: WordEntry.kind,
        usPronounce: WordEntry.usPronounce,
        ukPronounce: WordEntry.ukPronounce,
        remember: WordEntry.remember,
        stage: LearningState.stage,
        ease: LearningState.ease,
        intervalDays: LearningState.intervalDays,
        reps: LearningState.reps,
        lapses: LearningState.lapses,
        dueAt: LearningState.dueAt,
      })
      .from(LearningState)
      .innerJoin(WordEntry, eq(WordEntry.wordId, LearningState.wordId))
      .where(
        and(
          eq(LearningState.userId, userId),
          or(
            isNull(LearningState.dueAt),
            lte(LearningState.dueAt, now),
          ),
        ),
      )
      .orderBy(asc(LearningState.dueAt))
      .limit(limit);

    const remaining = limit - dueRows.length;

    const newRows = remaining
      ? await db
          .select({
            wordId: WordEntry.wordId,
            lemma: WordEntry.lemma,
            kind: WordEntry.kind,
            usPronounce: WordEntry.usPronounce,
            ukPronounce: WordEntry.ukPronounce,
            remember: WordEntry.remember,
          })
          .from(WordEntry)
          .leftJoin(
            LearningState,
            and(
              eq(LearningState.wordId, WordEntry.wordId),
              eq(LearningState.userId, userId),
            ),
          )
          .where(
            and(
              isNull(LearningState.id),
              ne(WordEntry.kind, "needs_review"),
              stageFilter,
            ),
          )
          .orderBy(desc(WordEntry.stageCount), asc(WordEntry.lemma))
          .limit(Math.min(remaining, dailyNew))
      : [];

    const wordIds = [
      ...dueRows.map((row) => row.wordId),
      ...newRows.map((row) => row.wordId),
    ];

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

    const slugs = [...new Set(slugByWordId.values())];
    const senseRows = slugs.length
      ? await db
          .select({
            wordSlug: Translation.wordSlug,
            pos: Translation.pos,
            transCn: Translation.transCn,
            transEn: Translation.transEn,
          })
          .from(Translation)
          .where(inArray(Translation.wordSlug, slugs))
          .orderBy(asc(Translation.id))
      : [];

    const sensesBySlug = new Map<
      string,
      { pos: string; transCn: string; transEn: string }[]
    >();
    for (const row of senseRows) {
      const list = sensesBySlug.get(row.wordSlug) ?? [];
      if (list.length >= MAX_SENSES) continue;
      if (list.some((item) => item.transCn === row.transCn)) continue;
      list.push({ pos: row.pos, transCn: row.transCn, transEn: row.transEn });
      sensesBySlug.set(row.wordSlug, list);
    }

    const cards = [
      ...dueRows.map((row) => ({
        wordId: row.wordId,
        lemma: row.lemma,
        kind: row.kind,
        usPronounce: row.usPronounce,
        ukPronounce: row.ukPronounce,
        remember: row.remember,
        slug: slugByWordId.get(row.wordId) ?? "",
        senses: sensesBySlug.get(slugByWordId.get(row.wordId) ?? "") ?? [],
        isNew: false,
        state: {
          stage: row.stage,
          ease: row.ease,
          intervalDays: row.intervalDays,
          reps: row.reps,
          lapses: row.lapses,
          dueAt: row.dueAt,
        },
      })),
      ...newRows.map((row) => ({
        wordId: row.wordId,
        lemma: row.lemma,
        kind: row.kind,
        usPronounce: row.usPronounce,
        ukPronounce: row.ukPronounce,
        remember: row.remember,
        slug: slugByWordId.get(row.wordId) ?? "",
        senses: sensesBySlug.get(slugByWordId.get(row.wordId) ?? "") ?? [],
        isNew: true,
        state: null,
      })),
    ];

    const stageRows = await db
      .select({ stage: LearningState.stage, n: sql<number>`count(*)::int` })
      .from(LearningState)
      .where(eq(LearningState.userId, userId))
      .groupBy(LearningState.stage);

    const tracked = stageRows.reduce((sum, row) => sum + row.n, 0);
    const learning = stageRows
      .filter((row) => row.stage === "learning" || row.stage === "relearning")
      .reduce((sum, row) => sum + row.n, 0);
    const mastered = stageRows
      .filter((row) => row.stage === "mastered")
      .reduce((sum, row) => sum + row.n, 0);

    const [dueCount] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(LearningState)
      .where(
        and(
          eq(LearningState.userId, userId),
          or(isNull(LearningState.dueAt), lte(LearningState.dueAt, now)),
        ),
      );

    const [totalRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(WordEntry)
      .where(
        and(ne(WordEntry.kind, "needs_review"), stageFilter),
      );

    return {
      needLogin: false,
      cards,
      stats: {
        due: dueCount?.n ?? 0,
        newAvailable: Math.max((totalRow?.n ?? 0) - tracked, 0),
        learning,
        mastered,
        tracked,
      },
      plan: {
        dailyNew,
        dailyReview: plan?.dailyReview ?? 100,
        stageSlugs,
      },
    };
  });