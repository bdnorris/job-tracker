import { z } from 'zod';
import config from '../../config';

const CATEGORY_IDS = config.highlights.categories.map((c) => c.id);

const Category = z.string().refine((c) => CATEGORY_IDS.includes(c), { message: `Category must be one of: ${CATEGORY_IDS.join(', ')}` });
const Note = z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(2000).nullable());

const Anchor = {
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().positive(),
  quote: z.string().min(1).max(10000).refine((q) => q.trim().length > 0, 'Select some text'),
  prefix: z.string().max(64).default(''),
  suffix: z.string().max(64).default(''),
};

export const CreateHighlightSchema = z
  .object({ ...Anchor, category: Category, note: Note.optional() })
  .refine((h) => h.endOffset > h.startOffset, { message: 'endOffset must be after startOffset', path: ['endOffset'] });

/** Category and note edits, or a re-selection (all anchor fields together). */
export const UpdateHighlightSchema = z
  .object({
    category: Category.optional(),
    note: Note.optional(),
    startOffset: Anchor.startOffset.optional(),
    endOffset: Anchor.endOffset.optional(),
    quote: Anchor.quote.optional(),
    prefix: Anchor.prefix.optional(),
    suffix: Anchor.suffix.optional(),
  })
  .refine((h) => {
    const anchorKeys = [h.startOffset, h.endOffset, h.quote].filter((v) => v !== undefined).length;
    return anchorKeys === 0 || anchorKeys === 3;
  }, 'Re-selecting needs startOffset, endOffset and quote together')
  .refine((h) => h.startOffset === undefined || h.endOffset! > h.startOffset, { message: 'endOffset must be after startOffset', path: ['endOffset'] });

export type CreateHighlightInput = z.infer<typeof CreateHighlightSchema>;
export type UpdateHighlightInput = z.infer<typeof UpdateHighlightSchema>;
