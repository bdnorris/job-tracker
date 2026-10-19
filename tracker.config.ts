import { defineConfig } from './src/config/schema';

export default defineConfig({
  app: {
    name: 'Job Tracker',
    timezone: 'America/Chicago',
    currency: 'USD',
  },
  pipeline: {
    stages: [
      { id: 'saved', label: 'Saved' },
      { id: 'applied', label: 'Applied' },
      { id: 'screening', label: 'Screening' },
      { id: 'interviewing', label: 'Interviewing' },
      { id: 'offer', label: 'Offer' },
      { id: 'rejected', label: 'Rejected', closed: true },
      { id: 'withdrawn', label: 'Withdrawn', closed: true },
    ],
    defaultStage: 'saved',
  },
  highlights: {
    categories: [
      { id: 'requirement', label: 'Requirement', color: '#fde68a' },
      { id: 'nice', label: 'Nice to have', color: '#bbf7d0' },
      { id: 'redflag', label: 'Red flag', color: '#fecaca' },
      { id: 'perk', label: 'Perk', color: '#bfdbfe' },
      { id: 'keyword', label: 'Resume keyword', color: '#e9d5ff' },
    ],
  },
  skills: {
    // canonical name -> aliases; used for heuristic extraction and match scoring
    list: {
      JavaScript: ['js', 'javascript'],
      TypeScript: ['ts'],
      Astro: [],
      React: ['react.js', 'reactjs'],
    },
  },
  scraper: {
    order: ['greenhouse', 'lever', 'ashby', 'jsonld', 'heuristic', 'ai'],
    fetchTimeoutMs: 8000,
    userAgent: 'JobTracker/1.0 (+https://github.com/<owner>/<repo>)',
    ai: {
      model: 'claude-3-5-haiku-20241022',
      fillGapsOnly: true,
      maxInputChars: 30000,
    },
  },
  profile: {
    sections: ['links', 'work', 'education', 'answers', 'snippets'],
  },
  print: {
    showUrls: true,
    includeNotes: true,
  },
});
