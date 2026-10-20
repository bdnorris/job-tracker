interface ContactEvent {
  occurredAt: Date | string;
  contactName: string | null;
  contactEmail: string | null;
  contactRole: string | null;
}

export interface Contact {
  name: string | null;
  email: string | null;
  role: string | null;
  lastSeen: Date;
}

/**
 * Unique contacts across a job's events, keyed by email when present, otherwise by name.
 * The most recent event's details win. Sorted by most recent contact first.
 */
export function collectContacts(events: ContactEvent[]): Contact[] {
  const byKey = new Map<string, Contact>();
  const sorted = [...events].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

  for (const e of sorted) {
    const name = e.contactName?.trim() || null;
    const email = e.contactEmail?.trim().toLowerCase() || null;
    if (!name && !email) continue;

    const key = email ? `e:${email}` : `n:${name!.toLowerCase()}`;
    // An earlier name-only entry for the same person merges into the email entry.
    const nameKey = name ? `n:${name.toLowerCase()}` : null;
    const prev = byKey.get(key) ?? (nameKey && email ? byKey.get(nameKey) : undefined);
    if (nameKey && email) byKey.delete(nameKey);

    byKey.set(key, {
      name: name ?? prev?.name ?? null,
      email: email ?? prev?.email ?? null,
      role: e.contactRole?.trim() || prev?.role || null,
      lastSeen: new Date(e.occurredAt),
    });
  }

  return [...byKey.values()].sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
}
