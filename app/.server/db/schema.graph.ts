// 词汇星图 · 融合表 Drizzle 定义
// P1/P2 迁移建的表（Stage / WordEntry / StageRef / WordSlugMap / Relationship）
// 与 P3 新增的 LearningState / Favorite / Plan 统一放这里，避免改动 schema.ts。
// 义项（Sense）本轮不建：背诵页释义直接取旧 Translation 表，见 getStudyQueue。
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { User } from "./schema";

const timestamps = {
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp()
    .notNull()
    .$onUpdateFn(() => new Date()),
};

// 学龄段 / 词表：81 本 Book 折叠 9 组完全重复后得 72 份
export const Stage = pgTable("Stage", {
  slug: varchar().primaryKey(),
  name: varchar().notNull(),
  kind: varchar().notNull(),
  order: integer().notNull(),
  aliases: text().array().notNull(),
  wordCount: integer().notNull(),
  ...timestamps,
});

// 总词条：按 word 去重，无书归属
export const WordEntry = pgTable(
  "WordEntry",
  {
    wordId: varchar().primaryKey(),
    entryKey: varchar().notNull().unique(),
    lemma: varchar().notNull(),
    kind: varchar().notNull(),
    flags: text().array().notNull(),
    usPronounce: varchar().notNull(),
    ukPronounce: varchar().notNull(),
    remember: varchar().notNull(),
    stageCount: integer().notNull(),
    pronounceConflict: boolean().notNull(),
    pronounceVariants: integer().notNull(),
    rememberVariants: integer().notNull(),
    ...timestamps,
  },
  (t) => [
    index("WordEntry_kind_idx").on(t.kind),
    index("WordEntry_lemma_lower_idx").on(t.lemma),
  ],
);

// 学龄段引用：词 × 词表 × 展示顺序，保留该书原始载荷
export const StageRef = pgTable(
  "StageRef",
  {
    stageSlug: varchar()
      .notNull()
      .references(() => Stage.slug),
    wordId: varchar()
      .notNull()
      .references(() => WordEntry.wordId),
    orderIndex: integer().notNull(),
    sourceSlug: varchar().notNull(),
    rawUs: varchar().notNull(),
    rawUk: varchar().notNull(),
    rawRemember: varchar().notNull(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.stageSlug, t.wordId] }),
    index("StageRef_stage_order_idx").on(t.stageSlug, t.orderIndex),
    index("StageRef_word_idx").on(t.wordId),
    index("StageRef_source_idx").on(t.sourceSlug),
  ],
);

// 旧 slug → wordId 全量桥接（含被折叠的别名书），并留档每行原始载荷
export const WordSlugMap = pgTable(
  "WordSlugMap",
  {
    slug: varchar().primaryKey(),
    wordId: varchar()
      .notNull()
      .references(() => WordEntry.wordId),
    bookSlug: varchar().notNull(),
    stageSlug: varchar()
      .notNull()
      .references(() => Stage.slug),
    rawUs: varchar().notNull(),
    rawUk: varchar().notNull(),
    rawRemember: varchar().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    index("WordSlugMap_word_idx").on(t.wordId),
    index("WordSlugMap_stage_idx").on(t.stageSlug),
  ],
);

// 关系图：Synonym / Cognate 的文本关系 → 候选边
// toWordId 可空（目标可能在 24,036 词表之外）；baseLemma/baseWordId 把变体挂回词根。
export const Relationship = pgTable(
  "Relationship",
  {
    id: serial().primaryKey(),
    fromWordId: varchar()
      .notNull()
      .references(() => WordEntry.wordId),
    toLemma: varchar().notNull(),
    toWordId: varchar().references(() => WordEntry.wordId),
    baseLemma: varchar(),
    baseWordId: varchar().references(() => WordEntry.wordId),
    relType: varchar().notNull(),
    pos: varchar(),
    status: varchar().notNull().default("candidate"),
    evidence: varchar().notNull(),
    confidence: real().notNull(),
    srcTable: varchar().notNull(),
    support: integer().notNull().default(1),
    transCn: text(),
    srcTransCn: text(),
    rawContent: text().notNull(),
    note: varchar(),
    ...timestamps,
  },
  (t) => [
    unique("Relationship_edge_key").on(t.fromWordId, t.toLemma, t.relType),
    index("Relationship_from_idx").on(t.fromWordId),
    index("Relationship_to_idx").on(t.toWordId),
    index("Relationship_base_idx").on(t.baseWordId),
    index("Relationship_type_idx").on(t.relType),
    index("Relationship_status_idx").on(t.status),
    index("Relationship_conf_idx").on(t.confidence),
  ],
);

// P3 · 间隔重复状态：每个用户 × 词条一条（SM-2 变体）
export const LearningState = pgTable(
  "LearningState",
  {
    id: serial().primaryKey(),
    userId: integer()
      .notNull()
      .references(() => User.id),
    wordId: varchar()
      .notNull()
      .references(() => WordEntry.wordId),
    stage: varchar().notNull().default("new"),
    ease: real().notNull().default(2.5),
    intervalDays: integer().notNull().default(0),
    reps: integer().notNull().default(0),
    lapses: integer().notNull().default(0),
    dueAt: timestamp(),
    lastReviewedAt: timestamp(),
    ...timestamps,
  },
  (t) => [
    unique("LearningState_key").on(t.userId, t.wordId),
    index("LearningState_due_idx").on(t.userId, t.dueAt),
    index("LearningState_word_idx").on(t.wordId),
  ],
);

// P3 · 收藏：用户标星的词条
export const Favorite = pgTable(
  "Favorite",
  {
    id: serial().primaryKey(),
    userId: integer()
      .notNull()
      .references(() => User.id),
    wordId: varchar()
      .notNull()
      .references(() => WordEntry.wordId),
    note: varchar(),
    ...timestamps,
  },
  (t) => [
    unique("Favorite_key").on(t.userId, t.wordId),
    index("Favorite_user_idx").on(t.userId),
  ],
);

// P3 · 学习计划：每日新词 / 复习目标 + 词表范围
export const Plan = pgTable(
  "Plan",
  {
    id: serial().primaryKey(),
    userId: integer()
      .notNull()
      .references(() => User.id),
    name: varchar().notNull().default("默认计划"),
    dailyNew: integer().notNull().default(20),
    dailyReview: integer().notNull().default(100),
    stageSlugs: text().array().notNull().default([]),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [unique("Plan_key").on(t.userId, t.name)],
);