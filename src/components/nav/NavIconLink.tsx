import { ArrowLeft, House } from "lucide-react";
import Link from "next/link";
import styles from "./NavIconLink.module.css";

/**
 * 헤더 이동 아이콘 버튼 — 다크모드 토글·로그아웃 버튼과 동일한 36px 아이콘
 * 버튼 스타일. 아이콘만 표시되므로 label(aria-label·title)이 필수다.
 */
export function NavIconLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: "home" | "back";
}) {
  return (
    <Link href={href} className={styles.link} aria-label={label} title={label}>
      {icon === "home" ? <House /> : <ArrowLeft />}
    </Link>
  );
}
