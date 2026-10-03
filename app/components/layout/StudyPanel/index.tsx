import {
  Button,
  Card,
  Chip,
  ProgressBar,
  Separator,
  Skeleton,
  Spinner,
  cn,
  toast,
} from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { ArrowLeft, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  isPlanModalOpenAtom,
  isSignInModalOpenAtom,
  isWordDetailPanelDrawerOpenAtom,
  wordDetailSlugAtom,
} from "~/common/store";
import { orpc } from "~/common/orpcClient";
import { LuIcon } from "~/components/common/LuIcon";
import { useMobile } from "~/hooks/useMobile";
import { useMyUserInfo } from "~/hooks/useMyUserInfo";
import { WordAudioButton } from "../WordDetailPanel/WordAudioButton";
import { REL_COLORS, REL_LABELS } from "../WordDetailPanel/WordGraph";

const QUEUE_SIZE = 20;

const GRADES = [
  { key: "again", label: "重来", hint: "1", tone: "var(--danger)" },
  { key: "hard", label: "困难", hint: "2", tone: "var(--warning)" },
  { key: "good", label: "一般", hint: "3", tone: "var(--accent)" },
  { key: "easy", label: "简单", hint: "4", tone: "var(--success)" },
] as const;

type Grade = (typeof GRADES)[number]["key"];

const emptyTally: Record<Grade, number> = {
  again: 0,
  hard: 0,
  good: 0,
  easy: 0,
};

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <Chip size="sm" variant="soft">
      <span className="text-muted mr-1">{label}</span>
      <span className="font-medium">{value}</span>
    </Chip>
  );
}

export function StudyPanel() {
  const navigate = useNavigate();
  const { isLogin } = useMyUserInfo();
  const setIsSignInModalOpen = useSetAtom(isSignInModalOpenAtom);
  const setIsPlanModalOpen = useSetAtom(isPlanModalOpenAtom);
  const setWordDetailSlug = useSetAtom(wordDetailSlugAtom);
  const setIsWordDetailPanelDrawerOpen = useSetAtom(
    isWordDetailPanelDrawerOpenAtom,
  );
  const { isMobile } = useMobile();

  const queryClient = useQueryClient();

  const queueQuery = useQuery(
    orpc.loader.getStudyQueue.queryOptions({ input: { limit: QUEUE_SIZE } }),
  );

  const reviewMutation = useMutation(orpc.action.reviewWord.mutationOptions());

  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [tally, setTally] = useState(emptyTally);

  const data = queueQuery.data;
  const cards = data?.cards ?? [];
  const card = cards[index];
  const finished = cards.length > 0 && index >= cards.length;

  const graphQuery = useQuery(
    orpc.loader.getWordGraph.queryOptions({
      input: { wordSlug: card?.slug ?? "", minConfidence: 0.7, limit: 12 },
      enabled: !!card?.slug && revealed,
    }),
  );

  // 右侧详情面板跟随当前卡片，顺手把星图带出来
  useEffect(() => {
    if (card?.slug) setWordDetailSlug(card.slug);
  }, [card?.slug, setWordDetailSlug]);

  const grade = useCallback(
    async (value: Grade) => {
      if (!card) return;

      try {
        await reviewMutation.mutateAsync({ wordId: card.wordId, grade: value });
      } catch {
        toast.danger("提交失败，请重试");
        return;
      }

      setTally((prev) => ({ ...prev, [value]: prev[value] + 1 }));
      setRevealed(false);
      setIndex((prev) => prev + 1);
      void queryClient.invalidateQueries({
        queryKey: orpc.loader.getStudyQueue.queryKey({
          input: { limit: QUEUE_SIZE },
        }),
      });
    },
    [card, queryClient, reviewMutation],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (finished || !card) return;

      if (!revealed) {
        if (event.code === "Space" || event.key === "Enter") {
          event.preventDefault();
          setRevealed(true);
        }
        return;
      }

      const matched = GRADES.find((item) => item.hint === event.key);
      if (matched) {
        event.preventDefault();
        void grade(matched.key);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [card, finished, grade, revealed]);

  const restart = () => {
    setIndex(0);
    setRevealed(false);
    setTally(emptyTally);
    void queueQuery.refetch();
  };

  const neighborNodes = (graphQuery.data?.nodes ?? []).filter(
    (node) => node.direction !== "center" && node.slug,
  );

  return (
    <div className="flex h-screen w-full flex-col">
      <header className="border-separator flex h-18 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button isIconOnly variant="outline" onPress={() => navigate(-1)}>
            <LuIcon icon={ArrowLeft} />
          </Button>
          <div className="font-medium">背诵</div>
        </div>

        <div className="flex items-center gap-2">
          {!!data?.plan && (
            <small className="text-muted hidden md:block">
              每日新词 {data.plan.dailyNew} · 复习 {data.plan.dailyReview}
              {data.plan.stageSlugs.length > 0 &&
                ` · 范围 ${data.plan.stageSlugs.length} 份`}
            </small>
          )}
          {!!data?.stats && (
            <div className="hidden items-center gap-1.5 sm:flex">
              <StatChip label="到期" value={data.stats.due} />
              <StatChip label="新词" value={data.stats.newAvailable} />
              <StatChip label="学习中" value={data.stats.learning} />
              <StatChip label="已掌握" value={data.stats.mastered} />
            </div>
          )}
          {isLogin && (
            <Button
              isIconOnly
              size="sm"
              variant="outline"
              aria-label="编辑计划"
              onPress={() => setIsPlanModalOpen(true)}
            >
              <LuIcon icon={SlidersHorizontal} />
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6">
          {queueQuery.isLoading && (
            <>
              <Skeleton className="h-3 w-full rounded-full" />
              <Skeleton className="h-56 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </>
          )}

          {!queueQuery.isLoading && !isLogin && (
            <Card className="items-center p-8 text-center">
              <div className="text-lg font-medium">登录后开始背诵</div>
              <small className="text-muted mt-1">
                学习进度按词条记账，跨词表通用，换一本书也能接着背。
              </small>
              <Button
                className="mt-5"
                variant="primary"
                onPress={() => setIsSignInModalOpen(true)}
              >
                去登录
              </Button>
            </Card>
          )}

          {!queueQuery.isLoading && isLogin && cards.length === 0 && (
            <Card className="items-center p-8 text-center">
              <div className="text-lg font-medium">今天没有待学单词</div>
              <small className="text-muted mt-1">
                已跟踪 {data?.stats.tracked ?? 0} 个词条 · 学习中{" "}
                {data?.stats.learning ?? 0} · 已掌握{" "}
                {data?.stats.mastered ?? 0}
              </small>
              <Button className="mt-5" variant="outline" onPress={restart}>
                <LuIcon icon={RotateCcw} />
                刷新队列
              </Button>
            </Card>
          )}

          {!queueQuery.isLoading && isLogin && finished && (
            <Card className="items-center p-8 text-center">
              <div className="text-lg font-medium">本轮完成</div>
              <small className="text-muted mt-1">
                共 {cards.length} 张 · 重来 {tally.again} · 困难 {tally.hard} ·
                一般 {tally.good} · 简单 {tally.easy}
              </small>
              <Button className="mt-5" variant="primary" onPress={restart}>
                <LuIcon icon={RotateCcw} />
                再来一轮
              </Button>
            </Card>
          )}

          {!queueQuery.isLoading && isLogin && card && (
            <>
              <div className="flex items-center gap-3">
                <ProgressBar
                  color="accent"
                  size="sm"
                  value={
                    cards.length
                      ? Math.round((index / cards.length) * 100)
                      : 0
                  }
                >
                  <ProgressBar.Track>
                    <ProgressBar.Fill />
                  </ProgressBar.Track>
                </ProgressBar>
                <small className="text-muted shrink-0">
                  {index + 1} / {cards.length}
                </small>
              </div>

              <Card className="flex min-h-56 flex-col items-center justify-center gap-4 p-8">
                <div className="font-merriweathers text-center text-5xl">
                  {card.lemma}
                </div>

                <div className="flex items-center gap-2">
                  {!!card.usPronounce && (
                    <>
                      <WordAudioButton word={card.lemma} />
                      <div className="text-muted">/{card.usPronounce}/</div>
                    </>
                  )}
                  {card.isNew ? (
                    <Chip size="sm" variant="soft" color="accent">
                      新词
                    </Chip>
                  ) : (
                    <Chip size="sm" variant="soft">
                      {card.state?.stage === "relearning" ? "重学" : "复习"} ·{" "}
                      {card.state?.intervalDays ?? 0} 天
                    </Chip>
                  )}
                </div>

                {!revealed && (
                  <Button
                    className="mt-2"
                    variant="outline"
                    onPress={() => setRevealed(true)}
                  >
                    显示释义（空格）
                  </Button>
                )}

                {revealed && (
                  <div className="w-full">
                    <Separator />
                    <div className="mt-4 flex flex-col gap-2">
                      {card.senses.length === 0 && (
                        <small className="text-muted">暂无释义</small>
                      )}
                      {card.senses.map((sense, senseIndex) => (
                        <div
                          className="flex items-start gap-2"
                          key={`${sense.transCn}-${senseIndex}`}
                        >
                          <Chip size="sm" variant="soft" color="accent">
                            {sense.pos || "未知"}
                          </Chip>
                          <div>{sense.transCn}</div>
                        </div>
                      ))}
                    </div>

                    {!!card.remember && (
                      <Card
                        className="bg-accent-soft border-accent mt-4 border"
                        variant="secondary"
                      >
                        <Card.Content>{card.remember}</Card.Content>
                      </Card>
                    )}

                    {neighborNodes.length > 0 && (
                      <div className="mt-4">
                        <small className="text-muted">关联词</small>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {neighborNodes.map((node) => {
                            const relType =
                              graphQuery.data?.edges.find(
                                (edge) => edge.target === node.key,
                              )?.relType ?? "";
                            return (
                              <Chip
                                className="cursor-pointer"
                                key={node.key}
                                size="sm"
                                variant="soft"
                                onClick={() => {
                                  if (!node.slug) return;
                                  setWordDetailSlug(node.slug);
                                  isMobile &&
                                    setIsWordDetailPanelDrawerOpen(true);
                                }}
                              >
                                <span
                                  className="mr-1 inline-block size-2 rounded-full align-middle"
                                  style={{
                                    background:
                                      REL_COLORS[relType] ?? "#94a3b8",
                                  }}
                                />
                                {node.lemma}
                                {relType ? ` · ${REL_LABELS[relType] ?? relType}` : ""}
                              </Chip>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>

              {revealed ? (
                <div className="grid grid-cols-4 gap-2">
                  {GRADES.map((item) => (
                    <Button
                      className={cn("h-12 font-medium")}
                      isDisabled={reviewMutation.isPending}
                      key={item.key}
                      style={{ color: item.tone, borderColor: item.tone }}
                      variant="outline"
                      onPress={() => void grade(item.key)}
                    >
                      {item.label}
                      <span className="text-muted ml-1 text-xs">
                        {item.hint}
                      </span>
                    </Button>
                  ))}
                </div>
              ) : (
                <Button
                  className="h-12"
                  variant="primary"
                  onPress={() => setRevealed(true)}
                >
                  显示释义（空格）
                </Button>
              )}

              <small className="text-muted text-center">
                按 1 重来 · 2 困难 · 3 一般 · 4 简单；空格显示释义。评分决定下次出现时间（SM-2）。
              </small>
            </>
          )}

          {queueQuery.isFetching && !queueQuery.isLoading && (
            <div className="flex justify-center">
              <Spinner size="sm" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}