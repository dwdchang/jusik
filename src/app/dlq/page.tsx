import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NavIconLink } from "@/components/nav/NavIconLink";
import { isAdminEmail } from "@/lib/auth/allowedEmails";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import { formatKstDateTime } from "@/lib/format/datetime";
import { listDlqMessages } from "@/lib/qstash/dlq";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "DLQ 확인 — jusik",
  description: "QStash 갱신 잡 실패 메시지(DLQ) 읽기 전용 목록",
};

/** 표시용 — 대상 URL은 전부 이 앱의 잡 라우트이므로 경로만 보여준다. */
function toDisplayPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/**
 * QStash DLQ 읽기 전용 화면 — 햄버거 메뉴에서 진입.
 * 서버에서 QSTASH_TOKEN으로 조회하며(lib/qstash/dlq.ts), 재발송·삭제 없음.
 * DLQ는 Free 플랜 기준 3일 보존이라 비어 있는 것이 정상 상태다.
 */
export default async function DlqPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const session = await ensureAllowedSession();

  // 운영 화면 — 화이트리스트 중에서도 관리자 계정만 허용
  if (!isAdminEmail(session.user?.email)) {
    redirect("/");
  }

  const { cursor } = await searchParams;

  let list: Awaited<ReturnType<typeof listDlqMessages>> | null = null;
  let errorMessage: string | null = null;

  try {
    list = await listDlqMessages(cursor);
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "DLQ 목록을 불러오지 못했습니다.";
    console.error("[DlqPage] listDlqMessages failed:", error);
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <NavIconLink href="/" label="홈으로" icon="home" />
          <h1 className={styles.title}>DLQ 확인</h1>
        </header>

        <p className={styles.description}>
          QStash 갱신 잡이 재시도까지 전부 실패한 메시지 목록입니다 (3일 보존
          · 읽기 전용).
        </p>

        {errorMessage !== null ? (
          <div className={styles.error} role="alert">
            {errorMessage}
          </div>
        ) : list !== null && list.messages.length === 0 ? (
          <div className={styles.empty}>
            DLQ가 비어 있습니다 — 최근 3일간 재시도 소진 실패가 없습니다.
          </div>
        ) : list !== null ? (
          <>
            <ul className={styles.list}>
              {list.messages.map((message) => (
                <li key={message.dlqId} className={styles.item}>
                  <div className={styles.itemHeader}>
                    <span className={styles.itemUrl}>
                      {toDisplayPath(message.url)}
                    </span>
                    <span className={`${styles.itemStatus} numeric`}>
                      {message.responseStatus !== null
                        ? `HTTP ${message.responseStatus}`
                        : "응답 없음"}
                    </span>
                  </div>
                  {message.failReason !== null && (
                    <p className={styles.itemReason}>{message.failReason}</p>
                  )}
                  <div className={styles.itemMeta}>
                    <span className="numeric">
                      {formatKstDateTime(
                        new Date(message.createdAt).toISOString()
                      )}
                    </span>
                    {message.maxRetries !== null && (
                      <span className="numeric">
                        재시도 {message.maxRetries}회 소진
                      </span>
                    )}
                    <span className={styles.itemId}>{message.messageId}</span>
                  </div>
                </li>
              ))}
            </ul>

            {list.nextCursor !== null && (
              <Link
                href={`/dlq?cursor=${encodeURIComponent(list.nextCursor)}`}
                className={styles.moreLink}
              >
                다음 페이지
              </Link>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}
