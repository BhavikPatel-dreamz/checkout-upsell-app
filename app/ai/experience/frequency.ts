/** Client-side frequency cap for theme surfaces. Server identity budget is AI-3.9. */

export const FREQUENCY_CAP_HOURS: Record<string, number> = {
  popup: 24,
  sidebar: 12,
  sticky: 12,
  product_page: 0,
  cart: 0,
  thank_you: 0,
  checkout: 0,
};

export const INTERRUPTIVE_CHANNELS = ["popup", "sidebar", "sticky"] as const;

export const MAX_INTERRUPTIONS_24H = 2;
export const FREQUENCY_WINDOW_MS = 24 * 3_600_000;

export function isInterruptiveChannel(channel: string): boolean {
  return (INTERRUPTIVE_CHANNELS as readonly string[]).includes(channel);
}

export function frequencyStorageKey(shop: string, identity: string, channel: string): string {
  return `cu_freq:${shop}:${identity}:${channel}`;
}

export function capHoursForChannel(channel: string): number {
  return FREQUENCY_CAP_HOURS[channel] ?? 0;
}

export function canShowByFrequency(input: {
  lastShownAt: number | null;
  sessionShown: boolean;
  capHours: number;
  now?: number;
}): boolean {
  if (input.sessionShown) return false;
  const now = input.now ?? Date.now();
  if (input.capHours <= 0) return true;
  if (input.lastShownAt == null) return true;
  return now - input.lastShownAt >= input.capHours * 3_600_000;
}

export interface StoredChannelFrequency {
  lastShownAt: Date | null;
  sessionId: string | null;
  sessionShownAt: Date | null;
  windowStart: Date;
  shownInWindow: number;
}

export function shownInWindow(row: StoredChannelFrequency, now: Date): number {
  if (now.getTime() - row.windowStart.getTime() >= FREQUENCY_WINDOW_MS) return 0;
  return row.shownInWindow;
}

export function evaluateStoredFrequency(input: {
  channel: string;
  sessionId?: string | null;
  row?: StoredChannelFrequency | null;
  interruptiveShownInWindow: number;
  now?: Date;
}): { allow: boolean; reason: string } {
  const now = input.now ?? new Date();
  const interruptive = isInterruptiveChannel(input.channel);
  const row = input.row;

  if (interruptive && input.interruptiveShownInWindow >= MAX_INTERRUPTIONS_24H) {
    return { allow: false, reason: "interruption_budget" };
  }

  if (
    interruptive &&
    input.sessionId &&
    row?.sessionId === input.sessionId &&
    row.sessionShownAt
  ) {
    return { allow: false, reason: "frequency_session" };
  }

  const capHours = capHoursForChannel(input.channel);
  const lastShownAt = row?.lastShownAt ? row.lastShownAt.getTime() : null;
  if (
    !canShowByFrequency({
      lastShownAt,
      sessionShown: false,
      capHours,
      now: now.getTime(),
    })
  ) {
    return { allow: false, reason: "frequency_cap" };
  }

  return { allow: true, reason: "ok" };
}
