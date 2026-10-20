import type { ProfileSection } from '../../lib/validation/profile';

export interface FieldDef {
  name: string;
  label: string;
  kind: 'text' | 'textarea' | 'lines';
  required?: boolean;
  placeholder?: string;
}

export const SECTION_LABELS: Record<ProfileSection, { title: string; singular: string }> = {
  links: { title: 'Links & contact', singular: 'link' },
  work: { title: 'Work history', singular: 'job' },
  education: { title: 'Education', singular: 'school' },
  answers: { title: 'Common answers', singular: 'answer' },
  snippets: { title: 'Snippets', singular: 'snippet' },
};

export const SECTION_FIELDS: Record<ProfileSection, FieldDef[]> = {
  links: [
    { name: 'label', label: 'Label', kind: 'text', required: true, placeholder: 'e.g. Portfolio, Email, Phone' },
    { name: 'value', label: 'Value', kind: 'text', required: true },
  ],
  work: [
    { name: 'title', label: 'Title', kind: 'text', required: true },
    { name: 'company', label: 'Company', kind: 'text', required: true },
    { name: 'location', label: 'Location', kind: 'text' },
    { name: 'start', label: 'Start', kind: 'text', required: true, placeholder: 'YYYY-MM' },
    { name: 'end', label: 'End', kind: 'text', required: true, placeholder: 'YYYY-MM or Present' },
    { name: 'summary', label: 'Summary', kind: 'textarea' },
    { name: 'bullets', label: 'Bullets (one per line)', kind: 'lines' },
  ],
  education: [
    { name: 'school', label: 'School', kind: 'text', required: true },
    { name: 'credential', label: 'Credential', kind: 'text', placeholder: 'e.g. B.S.' },
    { name: 'field', label: 'Field of study', kind: 'text' },
    { name: 'location', label: 'Location', kind: 'text' },
    { name: 'start', label: 'Start', kind: 'text', placeholder: 'YYYY-MM' },
    { name: 'end', label: 'End', kind: 'text', placeholder: 'YYYY-MM or Present' },
    { name: 'notes', label: 'Notes', kind: 'textarea' },
  ],
  answers: [
    { name: 'question', label: 'Question', kind: 'text', required: true },
    { name: 'answer', label: 'Answer', kind: 'textarea', required: true },
  ],
  snippets: [
    { name: 'label', label: 'Label', kind: 'text', required: true },
    { name: 'body', label: 'Body', kind: 'textarea', required: true },
  ],
};

/** Short name for an item, used in headings and accessible labels. */
export function itemName(section: ProfileSection, data: Record<string, any>): string {
  switch (section) {
    case 'links':
    case 'snippets':
      return data.label || 'Untitled';
    case 'work':
      return [data.title, data.company].filter(Boolean).join(' at ') || 'Untitled';
    case 'education':
      return data.school || 'Untitled';
    case 'answers':
      return data.question || 'Untitled';
  }
}
