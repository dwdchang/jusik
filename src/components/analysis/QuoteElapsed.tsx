"use client";

import { useEffect, useState } from "react";
import styles from "./QuotePending.module.css";

/**
 * 시세 대기 경과 초 — Phase 78.
 *
 * 금융위 주식시세정보는 콜당 지연이 130ms/5.2초로 갈려(2026-07-29 실측) 첫 열람이
 * 5초에 끝나기도, 15초까지 가기도 한다. **진행률(%)은 일부러 쓰지 않았다** — 서버
 * 렌더 중의 진행 상황을 클라이언트로 흘릴 표준 경로가 없어 예측값으로 채울 수밖에 없고,
 * 편차가 3배라 100%에 닿고도 안 끝나는 상황이 잦다(오해를 막으려다 되레 키운다).
 * 대신 **실제 경과 시간**만 정직하게 보여준다.
 *
 * 처음 몇 초는 숫자를 감춘다 — 캐시가 있으면 바로 끝나는데 그때까지 초를 세면
 * 평소에도 느린 화면처럼 보인다.
 */

const ELAPSED_VISIBLE_AFTER_SECONDS = 3;
/** 이 시각을 넘기면 "오래 걸리는 중"으로 문구를 바꾼다 */
const SLOW_AFTER_SECONDS = 8;

export function QuoteElapsed() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (seconds < ELAPSED_VISIBLE_AFTER_SECONDS) {
    return null;
  }

  return (
    <span className={styles.elapsed}>
      {/* 매초 바뀌는 숫자를 읽어주면 스크린리더가 시끄럽다 — 정적 문구만 알린다 */}
      <span className="numeric" aria-hidden="true">
        {seconds}초
      </span>
      {seconds >= SLOW_AFTER_SECONDS ? (
        <span className={styles.hint}>
          처음 조회하는 종목은 10초 이상 걸릴 수 있습니다
        </span>
      ) : null}
    </span>
  );
}
