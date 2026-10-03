import { and, asc, eq } from "drizzle-orm";
import { p } from "~/.server/common/orpc";
import { db } from "~/.server/db";
import { Plan, Stage } from "~/.server/db/schema.graph";

// 读取当前生效的学习计划 + 可选词表范围（Stage 列表）。
// 未登录或尚未建计划时返回默认值，前端据此直接展示可编辑表单。
// 计划按 (userId, name) 唯一；active=true 的那条为生效计划。

export const DEFAULT_PLAN = {
  name: "默认计划",
  dailyNew: 20,
  dailyReview: 100,
  stageSlugs: [] as string[],
  active: true,
};

export const getMyPlan = p.public.handler(async ({ context: { userId } }) => {
  const stages = await db
    .select({
      slug: Stage.slug,
      name: Stage.name,
      kind: Stage.kind,
      order: Stage.order,
      wordCount: Stage.wordCount,
    })
    .from(Stage)
    .orderBy(asc(Stage.order));

  if (!userId) {
    return { needLogin: true, stages, plan: DEFAULT_PLAN };
  }

  const [plan] = await db
    .select()
    .from(Plan)
    .where(and(eq(Plan.userId, userId), eq(Plan.active, true)))
    .limit(1);

  return {
    needLogin: false,
    stages,
    plan: plan
      ? {
          name: plan.name,
          dailyNew: plan.dailyNew,
          dailyReview: plan.dailyReview,
          stageSlugs: plan.stageSlugs,
          active: plan.active,
        }
      : DEFAULT_PLAN,
  };
});