import {
  Button,
  Chip,
  Input,
  Label,
  Modal,
  Spinner,
  TextField,
  toast,
  useOverlayState,
} from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { isPlanModalOpenAtom } from "~/common/store";
import { orpc } from "~/common/orpcClient";

// 学习计划编辑器：每日新词 / 复习上限 + 词表范围（Stage 多选）。
// 只维护一条「默认计划」（按 userId × name 幂等 upsert）；
// 范围留空 = 全部词表，此时新词不受 Stage 过滤。

const clampInt = (value: string, min: number, max: number) => {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
};

export function PlanModal() {
  const [isPlanModalOpen, setIsPlanModalOpen] = useAtom(isPlanModalOpenAtom);
  const queryClient = useQueryClient();

  const planQuery = useQuery(orpc.loader.getMyPlan.queryOptions());
  const savePlanMutation = useMutation(orpc.action.savePlan.mutationOptions());

  const plan = planQuery.data?.plan;
  const stages = planQuery.data?.stages ?? [];

  const [dailyNew, setDailyNew] = useState("20");
  const [dailyReview, setDailyReview] = useState("100");
  const [selected, setSelected] = useState<string[]>([]);

  // 每次打开时用服务端计划回填一次，避免编辑中被后台刷新覆盖
  const syncedRef = useRef(false);
  useEffect(() => {
    if (!isPlanModalOpen) {
      syncedRef.current = false;
      return;
    }
    if (syncedRef.current || !plan) return;
    setDailyNew(String(plan.dailyNew));
    setDailyReview(String(plan.dailyReview));
    setSelected(plan.stageSlugs);
    syncedRef.current = true;
  }, [isPlanModalOpen, plan]);

  const state = useOverlayState({
    isOpen: isPlanModalOpen,
    onOpenChange: setIsPlanModalOpen,
  });

  const toggleStage = (slug: string) => {
    setSelected((prev) =>
      prev.includes(slug)
        ? prev.filter((item) => item !== slug)
        : [...prev, slug],
    );
  };

  const handleSave = async () => {
    try {
      await savePlanMutation.mutateAsync({
        name: "默认计划",
        dailyNew: clampInt(dailyNew, 0, 200),
        dailyReview: clampInt(dailyReview, 0, 1000),
        stageSlugs: selected,
      });
      toast.success("计划已保存");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.loader.getMyPlan.queryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: orpc.loader.getStudyQueue.queryKey({
            input: { limit: 20 },
          }),
        }),
      ]);
      state.close();
    } catch {
      toast.danger("保存失败，请重试");
    }
  };

  const selectedCount = selected.length;
  const totalWords = stages
    .filter((stage) => selected.includes(stage.slug))
    .reduce((sum, stage) => sum + stage.wordCount, 0);

  return (
    <Modal state={state}>
      <Modal.Backdrop variant="blur">
        <Modal.Container size="lg" placement="center">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>学习计划</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-3">
                  <TextField fullWidth variant="secondary">
                    <Label>每日新词上限</Label>
                    <Input
                      inputMode="numeric"
                      type="number"
                      value={dailyNew}
                      onChange={(event) => setDailyNew(event.target.value)}
                    />
                  </TextField>
                  <TextField fullWidth variant="secondary">
                    <Label>每日复习上限</Label>
                    <Input
                      inputMode="numeric"
                      type="number"
                      value={dailyReview}
                      onChange={(event) => setDailyReview(event.target.value)}
                    />
                  </TextField>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Label>词表范围</Label>
                    <div className="flex items-center gap-2">
                      <small className="text-muted">
                        {selectedCount === 0
                          ? "全部词表"
                          : `${selectedCount} 份 · ${totalWords} 词`}
                      </small>
                      <Button
                        size="sm"
                        variant="outline"
                        isDisabled={selectedCount === 0}
                        onPress={() => setSelected([])}
                      >
                        清空（全部）
                      </Button>
                    </div>
                  </div>
                  <small className="text-muted">
                    不选 = 从全部词表取新词；选中后只从所选学龄段取新词。到期复习不受范围限制。
                  </small>
                  <div className="border-separator max-h-64 overflow-y-auto rounded-lg border p-2">
                    {planQuery.isLoading && (
                      <div className="flex justify-center p-4">
                        <Spinner size="sm" />
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {stages.map((stage) => {
                        const active = selected.includes(stage.slug);
                        return (
                          <Chip
                            className="cursor-pointer"
                            color={active ? "accent" : "default"}
                            key={stage.slug}
                            size="sm"
                            variant={active ? "soft" : "secondary"}
                            onClick={() => toggleStage(stage.slug)}
                          >
                            {stage.name}
                            <span className="text-muted ml-1">
                              {stage.wordCount}
                            </span>
                          </Chip>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button
                fullWidth
                variant="primary"
                isDisabled={savePlanMutation.isPending}
                onPress={() => void handleSave()}
              >
                {savePlanMutation.isPending ? <Spinner size="sm" /> : "保存计划"}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}