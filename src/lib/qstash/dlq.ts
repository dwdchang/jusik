import { Client } from "@upstash/qstash";

/**
 * QStash DLQ(실패 메시지 보관함) 읽기 전용 조회 — /dlq 화면 전용.
 * QSTASH_TOKEN은 서버에서만 읽으며, SDK 원본 타입 대신 화면에 필요한
 * 필드만 담은 뷰 모델로 매핑해 반환한다.
 */

export type DlqMessageView = {
  dlqId: string;
  messageId: string;
  url: string;
  responseStatus: number | null;
  /** 마지막 실패 응답 본문 앞부분 — 실패 사유 표시용 */
  failReason: string | null;
  /** epoch milliseconds */
  createdAt: number;
  maxRetries: number | null;
};

export type DlqListView = {
  messages: DlqMessageView[];
  nextCursor: string | null;
};

const PAGE_SIZE = 50;
const FAIL_REASON_MAX_LENGTH = 300;

export async function listDlqMessages(cursor?: string): Promise<DlqListView> {
  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "QSTASH_TOKEN이 설정되지 않았습니다. Upstash 콘솔의 토큰을 .env.local과 Vercel 환경 변수에 추가하세요."
    );
  }

  const client = new Client({ token });
  const { messages, cursor: nextCursor } = await client.dlq.listMessages({
    cursor,
    count: PAGE_SIZE,
  });

  return {
    messages: messages.map((message) => ({
      dlqId: message.dlqId,
      messageId: message.messageId,
      url: message.url,
      responseStatus: message.responseStatus ?? null,
      failReason:
        message.responseBody?.slice(0, FAIL_REASON_MAX_LENGTH) ?? null,
      createdAt: message.createdAt,
      maxRetries: message.maxRetries ?? null,
    })),
    nextCursor: nextCursor ?? null,
  };
}
