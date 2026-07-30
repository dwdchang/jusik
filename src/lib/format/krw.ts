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
 * signed=true면 양수 앞에 "+"를 붙인다(전일 대비 시총 증감용, Phase 68). 음수는 항상 "-".
 */
export function formatEokwon(eokwon: number, signed = false): string {
  const rounded = Math.round(eokwon);
  const sign = rounded < 0 ? "-" : signed && rounded > 0 ? "+" : "";
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

const koNum = (n: number): string =>
  new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n);

/**
 * 백만원 → 조·억·만원 상위 2단 축약 한글 표기 (Phase 50). 저장은 백만원 원값,
 * 표시 시점에만 변환한다. 가장 큰 단위와 그 아래 한 단만 남기고 하위 단은 버린다.
 * 예: 100 → "1억원", 110 → "1억 1000만원", 2,621,088 → "26조 2109억원",
 *     50 → "5000만원", 0 → "0원".
 * signed=true면 양수 앞에 "+"를 붙인다(순매수/순매도 구분용). 음수는 항상 "-".
 */
export function formatEokFromMillion(
  millionWon: number,
  signed = false
): string {
  const rounded = Math.round(millionWon);
  if (rounded === 0) {
    return "0원";
  }
  const sign = rounded < 0 ? "-" : signed ? "+" : "";
  // 백만원 = 100만원 → 만원 단위 정수로 환산 (백만원은 항상 만원의 배수)
  const manwon = Math.abs(rounded) * 100;
  const jo = Math.floor(manwon / 100_000_000);
  const eok = Math.floor((manwon % 100_000_000) / 10_000);
  const man = manwon % 10_000;

  if (jo > 0) {
    return eok > 0
      ? `${sign}${koNum(jo)}조 ${koNum(eok)}억원`
      : `${sign}${koNum(jo)}조원`;
  }
  if (eok > 0) {
    return man > 0
      ? `${sign}${koNum(eok)}억 ${koNum(man)}만원`
      : `${sign}${koNum(eok)}억원`;
  }
  return `${sign}${koNum(man)}만원`;
}

/**
 * 주(株) → 억·만·주 상위 2단 축약 한글 표기 (Phase 50). 저장은 원값(주),
 * 표시 시점에만 변환한다. 지수 거래량은 천주 저장이라 호출부에서 ×1000 후 넘긴다.
 * 예: 468,193,000 → "4억 6819만주", 1,710,000 → "171만주",
 *     1,329,000 → "132만 9000주", 0 → "0주".
 */
export function formatSharesKo(shares: number, signed = false): string {
  const rounded = Math.round(shares);
  if (rounded === 0) {
    return "0주";
  }
  const sign = rounded < 0 ? "-" : signed ? "+" : "";
  const abs = Math.abs(rounded);
  const eok = Math.floor(abs / 100_000_000);
  const man = Math.floor((abs % 100_000_000) / 10_000);
  const ju = abs % 10_000;

  if (eok > 0) {
    return man > 0
      ? `${sign}${koNum(eok)}억 ${koNum(man)}만주`
      : `${sign}${koNum(eok)}억주`;
  }
  if (man > 0) {
    return ju > 0
      ? `${sign}${koNum(man)}만 ${koNum(ju)}주`
      : `${sign}${koNum(man)}만주`;
  }
  return `${sign}${koNum(ju)}주`;
}

/**
 * 백만원 → 차트 축용 초압축 표기 (Phase 50) — 최상위 단위 1개만, 소수 1자리.
 * 예: 39,998,686 → "40조", 350,524 → "3505억", 50 → "5000만"
 */
export function formatEokAxis(millionWon: number): string {
  const manwon = Math.abs(Math.round(millionWon)) * 100;
  const sign = millionWon < 0 ? "-" : "";
  const trim = (n: number): string => {
    const f = n.toFixed(1);
    return f.endsWith(".0") ? f.slice(0, -2) : f;
  };
  if (manwon >= 100_000_000) {
    return `${sign}${trim(manwon / 100_000_000)}조`;
  }
  if (manwon >= 10_000) {
    return `${sign}${trim(manwon / 10_000)}억`;
  }
  return `${sign}${koNum(manwon)}만`;
}

/**
 * 백만원 → 홈 카드 수급 블록용 초압축 표기 (Phase 86). 최상위 단위 1개만 쓰고
 * **쉼표를 넣지 않는다** — 430px 뷰포트에서 열당 53.7px뿐이라(§86 폭 실측)
 * 쉼표 2개가 폭 4px을 잡아먹는다.
 *
 * 1조 이상은 소수 1자리 조 단위, 1조 미만은 억원 정수. `formatEokAxis`(차트 축)와
 * 달리 **억 단위에 소수를 붙이지 않고**(폭 절약) 부호 옵션을 지원한다.
 * 코스닥 수급은 수백억대라 조로 통일하면 "0.0조"가 되므로 단위 자동 전환이 필수.
 *
 * 예: 29,692,781 → "29.7조", -38,235 → "-382억", 1,113,000(억 반올림 10000) → "1조"
 * signed=true면 양수 앞에 "+"를 붙인다(순매수/순매도 구분). 음수는 항상 "-".
 */
export function formatFlowCompact(millionWon: number, signed = false): string {
  const rounded = Math.round(millionWon);
  const sign = rounded < 0 ? "-" : signed && rounded > 0 ? "+" : "";
  const abs = Math.abs(rounded);
  const jo = abs / 1_000_000;

  if (jo >= 1) {
    const f = jo.toFixed(1);
    return `${sign}${f.endsWith(".0") ? f.slice(0, -2) : f}조`;
  }
  // 억원 = 백만원 ÷ 100. 반올림이 1조 경계를 넘으면(9,999.5억↑) 조로 승격해
  // "10000억"처럼 5자리가 나오지 않게 한다.
  const eok = Math.round(abs / 100);
  return eok >= 10_000 ? `${sign}1조` : `${sign}${eok}억`;
}

/**
 * 주 → 차트 축용 초압축 표기 (Phase 50) — 최상위 단위 1개만, 소수 1자리.
 * 지수 거래량은 천주 저장이라 호출부에서 ×1000 후 넘긴다.
 * 예: 468,193,000 → "4.7억", 12,340,000 → "1234만"
 */
export function formatSharesAxis(shares: number): string {
  const abs = Math.abs(Math.round(shares));
  const sign = shares < 0 ? "-" : "";
  const trim = (n: number): string => {
    const f = n.toFixed(1);
    return f.endsWith(".0") ? f.slice(0, -2) : f;
  };
  if (abs >= 100_000_000) {
    return `${sign}${trim(abs / 100_000_000)}억`;
  }
  if (abs >= 10_000) {
    return `${sign}${trim(abs / 10_000)}만`;
  }
  return `${sign}${koNum(abs)}`;
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
