import { db, schema } from '../client';
import { eq } from 'drizzle-orm';
import type { CreateEventInput, UpdateEventInput } from '../../lib/validation/event';

export async function createEvent(jobId: string, input: CreateEventInput) {
  const now = new Date();
  const [event] = await db
    .insert(schema.events)
    .values({
      jobId,
      type: input.type,
      occurredAt: input.occurredAt,
      title: input.title,
      body: input.body ?? '',
      contactName: input.contactName ?? null,
      contactEmail: input.contactEmail ?? null,
      contactRole: input.contactRole ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return event;
}

export async function getEventById(id: string) {
  const rows = await db.select().from(schema.events).where(eq(schema.events.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateEvent(id: string, input: UpdateEventInput) {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (input.type !== undefined) values.type = input.type;
  if (input.occurredAt !== undefined) values.occurredAt = input.occurredAt;
  if (input.title !== undefined) values.title = input.title;
  if (input.body !== undefined) values.body = input.body;
  if (input.contactName !== undefined) values.contactName = input.contactName;
  if (input.contactEmail !== undefined) values.contactEmail = input.contactEmail;
  if (input.contactRole !== undefined) values.contactRole = input.contactRole;

  const [updated] = await db.update(schema.events).set(values).where(eq(schema.events.id, id)).returning();
  return updated ?? null;
}

export async function deleteEvent(id: string) {
  const [deleted] = await db.delete(schema.events).where(eq(schema.events.id, id)).returning();
  return deleted ?? null;
}
