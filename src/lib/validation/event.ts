import { z } from 'zod';
import { fromDateTimeLocalValue } from '../dates';

export const EVENT_TYPES = [
  'note',
  'applied',
  'status_change',
  'screen',
  'interview',
  'offer',
  'rejection',
  'follow_up',
  'other',
] as const;

export const EventTypeSchema = z.enum(EVENT_TYPES);

export const EVENT_TYPE_LABELS: Record<(typeof EVENT_TYPES)[number], string> = {
  note: 'Note',
  applied: 'Applied',
  status_change: 'Status change',
  screen: 'Screen',
  interview: 'Interview',
  offer: 'Offer',
  rejection: 'Rejection',
  follow_up: 'Follow-up',
  other: 'Other',
};

/** Event types that count as interviews: pinned on the timeline when in the future and shown on the dashboard. */
export const INTERVIEW_EVENT_TYPES = ['screen', 'interview'] as const;

/** Event types the user can pick in the add/edit form (status changes are logged automatically). */
export const USER_EVENT_TYPES = EVENT_TYPES.filter((t) => t !== 'status_change');

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

/**
 * Accepts an ISO datetime with offset, or a datetime-local value (no offset) which is
 * interpreted in the configured app timezone.
 */
const OccurredAtSchema = z
  .string()
  .min(1, 'Date is required')
  .transform((value, ctx) => {
    const local = fromDateTimeLocalValue(value);
    const date = local ?? new Date(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid date/time' });
      return z.NEVER;
    }
    return date;
  });

export const CreateEventSchema = z.object({
  type: EventTypeSchema.default('note'),
  occurredAt: OccurredAtSchema,
  title: z.string().trim().min(1, 'Title is required').max(300),
  body: z.string().max(20000).default(''),
  contactName: z.preprocess(blankToNull, z.string().trim().max(200).nullable().optional()),
  contactEmail: z.preprocess(blankToNull, z.string().trim().email('Invalid email').nullable().optional()),
  contactRole: z.preprocess(blankToNull, z.string().trim().max(200).nullable().optional()),
});

export const UpdateEventSchema = CreateEventSchema.partial();

export type CreateEventInput = z.infer<typeof CreateEventSchema>;
export type UpdateEventInput = z.infer<typeof UpdateEventSchema>;

/** Pulls event fields out of a submitted HTML form. */
export function eventFormToObject(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ['type', 'occurredAt', 'title', 'body', 'contactName', 'contactEmail', 'contactRole']) {
    if (form.has(key)) out[key] = form.get(key);
  }
  return out;
}
