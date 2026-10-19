import { INTERVIEW_EVENT_TYPES } from './validation/event';

interface TimelineEvent {
  type: string;
  occurredAt: Date | string;
}

/**
 * Splits events into upcoming interviews (future `occurred_at`, soonest first)
 * and the rest of the timeline (reverse-chronological).
 */
export function splitTimeline<T extends TimelineEvent>(events: T[], now: Date = new Date()) {
  const nowMs = now.getTime();
  const time = (e: T) => new Date(e.occurredAt).getTime();
  const isUpcoming = (e: T) =>
    (INTERVIEW_EVENT_TYPES as readonly string[]).includes(e.type) && time(e) > nowMs;

  const upcoming = events.filter(isUpcoming).sort((a, b) => time(a) - time(b));
  const past = events.filter((e) => !isUpcoming(e)).sort((a, b) => time(b) - time(a));
  return { upcoming, past };
}
