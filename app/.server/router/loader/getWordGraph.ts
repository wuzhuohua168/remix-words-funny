import { and, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { p } from "~/.server/common/orpc";
import { db } from "~/.server/db";
import { Relationship, WordEntry, WordSlugMap } from "~/.server/db/schema.graph";

// 星图查询：给定旧 slug，返回中心词 + 一跳邻居节点与边。
// 关系边来自 P2 的 Relationship（Synonym / Cognate 消歧所得），全部为 candidate，
// 因此用 minConfidence 做阈值过滤（默认 0.7）。

type GraphNode = {
  key: string;
  wordId: string | null;
  lemma: string;
  kind: string | null;
  slug?: string;
  inVocabulary: boolean;
  direction: "center" | "out" | "in";
};

type GraphEdge = {
  source: string;
  target: string;
  relType: string;
  confidence: number;
  evidence?: string;
  pos?: string | null;
  transCn?: string | null;
  note?: string | null;
  support?: number;
};

export const getWordGraph = p.public
  .input(
    z.object({
      wordSlug: z.string(),
      minConfidence: z.number().min(0).max(1).default(0.7),
      limit: z.number().int().min(1).max(200).default(60),
    }),
  )
  .handler(async ({ input: { wordSlug, minConfidence, limit } }) => {
    const [center] = await db
      .select({
        wordId: WordEntry.wordId,
        lemma: WordEntry.lemma,
        kind: WordEntry.kind,
        usPronounce: WordEntry.usPronounce,
        ukPronounce: WordEntry.ukPronounce,
        remember: WordEntry.remember,
        stageCount: WordEntry.stageCount,
      })
      .from(WordSlugMap)
      .innerJoin(WordEntry, eq(WordEntry.wordId, WordSlugMap.wordId))
      .where(eq(WordSlugMap.slug, wordSlug))
      .limit(1);

    if (!center) return { center: undefined, nodes: [], edges: [] };

    const base = and(
      gte(Relationship.confidence, minConfidence),
      ne(Relationship.status, "rejected"),
    );

    const outRows = await db
      .select({
        relType: Relationship.relType,
        confidence: Relationship.confidence,
        evidence: Relationship.evidence,
        pos: Relationship.pos,
        note: Relationship.note,
        transCn: Relationship.transCn,
        support: Relationship.support,
        toLemma: Relationship.toLemma,
        toWordId: Relationship.toWordId,
        targetLemma: WordEntry.lemma,
        targetKind: WordEntry.kind,
      })
      .from(Relationship)
      .leftJoin(WordEntry, eq(WordEntry.wordId, Relationship.toWordId))
      .where(and(eq(Relationship.fromWordId, center.wordId), base))
      .orderBy(desc(Relationship.confidence))
      .limit(limit);

    const inRows = await db
      .select({
        relType: Relationship.relType,
        confidence: Relationship.confidence,
        pos: Relationship.pos,
        sourceWordId: Relationship.fromWordId,
        sourceLemma: WordEntry.lemma,
      })
      .from(Relationship)
      .innerJoin(WordEntry, eq(WordEntry.wordId, Relationship.fromWordId))
      .where(and(eq(Relationship.toWordId, center.wordId), base))
      .orderBy(desc(Relationship.confidence))
      .limit(limit);

    const neighborIds = [
      ...new Set(
        [
          ...outRows.map((r) => r.toWordId),
          ...inRows.map((r) => r.sourceWordId),
        ].filter((id): id is string => !!id),
      ),
    ];

    const slugRows = neighborIds.length
      ? await db
          .select({ wordId: WordSlugMap.wordId, slug: WordSlugMap.slug })
          .from(WordSlugMap)
          .where(inArray(WordSlugMap.wordId, neighborIds))
      : [];

    const slugByWordId = new Map<string, string>();
    for (const row of slugRows) {
      if (!slugByWordId.has(row.wordId)) slugByWordId.set(row.wordId, row.slug);
    }

    const nodeByKey = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    const centerKey = center.wordId;

    nodeByKey.set(centerKey, {
      key: centerKey,
      wordId: center.wordId,
      lemma: center.lemma,
      kind: center.kind,
      direction: "center",
      inVocabulary: true,
    });

    const edgeSeen = new Set<string>();

    for (const row of outRows) {
      const key = row.toWordId ?? `lemma:${row.toLemma}`;
      if (!nodeByKey.has(key)) {
        nodeByKey.set(key, {
          key,
          wordId: row.toWordId,
          lemma: row.targetLemma ?? row.toLemma,
          kind: row.targetKind,
          slug: row.toWordId ? slugByWordId.get(row.toWordId) : undefined,
          inVocabulary: !!row.toWordId,
          direction: "out",
        });
      }

      const edgeKey = `${centerKey}\u0001${key}\u0001${row.relType}`;
      if (edgeSeen.has(edgeKey)) continue;
      edgeSeen.add(edgeKey);

      edges.push({
        source: centerKey,
        target: key,
        relType: row.relType,
        confidence: row.confidence,
        evidence: row.evidence,
        pos: row.pos,
        transCn: row.transCn,
        note: row.note,
        support: row.support,
      });
    }

    for (const row of inRows) {
      const key = row.sourceWordId;
      if (!nodeByKey.has(key)) {
        nodeByKey.set(key, {
          key,
          wordId: row.sourceWordId,
          lemma: row.sourceLemma,
          kind: null,
          slug: slugByWordId.get(row.sourceWordId),
          inVocabulary: true,
          direction: "in",
        });
      }

      const edgeKey = `${key}\u0001${centerKey}\u0001${row.relType}`;
      if (edgeSeen.has(edgeKey)) continue;
      edgeSeen.add(edgeKey);

      edges.push({
        source: key,
        target: centerKey,
        relType: row.relType,
        confidence: row.confidence,
        pos: row.pos,
      });
    }

    return {
      center,
      nodes: [...nodeByKey.values()],
      edges,
    };
  });