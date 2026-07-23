"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

/**
 * 뷰포트 진입 시 자동 prefetch(`<Link>` 기본 동작) 대신, 마우스를 올리거나
 * 터치를 시작해 이동 의사를 보일 때만 prefetch한다. 목록 화면처럼 행이 많은 곳에서
 * 화면에 보이는 모든 링크를 미리 prefetch하며 발생하던 불필요한 요청을 줄이기 위한 것.
 *
 * Next 공식 hover-triggered prefetch 패턴을 그대로 따른다
 * (node_modules/next/dist/docs/01-app/02-guides/prefetching.md).
 * `prefetch={false}`가 뷰포트 자동 prefetch를 끄고, 의사 표시 후 `null`로 바꾸면
 * 기본(정적) prefetch가 복구된다.
 */
export function HoverPrefetchLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const [active, setActive] = useState(false);

  return (
    <Link
      href={href}
      prefetch={active ? null : false}
      onMouseEnter={() => setActive(true)}
      onTouchStart={() => setActive(true)}
      className={className}
    >
      {children}
    </Link>
  );
}
