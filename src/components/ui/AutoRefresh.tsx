"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { invalidateMarketRouterCache } from "@/app/actions";
import { nextScheduledRefreshMs } from "@/lib/market/staleness";

/**
 * 시세 갱신 회차가 실제로 반영되면 화면을 자동으로 새로고침한다 (Phase 77).
 *
 * 배경 — `staleTimes.dynamic`을 갱신 간격과 같은 600초로 올렸기 때문에(next.config.ts),
 * 캐시가 저절로 만료되기를 기다리면 최대 한 회차만큼 묵은 값을 보게 된다. TTL을
 * 시각에 맞춰 동적으로 줄일 수단이 없으므로, 대신 **갱신 시점에 캐시를 능동적으로 버린다**.
 *
 * 동작 — 예정 회차(`nextScheduledRefreshMs`, 시세 잡 스케줄과 동기화된 상수 기반)가
 * 지난 뒤에만 `/api/market/last-refresh`를 확인하고, `at`이 마운트 시 기준값과
 * 달라졌을 때 캐시를 비운다. 예정 시각만 보고 바로 새로고침하지 않는 이유는 잡 실행과
 * Redis 반영에 편차가 있기 때문(같은 이유로 staleness 판정도 20분 유예를 둔다).
 * 회차당 확인은 최대 `GIVE_UP_AFTER_MS / POLL_INTERVAL_MS`회이고, 그 안에 반영되지
 * 않으면 이 회차는 포기하고 다음 회차를 기다린다.
 *
 * 평일 장중이 아니면 다음 회차가 몇 시간~며칠 뒤라 확인 자체가 일어나지 않는다.
 */

/** 예정 회차 이후 확인 간격 */
const POLL_INTERVAL_MS = 30_000;
/** 한 회차를 포기하기까지의 대기 — 잡 자체가 maxDuration 300초라 그보다 넉넉히 잡는다 */
const GIVE_UP_AFTER_MS = 5 * 60_000;

async function fetchLastRefreshAt(): Promise<string | null | undefined> {
  try {
    const res = await fetch("/api/market/last-refresh", { cache: "no-store" });

    if (!res.ok) {
      return undefined; // 401·5xx — 이번 확인만 건너뛴다
    }

    const body: unknown = await res.json();

    if (typeof body === "object" && body !== null && "at" in body) {
      const at = (body as { at: unknown }).at;
      return typeof at === "string" ? at : null;
    }

    return undefined;
  } catch {
    return undefined; // 오프라인·중단 — 다음 확인에서 재시도
  }
}

export function AutoRefresh() {
  const router = useRouter();
  const pathname = usePathname();

  /** 마지막으로 확인한 갱신 시각 — 이 값이 바뀌면 화면이 낡은 것 */
  const baselineRef = useRef<string | null>(null);
  /** 기준값을 확보하기 전에는 판정하지 않는다(첫 확인을 변경으로 오인 방지) */
  const readyRef = useRef(false);
  /** 다음 예정 회차(ms) — 이 시각 전에는 서버를 부르지 않는다 */
  const nextSlotRef = useRef<number | null>(null);
  /** 확인·새로고침 중복 실행 방지 */
  const busyRef = useRef(false);
  /**
   * 화면 이동으로 타이머를 다시 걸면 예정 회차 대기 상태가 초기화돼 그 회차를
   * 통째로 놓친다(`nextScheduledRefreshMs`는 늘 "지금 이후"를 주므로 다음 회차로 밀린다).
   * 그래서 경로는 의존성이 아니라 ref로 읽고, 타이머는 마운트 때 한 번만 건다.
   */
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const check = useCallback(async () => {
    if (
      busyRef.current ||
      pathnameRef.current === "/login" || // 시세를 보여주지 않는 화면
      document.visibilityState !== "visible"
    ) {
      return;
    }

    const slot = nextSlotRef.current;

    if (slot === null) {
      return; // 앞으로 7일 내 예정 회차 없음(비정상) — 판정 보류
    }

    busyRef.current = true;

    try {
      const now = Date.now();

      if (!readyRef.current) {
        const at = await fetchLastRefreshAt();

        if (at !== undefined) {
          baselineRef.current = at;
          readyRef.current = true;
        }

        return;
      }

      if (now < slot) {
        return; // 아직 갱신 예정 전 — 확인할 필요 없음
      }

      const at = await fetchLastRefreshAt();

      if (at === undefined) {
        return;
      }

      if (at !== null && at !== baselineRef.current) {
        baselineRef.current = at;
        nextSlotRef.current = nextScheduledRefreshMs();
        await invalidateMarketRouterCache();
        router.refresh();
        return;
      }

      if (now > slot + GIVE_UP_AFTER_MS) {
        nextSlotRef.current = nextScheduledRefreshMs(); // 이 회차 포기
      }
    } finally {
      busyRef.current = false;
    }
  }, [router]);

  useEffect(() => {
    nextSlotRef.current = nextScheduledRefreshMs();
    void check(); // 마운트 직후 기준값 확보

    const timer = window.setInterval(() => void check(), POLL_INTERVAL_MS);
    // 백그라운드 탭은 타이머가 스로틀링되므로 복귀 시점에 한 번 더 확인한다
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  return null;
}
