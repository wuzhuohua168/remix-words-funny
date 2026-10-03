import { z } from "zod";
import { p } from "~/.server/common/orpc";
import { db } from "~/.server/db";
import { Plan } from "~/.server/db/schema.graph";

// 保存学习计划：按 (userId, name) 幂等 upsert。
// stageSlugs 为空数组表示「全部词表」（不做范围过滤）。
export const savePlan = p.auth
  .input(
    z.object({
      name: z.string().min(1).max(50).default("默认计划"),
      dailyNew: z.number().int().min(0).max(200),
      dailyReview: z.number().int().min(0).max(1000),
      stageSlugs: z.array(z.string()).max(200).default([]),
    }),
  )
  .handler(async ({ context: { userId }, input }) => {
    const [plan] = await db
      .insert(Plan)
      .values({
        userId: userId!,
        name: input.name,
        dailyNew: input.dailyNew,
        dailyReview: input.dailyReview,
        stageSlugs: input.stageSlugs,
        active: true,
      })
      .onConflictDoUpdate({
        target: [Plan.userId, Plan.name],
        set: {
          dailyNew: input.dailyNew,
          dailyReview: input.dailyReview,
          stageSlugs: input.stageSlugs,
          active: true,
          updatedAt: new Date(),
        },
      })
      .returning();

    return {
      plan: {
        name: plan.name,
        dailyNew: plan.dailyNew,
        dailyReview: plan.dailyReview,
        stageSlugs: plan.stageSlugs,
        active: plan.active,
      },
    };
  });