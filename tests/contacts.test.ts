import { describe, it, expect } from 'vitest';
import { collectContacts } from '../src/lib/contacts';

const ev = (day: number, name: string | null, email: string | null, role: string | null = null) => ({
  occurredAt: new Date(Date.UTC(2026, 0, day)),
  contactName: name,
  contactEmail: email,
  contactRole: role,
});

describe('collectContacts', () => {
  it('dedupes by email, keeps latest details, and merges earlier name-only entries', () => {
    const contacts = collectContacts([
      ev(1, 'Pat Example', null, 'Recruiter'),
      ev(5, 'Pat Example', 'PAT@example.com'),
      ev(3, 'Sam Sample', 'sam@example.com', 'Hiring manager'),
      ev(4, null, null),
    ]);
    expect(contacts).toEqual([
      { name: 'Pat Example', email: 'pat@example.com', role: 'Recruiter', lastSeen: new Date(Date.UTC(2026, 0, 5)) },
      { name: 'Sam Sample', email: 'sam@example.com', role: 'Hiring manager', lastSeen: new Date(Date.UTC(2026, 0, 3)) },
    ]);
  });
});
