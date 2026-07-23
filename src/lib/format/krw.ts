/** 원화 금액 — "12,345,678원" */
export function formatKrw(value: number): string {
  return `${new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: 0,
  }).format(value)}원`;
}

/**
 * 1주당 평균 매입가 — 저장하지 않고 표시 시 계산 (plan.md §13.1).
 * 반올림 없이(버림) 소수점 둘째 자리까지, 정수로 떨어지면 소수점 없이 표기.
 * 예: 100,000 / 3주 → "33,333.33원"
 */
export function formatAvgPrice(totalCost: number, quantity: number): string {
  if (quantity <= 0) {
    return "-";
  }
  const truncated = Math.floor((totalCost / quantity) * 100) / 100;
  return `${new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: 2,
  }).format(truncated)}원`;
}

/**
 * 억원 단위 금액 (KIS 시가총액·재무제표 단위) — 1조 이상은 조 단위 병기.
 * 예: 3,566,867 → "356조 6,867억원", 5,930 → "5,930억원"
 */
export function formatEokwon(eokwon: number): string {
  const rounded = Math.round(eokwon);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  const jo = Math.floor(abs / 10_000);
  const eok = abs % 10_000;
  const format = (n: number) =>
    new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n);

  if (jo > 0) {
    return eok > 0
      ? `${sign}${format(jo)}조 ${format(eok)}억원`
      : `${sign}${format(jo)}조원`;
  }
  return `${sign}${format(eok)}억원`;
}

/**
 * 순매수 금액(백만원) 부호 표기 — 양수 앞 "+", 천단위 구분 (Phase 42).
 * 단위(백만원)는 화면 헤더에 별도 표기하므로 접미사를 붙이지 않는다.
 * 예: 2,621,088 → "+2,621,088", -878,805 → "-878,805", 0 → "0"
 */
export function formatNetBuyMillion(value: number): string {
  const rounded = Math.round(value);
  const grouped = new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: 0,
  }).format(Math.abs(rounded));

  if (rounded > 0) {
    return `+${grouped}`;
  }
  if (rounded < 0) {
    return `-${grouped}`;
  }
  return "0";
}

/**
 * 원화 축약 표기 (차트 y축용) — M(백만원)/B(십억원) 영어 단위.
 * 예: 12,000,000 → "12M", 1,000,000,000 → "1B"
 */
export function formatKrwAbbrev(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  const trim = (n: number): string => {
    const fixed = n.toFixed(1);
    return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
  };

  if (abs >= 1_000_000_000) {
    return `${sign}${trim(abs / 1_000_000_000)}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${trim(abs / 1_000_000)}M`;
  }
  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: 0,
  }).format(value);
}
