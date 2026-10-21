import { Readability } from '@mozilla/readability';
import type { Extractor, ExtractorOutput } from '../types';
import { cleanLine, metaContent, parseDocument, titleCaseSlug } from '../html-utils';
import { parseSalary } from '../salary';
import { inferRemoteType } from '../remote';
import { findSkillsInText } from '../../skills/match';

/**
 * Works on any page or pasted text: Readability for the main content, <title>/og: tags for
 * title and company, the salary parser, config skills, and remote keywords.
 */

const SEPARATORS = /\s+(?:[|–—-]|::)\s+/;

/** Splits "Senior Engineer at Example Corp" or "Senior Engineer | Example Corp | Careers". */
export function splitTitle(raw: string, siteName?: string): { title?: string; company?: string } {
  let title = raw.trim();
  let company: string | undefined;

  const at = /^(.{3,120}?)\s+(?:at|@)\s+(.{2,80}?)(?:\s+(?:[|–—-])\s+.*)?$/i.exec(title);
  if (at) return { title: at[1].trim(), company: at[2].trim() };

  const parts = title.split(SEPARATORS).map((p) => p.trim()).filter(Boolean);
  const noise = /^(careers?|jobs?|job board|apply|hiring|open positions?|job application for)$/i;
  const useful = parts.filter((p) => !noise.test(p));
  if (useful.length >= 2) {
    const site = siteName?.toLowerCase();
    const companyIdx = site ? useful.findIndex((p) => p.toLowerCase() === site) : -1;
    if (companyIdx >= 0) {
      company = useful[companyIdx];
      title = useful.filter((_, i) => i !== companyIdx).join(' - ');
    } else {
      title = useful[0];
      company = useful[1];
    }
  } else if (useful.length === 1) {
    title = useful[0];
  }
  title = title.replace(/^job application for\s+/i, '');
  return { title: cleanLine(title), company: cleanLine(company ?? siteName) };
}

const ATS_HOSTS = /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|workable\.com|smartrecruiters\.com|bamboohr\.com|icims\.com|jobvite\.com|linkedin\.com|indeed\.com)$/i;

/** "careers.example-corp.com" → "Example Corp"; nothing for ATS or job-board hosts. */
function companyFromHost(url: string): string | undefined {
  const host = new URL(url).hostname;
  if (ATS_HOSTS.test(host)) return undefined;
  const label = host.replace(/^(www|jobs|careers|apply|work)\./, '').split('.')[0];
  return label ? titleCaseSlug(label) : undefined;
}

function fromHtml(html: string, url: string): ExtractorOutput {
  const doc = parseDocument(html);
  const siteName = metaContent(doc, 'meta[property="og:site_name"]', 'meta[name="application-name"]');
  const rawTitle =
    metaContent(doc, 'meta[property="og:title"]', 'meta[name="twitter:title"]') ?? cleanLine(doc.querySelector('title')?.textContent);
  const h1 = cleanLine(doc.querySelector('h1')?.textContent);
  const split = rawTitle ? splitTitle(rawTitle, siteName) : {};

  // Readability mutates the document it reads, so give it a fresh parse.
  let article: { content?: string | null; textContent?: string | null } | null = null;
  try {
    article = new Readability(parseDocument(html) as any, { charThreshold: 200 }).parse();
  } catch {
    article = null;
  }
  const bodyText = cleanLine(doc.querySelector('body')?.textContent) ?? '';
  const mainText = article?.textContent ?? bodyText;

  return {
    title: split.title ?? h1,
    company: split.company,
    location: metaContent(doc, 'meta[name="job-location"]', 'meta[property="og:locality"]'),
    remoteType: inferRemoteType(rawTitle, mainText.slice(0, 3000)),
    salary: parseSalary(mainText) ?? undefined,
    skills: findSkillsInText(`${rawTitle ?? ''}\n${mainText}`),
    descriptionHtml: article?.content || undefined,
    companyFallback: companyFromHost(url),
  };
}

/** Pasted text: first line is usually the title ("Senior Engineer at Example Corp" also works). */
function fromText(text: string): ExtractorOutput {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const first = lines[0] ?? '';
  const titleish = first.length <= 120 && !/[.!?]$/.test(first);
  const split = titleish ? splitTitle(first) : {};
  const labeled = (label: RegExp) => {
    for (const l of lines.slice(0, 15)) {
      const m = new RegExp(`^(?:${label.source})\\s*[:\\-–]\\s*(.{2,120})$`, 'i').exec(l);
      if (m) return cleanLine(m[1]);
    }
    return undefined;
  };

  const head = lines.slice(0, 15).join('\n');
  return {
    title: labeled(/job title|title|position|role/) ?? split.title,
    company: labeled(/company|employer|organization/) ?? split.company,
    location: labeled(/location|based in|office/),
    remoteType: inferRemoteType(head),
    salary: parseSalary(text) ?? undefined,
    skills: findSkillsInText(text),
    descriptionText: text.trim(),
  };
}

export const heuristic: Extractor = {
  name: 'heuristic',
  enabled: () => true,
  canHandle: (input) => (input.kind === 'url' ? !!input.html : input.text.trim().length > 0),
  async extract(input): Promise<ExtractorOutput | null> {
    return input.kind === 'url' ? fromHtml(input.html!, input.url) : fromText(input.text);
  },
};
