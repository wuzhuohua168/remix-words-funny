import {
  Button,
  Card,
  Chip,
  SearchField,
  Separator,
  Skeleton,
  cn,
} from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { ArrowLeft, Crosshair, Minus, Plus } from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { href, useNavigate, useSearchParams } from "react-router";
import { useDebounceValue } from "usehooks-ts";
import {
  isWordDetailPanelDrawerOpenAtom,
  wordDetailSlugAtom,
} from "~/common/store";
import { orpc } from "~/common/orpcClient";
import { Empty } from "~/components/common/Empty";
import { LuIcon } from "~/components/common/LuIcon";
import { useMobile } from "~/hooks/useMobile";
import { REL_COLORS, REL_LABELS } from "../WordDetailPanel/WordGraph";

// 全屏星图：以某个词为中心，把 P2 消歧出的关系边铺成一跳星图。
// 布局用固定 viewBox（随容器等比缩放），缩放/平移只改 <g> 的 transform。

const W = 1200;
const H = 820;
const CX = W / 2;
const CY = H / 2;
const R = Math.min(W, H);

const MIN_SCALE = 0.4;
const MAX_SCALE = 3;

const THRESHOLDS = [0.7, 0.8, 0.9];

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

type NeighborEntry = {
  node: GraphNode;
  edge: GraphEdge;
  relTypes: string[];
};

type View = { s: number; x: number; y: number };

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function truncate(word: string, max = 14) {
  return word.length > max ? `${word.slice(0, max - 1)}…` : word;
}

function splitRings(keys: string[], ringCount: number, radii: number[]) {
  const per = Math.ceil(keys.length / ringCount);
  return radii.map((r, index) => ({
    keys: keys.slice(index * per, (index + 1) * per),
    r,
  }));
}

function zoomAroundCenter(view: View, factor: number): View {
  const s = clamp(view.s * factor, MIN_SCALE, MAX_SCALE);
  const ratio = s / view.s;
  return {
    s,
    x: CX - (CX - view.x) * ratio,
    y: CY - (CY - view.y) * ratio,
  };
}

export function GraphPanel() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const wordSlug = searchParams.get("word") ?? "";

  const setWordDetailSlug = useSetAtom(wordDetailSlugAtom);
  const setIsWordDetailPanelDrawerOpen = useSetAtom(
    isWordDetailPanelDrawerOpenAtom,
  );
  const { isMobile } = useMobile();

  const [minConfidence, setMinConfidence] = useState(0.7);
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword] = useDebounceValue(keyword.trim().toLowerCase(), 300);
  const [view, setView] = useState<View>({ s: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    sx: number;
    sy: number;
    vx: number;
    vy: number;
  } | null>(null);
  const movedRef = useRef(false);

  const graphQuery = useQuery(
    orpc.loader.getWordGraph.queryOptions({
      input: { wordSlug, minConfidence, limit: 80 },
      enabled: !!wordSlug,
    }),
  );

  const searchQuery = useQuery(
    orpc.loader.getWordsOfKeyword.queryOptions({
      input: { keyword: debouncedKeyword, cursor: 0 },
      enabled: debouncedKeyword.length > 0,
    }),
  );

  const center = graphQuery.data?.center;
  const nodes = graphQuery.data?.nodes ?? [];
  const edges = graphQuery.data?.edges ?? [];
  const centerKey = center?.wordId ?? "";

  const results = (searchQuery.data?.wordsOfKeyword ?? []).slice(0, 8);

  // 右侧详情面板跟随中心词
  useEffect(() => {
    if (wordSlug) setWordDetailSlug(wordSlug);
  }, [wordSlug, setWordDetailSlug]);

  // 换词时重置视图
  useEffect(() => {
    setView({ s: 1, x: 0, y: 0 });
    setHoverKey(null);
  }, [wordSlug, minConfidence]);

  const entries = useMemo(() => {
    const map = new Map<string, NeighborEntry>();
    for (const edge of edges) {
      const nbKey = edge.source === centerKey ? edge.target : edge.source;
      if (nbKey === centerKey) continue;
      const node = nodes.find((item) => item.key === nbKey);
      if (!node) continue;

      const current = map.get(nbKey);
      if (!current) {
        map.set(nbKey, { node, edge, relTypes: [edge.relType] });
        continue;
      }
      if (!current.relTypes.includes(edge.relType)) {
        current.relTypes.push(edge.relType);
      }
      if (edge.confidence > current.edge.confidence) current.edge = edge;
    }
    return [...map.values()];
  }, [edges, nodes, centerKey]);

  const positions = useMemo(() => {
    const keys = entries.map((entry) => entry.node.key);
    const count = keys.length;
    const rings =
      count <= 10
        ? [{ keys, r: R * 0.34 }]
        : count <= 24
          ? splitRings(keys, 2, [R * 0.24, R * 0.42])
          : splitRings(keys, 3, [R * 0.19, R * 0.32, R * 0.45]);

    const pos = new Map<string, { x: number; y: number }>();
    for (const ring of rings) {
      ring.keys.forEach((key, index) => {
        const angle = (index / ring.keys.length) * Math.PI * 2 - Math.PI / 2;
        pos.set(key, {
          x: CX + Math.cos(angle) * ring.r,
          y: CY + Math.sin(angle) * ring.r,
        });
      });
    }
    return pos;
  }, [entries]);

  const usedRelTypes = useMemo(
    () => [...new Set(entries.flatMap((entry) => entry.relTypes))],
    [entries],
  );

  const hovered = hoverKey
    ? entries.find((entry) => entry.node.key === hoverKey)
    : undefined;

  const goTo = useCallback(
    (slug: string) => {
      setKeyword("");
      setSearchParams({ word: slug });
      if (isMobile) setIsWordDetailPanelDrawerOpen(false);
    },
    [isMobile, setIsWordDetailPanelDrawerOpen, setSearchParams],
  );

  const logicalPerClient = () => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 1;
    const k = Math.min(rect.width / W, rect.height / H);
    return k > 0 ? 1 / k : 1;
  };

  const onWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    setView((prev) => zoomAroundCenter(prev, event.deltaY < 0 ? 1.12 : 1 / 1.12));
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    dragRef.current = {
      sx: event.clientX,
      sy: event.clientY,
      vx: view.x,
      vy: view.y,
    };
    movedRef.current = false;
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.sx;
    const dy = event.clientY - drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true;
    const k = logicalPerClient();
    setView((prev) => ({ ...prev, x: drag.vx + dx * k, y: drag.vy + dy * k }));
  };

  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  function renderSearch() {
    return (
      <div className="relative w-full max-w-xs">
        <SearchField
          fullWidth
          value={keyword}
          onChange={setKeyword}
          onSubmit={() => {
            if (results[0]) goTo(results[0].Word.slug);
          }}
        >
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input
              placeholder="搜索单词，回车定位"
              autoComplete="off"
            />
          </SearchField.Group>
        </SearchField>

        {debouncedKeyword.length > 0 && (
          <Card className="absolute top-11 left-0 z-20 max-h-80 w-full overflow-y-auto p-1">
            {searchQuery.isFetching && results.length === 0 && (
              <div className="space-y-2 p-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton className="h-8 w-full rounded-md" key={index} />
                ))}
              </div>
            )}
            {!searchQuery.isFetching && results.length === 0 && (
              <div className="text-muted p-3 text-sm">没有匹配的词</div>
            )}
            {results.map((item) => (
              <button
                className="hover:bg-accent-soft flex w-full items-center justify-between rounded-md px-3 py-2 text-left"
                key={item.Word.slug}
                type="button"
                onClick={() => goTo(item.Word.slug)}
              >
                <span className="font-merriweathers">{item.Word.word}</span>
                <small className="text-muted">{item.Book.name}</small>
              </button>
            ))}
          </Card>
        )}
      </div>
    );
  }

  function renderCanvas() {
    if (!wordSlug) {
      return (
        <div className="flex h-full items-center justify-center">
          <Empty label="搜索一个单词，展开它的词汇星图" size={96} />
        </div>
      );
    }

    if (graphQuery.isLoading) {
      return (
        <div className="flex h-full items-center justify-center">
          <Skeleton className="h-2/3 w-2/3 rounded-2xl" />
        </div>
      );
    }

    if (!center) {
      return (
        <div className="flex h-full items-center justify-center">
          <Empty label="这个词不在词表里" size={96} />
        </div>
      );
    }

    return (
      <div
        className="relative h-full w-full"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setPointer({
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          });
        }}
      >
        <svg
          ref={svgRef}
          className={cn(
            "h-full w-full touch-none select-none",
            dragging ? "cursor-grabbing" : "cursor-grab",
          )}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${center.lemma} 的词汇关系星图`}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.s})`}>
            {entries.map((entry) => {
              const position = positions.get(entry.node.key);
              if (!position) return null;
              const isIn = entry.node.direction === "in";
              return (
                <line
                  key={`edge-${entry.node.key}`}
                  x1={isIn ? position.x : CX}
                  y1={isIn ? position.y : CY}
                  x2={isIn ? CX : position.x}
                  y2={isIn ? CY : position.y}
                  stroke={REL_COLORS[entry.edge.relType] ?? "#94a3b8"}
                  strokeOpacity={
                    hoverKey && hoverKey !== entry.node.key
                      ? 0.12
                      : 0.28 + entry.edge.confidence * 0.5
                  }
                  strokeWidth={entry.edge.confidence >= 0.9 ? 1.8 : 1.1}
                  strokeDasharray={isIn ? "5 4" : undefined}
                />
              );
            })}

            <circle cx={CX} cy={CY} r={40} fill="var(--accent-soft)" />
            <circle cx={CX} cy={CY} r={11} fill="var(--accent)" />
            <text
              x={CX}
              y={CY + 62}
              textAnchor="middle"
              className="font-merriweathers"
              fontSize={20}
              fill="currentColor"
            >
              {truncate(center.lemma, 18)}
            </text>
            <text
              x={CX}
              y={CY + 82}
              textAnchor="middle"
              fontSize={11}
              fill="currentColor"
              opacity={0.55}
            >
              {`收录 ${center.stageCount} 个学龄段 · ${entries.length} 个关联词`}
            </text>

            {entries.map((entry) => {
              const position = positions.get(entry.node.key);
              if (!position) return null;
              const color = REL_COLORS[entry.edge.relType] ?? "#94a3b8";
              const clickable = !!entry.node.slug;
              const anchor =
                position.x > CX + 8
                  ? "start"
                  : position.x < CX - 8
                    ? "end"
                    : "middle";
              const dim = hoverKey && hoverKey !== entry.node.key;

              return (
                <g
                  key={`node-${entry.node.key}`}
                  className={clickable ? "cursor-pointer" : undefined}
                  opacity={dim ? 0.35 : 1}
                  onMouseEnter={() => setHoverKey(entry.node.key)}
                  onMouseLeave={() => setHoverKey(null)}
                  onClick={() => {
                    if (movedRef.current) return;
                    if (entry.node.slug) goTo(entry.node.slug);
                  }}
                >
                  <circle
                    cx={position.x}
                    cy={position.y}
                    r={hoverKey === entry.node.key ? 8 : 5.5}
                    fill={entry.node.inVocabulary ? color : "transparent"}
                    stroke={color}
                    strokeWidth={1.5}
                  />
                  <text
                    x={
                      position.x +
                      (anchor === "end" ? -10 : anchor === "start" ? 10 : 0)
                    }
                    y={position.y + (anchor === "middle" ? 19 : 4)}
                    textAnchor={anchor}
                    fontSize={11.5}
                    fill="currentColor"
                    opacity={entry.node.inVocabulary ? 0.95 : 0.6}
                  >
                    {truncate(entry.node.lemma)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {hovered && (
          <div
            className="border-separator bg-overlay pointer-events-none absolute z-30 max-w-72 rounded-lg border p-2.5 text-xs shadow-lg"
            style={{ left: pointer.x + 14, top: pointer.y + 14 }}
          >
            <div className="font-merriweathers mb-1 text-sm">
              {hovered.node.lemma}
            </div>
            <div className="text-muted">
              {hovered.relTypes
                .map((type) => REL_LABELS[type] ?? type)
                .join(" / ")}
              {" · "}
              {hovered.node.direction === "in" ? "指向本词" : "本词指向"}
            </div>
            <div className="text-muted">置信度 {hovered.edge.confidence}</div>
            {!!hovered.edge.transCn && (
              <div className="mt-1">{hovered.edge.transCn}</div>
            )}
            {!hovered.node.inVocabulary && (
              <div className="text-muted mt-1">词表外（仅文本节点）</div>
            )}
          </div>
        )}

        <div className="absolute right-3 bottom-3 flex flex-col gap-1.5">
          <Button
            isIconOnly
            aria-label="放大"
            variant="outline"
            onPress={() => setView((prev) => zoomAroundCenter(prev, 1.2))}
          >
            <LuIcon icon={Plus} />
          </Button>
          <Button
            isIconOnly
            aria-label="缩小"
            variant="outline"
            onPress={() => setView((prev) => zoomAroundCenter(prev, 1 / 1.2))}
          >
            <LuIcon icon={Minus} />
          </Button>
          <Button
            isIconOnly
            aria-label="复位"
            variant="outline"
            onPress={() => setView({ s: 1, x: 0, y: 0 })}
          >
            <LuIcon icon={Crosshair} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col">
      <header className="border-separator flex h-18 shrink-0 items-center gap-3 border-b px-4">
        <Button isIconOnly variant="outline" onPress={() => navigate(-1)}>
          <LuIcon icon={ArrowLeft} />
        </Button>
        <div className="font-medium shrink-0">词汇星图</div>
        {renderSearch()}
        <div className="ml-auto hidden items-center gap-1.5 md:flex">
          {THRESHOLDS.map((value) => (
            <Button
              key={value}
              size="sm"
              variant={minConfidence === value ? "primary" : "outline"}
              onPress={() => setMinConfidence(value)}
            >
              ≥ {value}
            </Button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1">{renderCanvas()}</div>

      <footer className="border-separator flex h-11 shrink-0 items-center gap-3 border-t px-4">
        <div className="flex flex-wrap items-center gap-1.5">
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
        <Separator orientation="vertical" className="h-5" />
        <small className="text-muted hidden sm:block">
          虚线 = 该词指向中心词；实线 = 中心词指向该词。滚轮缩放，拖拽平移，点击实心节点重新居中。
        </small>
      </footer>
    </div>
  );
}