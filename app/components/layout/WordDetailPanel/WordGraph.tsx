import { Button, Chip, Separator } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue, useSetAtom } from "jotai";
import { Maximize2 } from "lucide-react";
import { useMemo } from "react";
import { href, useNavigate } from "react-router";
import {
  isWordDetailPanelDrawerOpenAtom,
  wordDetailSlugAtom,
} from "~/common/store";
import { orpc } from "~/common/orpcClient";
import { LuIcon } from "~/components/common/LuIcon";
import { useMobile } from "~/hooks/useMobile";
import { WordDetailSectionSkeleton } from "./WordDetailSectionSkeleton";

export const REL_COLORS: Record<string, string> = {
  synonym: "#4c8dff",
  collocation: "#f0b429",
  variant: "#a78bfa",
  inflection: "#3ecf8e",
  derivative: "#22d3ee",
  root: "#f2555a",
  family: "#94a3b8",
};

export const REL_LABELS: Record<string, string> = {
  synonym: "同义",
  collocation: "搭配",
  variant: "变体",
  inflection: "屈折",
  derivative: "派生",
  root: "原形",
  family: "同根",
};

const W = 360;
const H = 344;
const CX = W / 2;
const CY = H / 2;

function truncate(word: string, max = 13) {
  return word.length > max ? `${word.slice(0, max - 1)}…` : word;
}

export function WordGraph() {
  const wordDetailSlug = useAtomValue(wordDetailSlugAtom);
  const setWordDetailSlug = useSetAtom(wordDetailSlugAtom);
  const setIsWordDetailPanelDrawerOpen = useSetAtom(
    isWordDetailPanelDrawerOpenAtom,
  );
  const { isMobile } = useMobile();
  const navigate = useNavigate();

  const graphQuery = useQuery(
    orpc.loader.getWordGraph.queryOptions({
      input: { wordSlug: wordDetailSlug, minConfidence: 0.7, limit: 60 },
      enabled: !!wordDetailSlug,
    }),
  );

  const { center, nodes = [], edges = [] } = graphQuery.data || {};

  const layout = useMemo(() => {
    const neighbors = nodes.filter((node) => node.direction !== "center");
    const positions = new Map<string, { x: number; y: number }>();
    if (center) positions.set(center.wordId, { x: CX, y: CY });

    const count = neighbors.length;
    const rings =
      count <= 12
        ? [{ items: neighbors, r: 126 }]
        : [
            { items: neighbors.slice(0, Math.ceil(count / 2)), r: 88 },
            { items: neighbors.slice(Math.ceil(count / 2)), r: 142 },
          ];

    for (const ring of rings) {
      ring.items.forEach((node, index) => {
        const angle = (index / ring.items.length) * Math.PI * 2 - Math.PI / 2;
        positions.set(node.key, {
          x: CX + Math.cos(angle) * ring.r,
          y: CY + Math.sin(angle) * ring.r,
        });
      });
    }

    return { neighbors, positions };
  }, [nodes, center]);

  if (graphQuery.isFetching) return <WordDetailSectionSkeleton />;
  if (!center || layout.neighbors.length === 0) return null;

  const usedRelTypes = [...new Set(edges.map((edge) => edge.relType))];
  const centerKey = center.wordId;
  const edgeOfNode = (key: string) =>
    edges.find((edge) => edge.target === key && edge.source === centerKey) ??
    edges.find((edge) => edge.source === key && edge.target === centerKey);

  return (
    <div>
      <Separator />
      <div className="my-4 flex items-center justify-between">
        <div className="text-xl font-medium">词汇星图</div>
        <div className="flex items-center gap-2">
          <small className="text-muted">
            {layout.neighbors.length} 个关联词 · {edges.length} 条边
          </small>
          <Button
            isIconOnly
            size="sm"
            variant="outline"
            aria-label="全屏星图"
            onPress={() => {
              navigate(
                `${href("/graph")}?word=${encodeURIComponent(wordDetailSlug)}`,
              );
            }}
          >
            <LuIcon icon={Maximize2} />
          </Button>
        </div>
      </div>

      <svg
        className="w-full select-none"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${center.lemma} 的词汇关系图`}
      >
        {edges.map((edge, index) => {
          const from = layout.positions.get(edge.source);
          const to = layout.positions.get(edge.target);
          if (!from || !to) return null;
          return (
            <line
              key={`edge-${index}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={REL_COLORS[edge.relType] ?? "#94a3b8"}
              strokeOpacity={0.28 + edge.confidence * 0.5}
              strokeWidth={edge.confidence >= 0.9 ? 1.6 : 1}
            >
              <title>
                {`${edge.relType} · 置信度 ${edge.confidence}${
                  edge.transCn ? ` · ${edge.transCn}` : ""
                }`}
              </title>
            </line>
          );
        })}

        <circle cx={CX} cy={CY} r={26} fill="var(--accent-soft)" />
        <circle cx={CX} cy={CY} r={7} fill="var(--accent)" />
        <text
          x={CX}
          y={CY + 34}
          textAnchor="middle"
          className="font-merriweathers"
          fontSize={13}
          fill="currentColor"
        >
          {truncate(center.lemma, 16)}
        </text>

        {layout.neighbors.map((node) => {
          const position = layout.positions.get(node.key);
          if (!position) return null;
          const color =
            REL_COLORS[
              edges.find((edge) => edge.target === node.key)?.relType ?? ""
            ] ?? "#94a3b8";
          const clickable = !!node.slug;
          const anchor =
            position.x > CX + 8 ? "start" : position.x < CX - 8 ? "end" : "middle";

          return (
            <g
              key={node.key}
              className={clickable ? "cursor-pointer" : undefined}
              onClick={() => {
                if (!node.slug) return;
                setWordDetailSlug(node.slug);
                isMobile && setIsWordDetailPanelDrawerOpen(true);
              }}
            >
              <circle
                cx={position.x}
                cy={position.y}
                r={5}
                fill={node.inVocabulary ? color : "transparent"}
                stroke={color}
                strokeWidth={1.4}
              />
              <text
                x={position.x + (anchor === "end" ? -9 : anchor === "start" ? 9 : 0)}
                y={position.y + (anchor === "middle" ? 17 : 3.5)}
                textAnchor={anchor}
                fontSize={10}
                fill="currentColor"
                opacity={node.inVocabulary ? 0.95 : 0.6}
              >
                {truncate(node.lemma)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {usedRelTypes.map((relType) => (
          <Chip key={relType} size="sm" variant="soft">
            <span
              className="mr-1 inline-block size-2 rounded-full align-middle"
              style={{ background: REL_COLORS[relType] ?? "#94a3b8" }}
            />
            {REL_LABELS[relType] ?? relType}
          </Chip>
        ))}
      </div>
      <small className="text-muted mt-2 block">
        关系来自 Synonym / Cognate 消歧，均为候选边（置信度 ≥ 0.7）。点击实心节点可跳转。
      </small>
    </div>
  );
}