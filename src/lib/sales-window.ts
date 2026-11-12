export interface SalesWindowSessionInput {
  endTime?: Date | string | null;
}

export interface EventSalesWindowInput {
  salesStartTime?: Date | string | null;
  salesEndTime?: Date | string | null;
  sessions?: SalesWindowSessionInput[];
}

export type EventSalesWindowReason = 'open' | 'not_started' | 'ended' | 'sessions_ended';

export interface EventSalesWindowStatus {
  isOpen: boolean;
  reason: EventSalesWindowReason;
  message: string | null;
  opensAt: Date | null;
  closesAt: Date | null;
}

function toValidDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Checks whether a single session's end time has already passed.
 */
export function isSessionEnded(
  session: SalesWindowSessionInput | null | undefined,
  now = new Date(),
): boolean {
  const end = toValidDate(session?.endTime);
  return end !== null && now.getTime() > end.getTime();
}

/**
 * Evaluates whether public ticket sales are currently open for an event,
 * matching server-side reservation validation rules.
 */
export function getEventSalesStatus(
  event: EventSalesWindowInput,
  now = new Date(),
): EventSalesWindowStatus {
  const opensAt = toValidDate(event.salesStartTime);
  const closesAt = toValidDate(event.salesEndTime);

  if (opensAt && now.getTime() < opensAt.getTime()) {
    return {
      isOpen: false,
      reason: 'not_started',
      message: 'ยังไม่ถึงเวลาเปิดจำหน่ายบัตร',
      opensAt,
      closesAt,
    };
  }

  if (closesAt && now.getTime() > closesAt.getTime()) {
    return {
      isOpen: false,
      reason: 'ended',
      message: 'หมดเวลาการจำหน่ายบัตรแล้ว',
      opensAt,
      closesAt,
    };
  }

  const sessions = event.sessions || [];
  if (sessions.length > 0 && sessions.every(s => isSessionEnded(s, now))) {
    return {
      isOpen: false,
      reason: 'sessions_ended',
      message: 'รอบการแสดงนี้สิ้นสุดลงแล้ว ไม่สามารถทำการจองบัตรได้',
      opensAt,
      closesAt,
    };
  }

  return {
    isOpen: true,
    reason: 'open',
    message: null,
    opensAt,
    closesAt,
  };
}
