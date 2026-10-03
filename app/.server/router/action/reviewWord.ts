import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { p } from "~/.server/common/orpc";
import { db } from "~/.server/db";
import { LearningState } from "~/.server/db/schema.graph";

// SM-2 变体：四档评分 → 难度系数 / 间隔 / 阶段。
//   again 答错：清零连续正确数，10 分钟后同一轮再出现
//   hard/good/easy 答对：按 ease × 档位倍率拉长间隔
const QUALITY = { again: 1, hard: 3, good: 4, easy: 5 } as const;
const MULTIPLIER = { again: 0, hard: 1.2, good: 1, easy: 1.3 } as const;

const RELEARN_MINUTES = 10;
const REVIEW_DAYS = 21;
const MASTERED_DAYS = 180;
const MIN_EASE = 1.3;
const DAY_MS = 24 * 60 * 60 * 1000;

export const reviewWord = p.auth
  .input(
    z.object({
      wordId: z.string(),
      grade: z.enum(["again", "hard", "good", "easy"]),
    }),
  )
  .handler(async ({ context: { userId }, input: { wordId, grade } }) => {
    const [existing] = await db
      .select()
      .from(LearningState)
      .where(
        and(
          eq(LearningState.userId, userId!),
          eq(LearningState.wordId, wordId),
        ),
      )
      .limit(1);

    let ease = existing?.ease ?? 2.5;
    let intervalDays = existing?.intervalDays ?? 0;
    let reps = existing?.reps ?? 0;
    let lapses = existing?.lapses ?? 0;
    let stage: string;

    const quality = QUALITY[grade];
    const now = new Date();

    if (quality < 3) {
      lapses += 1;
      reps = 0;
      intervalDays = 0;
      stage = "relearning";
    } else {
      reps += 1;
      if (reps === 1) intervalDays = 1;
      else if (reps === 2) intervalDays = 6;
      else {
        intervalDays = Math.max(
          1,
          Math.round(intervalDays * ease * MULTIPLIER[grade]),
        );
      }

      ease = Math.max(
        MIN_EASE,
        ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
      );
      stage =
        intervalDays >= MASTERED_DAYS
          ? "mastered"
          : intervalDays >= REVIEW_DAYS
            ? "review"
            : "learning";
    }

    const dueAt =
      stage === "relearning"
        ? new Date(now.getTime() + RELEARN_MINUTES * 60 * 1000)
        : new Date(now.getTime() + intervalDays * DAY_MS);

    await db
      .insert(LearningState)
      .values({
        userId: userId!,
        wordId,
        stage,
        ease,
        intervalDays,
        reps,
        lapses,
        dueAt,
        lastReviewedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [LearningState.userId, LearningState.wordId],
        set: {
          stage,
          ease,
          intervalDays,
          reps,
          lapses,
          dueAt,
          lastReviewedAt: now,
          updatedAt: now,
        },
      });

    return {
      stage,
      ease,
      intervalDays,
      reps,
      lapses,
      dueAt: dueAt.toISOString(),
    };
  });