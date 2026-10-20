import { db, schema } from '../client';
import { and, asc, eq, sql } from 'drizzle-orm';
import config from '../../config';

export async function listProfileItems() {
  const rows = await db
    .select()
    .from(schema.profileItems)
    .orderBy(asc(schema.profileItems.section), asc(schema.profileItems.sortOrder), asc(schema.profileItems.createdAt));

  const grouped: Record<string, typeof rows> = {};
  for (const section of config.profile.sections) grouped[section] = [];
  for (const row of rows) grouped[row.section]?.push(row);
  return grouped;
}

export async function getProfileItem(id: string) {
  const rows = await db.select().from(schema.profileItems).where(eq(schema.profileItems.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createProfileItem(section: string, data: Record<string, unknown>) {
  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${schema.profileItems.sortOrder}), 0)` })
    .from(schema.profileItems)
    .where(eq(schema.profileItems.section, section));

  const now = new Date();
  const [item] = await db
    .insert(schema.profileItems)
    .values({ section, data, sortOrder: Number(maxOrder) + 1, createdAt: now, updatedAt: now })
    .returning();
  return item;
}

export async function updateProfileItem(id: string, data: Record<string, unknown>) {
  const [item] = await db
    .update(schema.profileItems)
    .set({ data, updatedAt: new Date() })
    .where(eq(schema.profileItems.id, id))
    .returning();
  return item ?? null;
}

export async function deleteProfileItem(id: string) {
  const [item] = await db.delete(schema.profileItems).where(eq(schema.profileItems.id, id)).returning();
  return item ?? null;
}

/**
 * Rewrites sort_order for a section to match `ids`. Returns false if `ids` isn't exactly
 * the section's current items, so a stale page can't drop or duplicate items.
 */
export async function reorderProfileItems(section: string, ids: string[]) {
  const existing = await db
    .select({ id: schema.profileItems.id })
    .from(schema.profileItems)
    .where(eq(schema.profileItems.section, section));

  const existingIds = new Set(existing.map((r) => r.id));
  if (new Set(ids).size !== ids.length || ids.length !== existingIds.size || !ids.every((id) => existingIds.has(id))) {
    return false;
  }

  const now = new Date();
  const updates = ids.map((id, i) =>
    db
      .update(schema.profileItems)
      .set({ sortOrder: i + 1, updatedAt: now })
      .where(and(eq(schema.profileItems.id, id), eq(schema.profileItems.section, section)))
  );
  // neon-http runs a batch as one transaction.
  await db.batch(updates as [(typeof updates)[number], ...typeof updates]);
  return true;
}
