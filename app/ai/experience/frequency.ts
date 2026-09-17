/** Client-side frequency cap for theme surfaces. Server identity budget is AI-3.9. */

export const FREQUENCY_CAP_HOURS: Record<string, number> = {
  popup: 24,
  sidebar: 12,
  sticky: 12,
  product_page: 0,
};

export function frequencyStorageKey(shop: string, identity: string, channel: string): string {
  return `cu_freq:${shop}:${identity}:${channel}`;
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
