"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsdEok } from "@/lib/format/trade";
import type { TradeDetailCountryRow } from "@/lib/feeds/tradeDetail";
import styles from "./CountryTradeTable.module.css";

/**
 * 국가별 수출입 표 + 국가 클릭 시 품목 팝업 — Phase 17-5 (plan.md §17.15).
 *
 * 팝업 열림 상태는 순수 상호작용이라 서버로 못 옮기는 최소 Client 예외다.
 * 표시할 데이터(상위 국가 + 국가별 상위 품목)는 전부 Server에서 props로 내려오므로
 * 팝업을 열 때 fetch가 발생하지 않는다 — 클릭당 API 호출 0.
 *
 * 팝업은 네이티브 <dialog>라 포커스 트랩·Esc 닫기·백드롭을 브라우저가 처리한다
 * (신규 의존성 0).
 */
export function CountryTradeTable({
  countries,
}: {
  countries: TradeDetailCountryRow[];
}) {
  const [selected, setSelected] = useState<TradeDetailCountryRow | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // showModal()은 명령형 API라 상태 변화를 렌더 후에 DOM으로 흘려보낸다.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (selected !== null && !dialog.open) {
      dialog.showModal();
    } else if (selected === null && dialog.open) {
      dialog.close();
    }
  }, [selected]);

  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">국가</th>
            <th scope="col">수출</th>
            <th scope="col">수입</th>
          </tr>
        </thead>
        <tbody>
          {countries.map((country) => (
            <tr key={country.code ?? "other"}>
              <th scope="row" className={styles.nameCell}>
                {country.items.length > 0 ? (
                  <button
                    type="button"
                    className={styles.nameButton}
                    onClick={() => setSelected(country)}
                  >
                    {country.name}
                    <span aria-hidden="true" className={styles.chevron}>
                      ›
                    </span>
                  </button>
                ) : (
                  // "기타"는 여러 나라를 합친 줄이라 품목 내역이 없다 — 클릭 불가
                  <span className={styles.otherName}>{country.name}</span>
                )}
              </th>
              <td className="numeric">{formatUsdEok(country.expDlr)}</td>
              <td className="numeric">{formatUsdEok(country.impDlr)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-label={
          selected === null ? "품목 내역" : `${selected.name} 품목 내역`
        }
        onClose={() => setSelected(null)}
      >
        {selected !== null ? (
          <div className={styles.dialogBody}>
            <div className={styles.dialogHead}>
              <h2 className={styles.dialogTitle}>{selected.name}</h2>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setSelected(null)}
              >
                닫기
              </button>
            </div>

            <table className={styles.dialogTable}>
              <thead>
                <tr>
                  <th scope="col">품목</th>
                  <th scope="col">수출</th>
                  <th scope="col">수입</th>
                </tr>
              </thead>
              <tbody>
                {selected.items.map((item) => (
                  <tr key={item.code}>
                    {/* 품목명은 관세청 법령 원문이라 길다 — 상세 페이지와 같은 표기 */}
                    <th scope="row" className={styles.itemCell}>
                      <span className={`numeric ${styles.hsCode}`}>
                        {item.code}
                      </span>
                      <span className={styles.itemName} title={item.name}>
                        {item.name}
                      </span>
                    </th>
                    <td className="numeric">{formatUsdEok(item.expDlr)}</td>
                    <td className="numeric">{formatUsdEok(item.impDlr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className={styles.dialogNote}>
              {selected.name} 교역액 상위 {selected.items.length}개 품목 (HS 4단위)
            </p>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
