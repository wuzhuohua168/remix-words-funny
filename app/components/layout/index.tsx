import { BooksPanel } from "./BooksPanel";
import { WordDetailPanel } from "./WordDetailPanel";
import { WordsPanel } from "./WordsPanel";
import { Surface } from "@heroui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "~/common/queryClient";
import { GlobalComponents } from "../global";
import type { ReactNode } from "react";
import { useLocation } from "react-router";

export function AppLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const isFullBleedPage =
    pathname.startsWith("/study") ||
    pathname.startsWith("/graph") ||
    pathname.startsWith("/favorites");

  return (
    <QueryClientProvider client={queryClient}>
      <GlobalComponents />
      <main className="bg-background flex h-screen w-screen overflow-hidden">
        <Surface className="border-separator hidden h-screen w-87.5 shrink-0 flex-col border-r xl:flex">
          <BooksPanel />
        </Surface>

        <section className="min-w-0 flex-1">
          {children}
          {!isFullBleedPage && <WordsPanel />}
        </section>

        <Surface className="border-separator z-10 hidden h-screen w-100 shrink-0 overflow-y-auto border-l xl:block">
          <WordDetailPanel />
        </Surface>
      </main>
    </QueryClientProvider>
  );
}
