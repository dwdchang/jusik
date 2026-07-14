"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { searchStocks, type StockSearchResult } from "@/lib/stocks/search";
import styles from "./StockSearchInput.module.css";

/**
 * 종목명 검색 입력 — 등록 폼(보유·관심종목)의 코드 직접 입력을 대체 (§17.11).
 * 디바운스 후 searchStocks Server Action을 호출해 결과 드롭다운을 띄우고,
 * 선택하면 제출될 hidden {name} 필드에 종목코드를 채운다. 미선택 시엔
 * 검색 입력이 required라 빈 제출을 막고, 서버 액션도 형식 검증으로 재차 막는다.
 */

interface Props {
  /** 제출될 hidden 필드 이름 (기본 symbolCode) */
  name?: string;
  placeholder?: string;
}

const DEBOUNCE_MS = 250;

const MARKET_LABEL: Record<StockSearchResult["market"], string> = {
  KOSPI: "코스피",
  KOSDAQ: "코스닥",
};

export function StockSearchInput({
  name = "symbolCode",
  placeholder = "종목명 또는 코드로 검색",
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [selected, setSelected] = useState<StockSearchResult | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const listboxId = useId();
  const reqId = useRef(0);

  // 디바운스 검색 — 선택 상태나 빈 입력에서는 조회하지 않는다.
  // setState는 전부 타이머/프로미스 콜백 안에서만 호출한다(이펙트 본문 동기 setState 금지).
  useEffect(() => {
    const q = query.trim();
    if (selected !== null || q.length === 0) {
      return;
    }

    const timer = setTimeout(() => {
      const currentReq = ++reqId.current;
      setLoading(true);
      searchStocks(q)
        .then((found) => {
          if (currentReq !== reqId.current) return;
          setResults(found);
          setActiveIndex(found.length > 0 ? 0 : -1);
          setOpen(true);
        })
        .catch(() => {
          if (currentReq === reqId.current) setResults([]);
        })
        .finally(() => {
          if (currentReq === reqId.current) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, selected]);

  const choose = useCallback((item: StockSearchResult) => {
    setSelected(item);
    setQuery("");
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const clear = useCallback(() => {
    setSelected(null);
    setQuery("");
    setResults([]);
    setOpen(false);
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      if (open && activeIndex >= 0 && results[activeIndex]) {
        // 목록에서 선택 — 폼 제출로 이어지지 않게 막는다
        event.preventDefault();
        choose(results[activeIndex]);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  // 선택 완료 — 종목 배지 + hidden 필드만 렌더
  if (selected !== null) {
    return (
      <div className={styles.field}>
        <input type="hidden" name={name} value={selected.code} />
        <div className={styles.chip}>
          <span className={styles.chipName}>{selected.name}</span>
          <span className={`${styles.chipCode} numeric`}>{selected.code}</span>
          <span className={styles.chipMarket}>
            {MARKET_LABEL[selected.market]}
          </span>
          <button
            type="button"
            className={styles.chipClear}
            onClick={clear}
            aria-label="선택 해제"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.field}>
      {/* 미선택 상태 — 서버로는 빈 값이 가고, required가 빈 제출을 막는다 */}
      <input type="hidden" name={name} value="" />
      <input
        type="text"
        className={styles.input}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
        onBlur={() => {
          // 옵션 클릭(onMouseDown preventDefault)이 먼저 처리되도록 닫기만 지연
          setTimeout(() => setOpen(false), 120);
        }}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
        }
        autoComplete="off"
        required
      />

      {open && query.trim().length > 0 ? (
        <ul className={styles.dropdown} id={listboxId} role="listbox">
          {loading ? (
            <li className={styles.status}>검색 중…</li>
          ) : results.length === 0 ? (
            <li className={styles.status}>일치하는 종목이 없습니다</li>
          ) : (
            results.map((item, index) => (
              <li
                key={item.code}
                id={`${listboxId}-opt-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={
                  index === activeIndex
                    ? `${styles.option} ${styles.optionActive}`
                    : styles.option
                }
                // blur보다 먼저 선택되도록 mousedown에서 처리
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(item);
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className={styles.optionName}>{item.name}</span>
                <span className={`${styles.optionCode} numeric`}>
                  {item.code}
                </span>
                <span className={styles.optionMarket}>
                  {MARKET_LABEL[item.market]}
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
