import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../src/db/schema';
import * as dotenv from 'dotenv';
import { sql } from 'drizzle-orm';

dotenv.config();

async function runSeed() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('❌ DATABASE_URL is not set. Cannot run seed script.');
    process.exit(1);
  }

  const client = neon(url);
  const db = drizzle(client, { schema });

  // 1. Safety check
  const countRes = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.jobs);
  const existingJobCount = countRes[0]?.count ?? 0;

  const force = process.argv.includes('--force');
  if (existingJobCount > 0 && !force) {
    console.error(
      `⚠️ The 'jobs' table already contains ${existingJobCount} row(s). Refusing to seed unless --force is passed.`
    );
    process.exit(1);
  }

  console.log('🌱 Seeding database with synthetic demo data...');

  const today = new Date();
  const pastDays = (d: number) => new Date(today.getTime() - d * 86400000);
  const futureDays = (d: number) => new Date(today.getTime() + d * 86400000);
  const formatDate = (date: Date) => date.toISOString().split('T')[0];

  // 2. Seed Skills
  console.log('  → Inserting skills...');
  const skillNames = [
    'JavaScript',
    'TypeScript',
    'React',
    'Astro',
    'Node.js',
    'PostgreSQL',
    'GraphQL',
    'CSS',
    'Docker',
    'Next.js',
  ];
  const skillMap = new Map<string, string>();

  for (const name of skillNames) {
    const [inserted] = await db
      .insert(schema.skills)
      .values({ name })
      .onConflictDoNothing()
      .returning();
    if (inserted) {
      skillMap.set(name, inserted.id);
    } else {
      const existing = await db
        .select()
        .from(schema.skills)
        .where(sql`${schema.skills.name} = ${name}`);
      skillMap.set(name, existing[0].id);
    }
  }

  // 3. Seed Jobs
  console.log('  → Inserting synthetic jobs...');
  const syntheticJobs = [
    {
      title: 'Senior Frontend Engineer',
      company: 'Acme Cloud Systems',
      location: 'Remote, US',
      remoteType: 'remote' as const,
      salaryMin: 140000,
      salaryMax: 175000,
      salaryCurrency: 'USD',
      salaryPeriod: 'year' as const,
      status: 'interviewing',
      priority: 3,
      boardOrder: 1,
      nextAction: 'Prep for System Design panel',
      nextActionDate: formatDate(futureDays(2)),
      appliedAt: pastDays(14),
      url: 'https://example.com/jobs/acme-senior-fe',
      descriptionHtml:
        '<p>We are seeking an experienced <strong>Frontend Engineer</strong> with deep expertise in modern web architectures and performance.</p><p>Key requirements include 5+ years with TypeScript and React or Astro, building accessible design systems.</p><p>Competitive equity and 401(k) match included.</p>',
      descriptionText:
        'We are seeking an experienced Frontend Engineer with deep expertise in modern web architectures and performance. Key requirements include 5+ years with TypeScript and React or Astro, building accessible design systems. Competitive equity and 401(k) match included.',
      skills: ['TypeScript', 'React', 'Astro', 'CSS'],
    },
    {
      title: 'Full Stack Developer',
      company: 'Starlight Robotics',
      location: 'Chicago, IL',
      remoteType: 'hybrid' as const,
      salaryMin: 125000,
      salaryMax: 150000,
      salaryCurrency: 'USD',
      salaryPeriod: 'year' as const,
      status: 'screening',
      priority: 2,
      boardOrder: 1,
      nextAction: 'Recruiter phone screen',
      nextActionDate: formatDate(today),
      appliedAt: pastDays(5),
      url: 'https://example.com/jobs/starlight-fullstack',
      descriptionHtml:
        '<p>Join our robotics telemetry team. You will build dashboards using TypeScript, Node.js, and PostgreSQL.</p><p>Nice to have: experience with WebSockets and real-time streaming.</p>',
      descriptionText:
        'Join our robotics telemetry team. You will build dashboards using TypeScript, Node.js, and PostgreSQL. Nice to have: experience with WebSockets and real-time streaming.',
      skills: ['TypeScript', 'Node.js', 'PostgreSQL'],
    },
    {
      title: 'Staff Software Architect',
      company: 'Apex Analytics',
      location: 'Remote',
      remoteType: 'remote' as const,
      salaryMin: 180000,
      salaryMax: 220000,
      salaryCurrency: 'USD',
      salaryPeriod: 'year' as const,
      status: 'offer',
      priority: 3,
      boardOrder: 1,
      nextAction: 'Review offer letter and benefits',
      nextActionDate: formatDate(pastDays(1)), // Overdue action
      appliedAt: pastDays(30),
      url: 'https://example.com/jobs/apex-staff-architect',
      descriptionHtml:
        '<p>Lead our core architecture initiatives across distributed database layers and serverless microservices.</p><p>Requires deep database scaling experience.</p>',
      descriptionText:
        'Lead our core architecture initiatives across distributed database layers and serverless microservices. Requires deep database scaling experience.',
      skills: ['TypeScript', 'PostgreSQL', 'Docker'],
    },
    {
      title: 'UI Platform Engineer',
      company: 'Globex Software',
      location: 'New York, NY',
      remoteType: 'onsite' as const,
      salaryMin: 130000,
      salaryMax: 160000,
      salaryCurrency: 'USD',
      salaryPeriod: 'year' as const,
      status: 'applied',
      priority: 1,
      boardOrder: 1,
      nextAction: 'Follow up if no reply by next Tuesday',
      nextActionDate: formatDate(futureDays(4)),
      appliedAt: pastDays(3),
      url: 'https://example.com/jobs/globex-ui-platform',
      descriptionHtml:
        '<p>Globex is scaling our front-end infrastructure team. You will maintain our UI component library.</p>',
      descriptionText:
        'Globex is scaling our front-end infrastructure team. You will maintain our UI component library.',
      skills: ['JavaScript', 'React', 'CSS'],
    },
    {
      title: 'Backend Services Engineer',
      company: 'Initech Labs',
      location: 'Austin, TX',
      remoteType: 'remote' as const,
      salaryMin: 115000,
      salaryMax: 140000,
      salaryCurrency: 'USD',
      salaryPeriod: 'year' as const,
      status: 'saved',
      priority: 1,
      boardOrder: 1,
      nextAction: 'Tailor resume for posting',
      nextActionDate: formatDate(futureDays(1)),
      appliedAt: null,
      url: 'https://example.com/jobs/initech-backend',
      descriptionHtml:
        '<p>Work with our API services team building high throughput endpoints in Node.js and GraphQL.</p>',
      descriptionText:
        'Work with our API services team building high throughput endpoints in Node.js and GraphQL.',
      skills: ['Node.js', 'GraphQL', 'PostgreSQL'],
    },
    {
      title: 'Cloud Infrastructure Lead',
      company: 'Umbrella Security',
      location: 'Remote',
      remoteType: 'remote' as const,
      salaryMin: 160000,
      salaryMax: 190000,
      salaryCurrency: 'USD',
      salaryPeriod: 'year' as const,
      status: 'saved',
      priority: 2,
      boardOrder: 2,
      nextAction: 'Reach out to engineering manager on LinkedIn',
      nextActionDate: null,
      appliedAt: null,
      url: 'https://example.com/jobs/umbrella-cloud-lead',
      descriptionHtml: '<p>Manage container orchestration and infrastructure automation.</p>',
      descriptionText: 'Manage container orchestration and infrastructure automation.',
      skills: ['Docker'],
    },
    {
      title: 'Web Application Engineer',
      company: 'Soylent Logistics',
      location: 'San Francisco, CA',
      remoteType: 'onsite' as const,
      salaryMin: 120000,
      salaryMax: 145000,
      salaryCurrency: 'USD',
      salaryPeriod: 'year' as const,
      status: 'rejected',
      priority: 0,
      boardOrder: 1,
      nextAction: null,
      nextActionDate: null,
      appliedAt: pastDays(25),
      url: 'https://example.com/jobs/soylent-web-app',
      descriptionHtml: '<p>Internal tools web application development.</p>',
      descriptionText: 'Internal tools web application development.',
      skills: ['JavaScript', 'React'],
    },
    {
      title: 'Distributed Systems Developer',
      company: 'Hooli Platform',
      location: 'Remote',
      remoteType: 'remote' as const,
      salaryMin: 150000,
      salaryMax: 180000,
      salaryCurrency: 'USD',
      salaryPeriod: 'year' as const,
      status: 'withdrawn',
      priority: 0,
      boardOrder: 1,
      nextAction: null,
      nextActionDate: null,
      appliedAt: pastDays(18),
      url: 'https://example.com/jobs/hooli-platform',
      descriptionHtml: '<p>Withdrew after receiving offer from Apex Analytics.</p>',
      descriptionText: 'Withdrew after receiving offer from Apex Analytics.',
      skills: ['TypeScript', 'GraphQL'],
    },
  ];

  for (const jobData of syntheticJobs) {
    const { skills: jobSkillNames, ...jobFields } = jobData;

    const [job] = await db
      .insert(schema.jobs)
      .values({
        ...jobFields,
        createdAt: pastDays(10),
        updatedAt: pastDays(1),
      })
      .returning();

    // Link skills
    for (const skillName of jobSkillNames) {
      const skillId = skillMap.get(skillName);
      if (skillId) {
        await db
          .insert(schema.jobSkills)
          .values({ jobId: job.id, skillId })
          .onConflictDoNothing();
      }
    }

    // Add events
    if (job.status === 'interviewing') {
      await db.insert(schema.events).values([
        {
          jobId: job.id,
          type: 'applied',
          title: 'Submitted Application',
          body: 'Applied directly via company career portal.',
          occurredAt: pastDays(14),
        },
        {
          jobId: job.id,
          type: 'screen',
          title: 'Recruiter Screen Completed',
          body: 'Spoke with Sarah regarding team goals and salary expectations.',
          contactName: 'Sarah Jenkins',
          contactEmail: 'sarah@example.com',
          contactRole: 'Lead Recruiter',
          occurredAt: pastDays(10),
        },
        {
          jobId: job.id,
          type: 'interview',
          title: 'Technical Panel Interview',
          body: 'System design and coding session with staff engineers.',
          occurredAt: futureDays(2),
        },
      ]);
    } else if (job.status === 'offer') {
      await db.insert(schema.events).values([
        {
          jobId: job.id,
          type: 'applied',
          title: 'Application Submitted',
          body: 'Applied through referral.',
          occurredAt: pastDays(30),
        },
        {
          jobId: job.id,
          type: 'interview',
          title: 'Final Round Panel',
          body: 'Presented architecture project to leadership.',
          occurredAt: pastDays(7),
        },
        {
          jobId: job.id,
          type: 'offer',
          title: 'Offer Received',
          body: 'Base $200k + bonus and equity grants.',
          occurredAt: pastDays(2),
        },
      ]);
    } else {
      await db.insert(schema.events).values({
        jobId: job.id,
        type: job.appliedAt ? 'applied' : 'note',
        title: job.appliedAt ? 'Applied for role' : 'Saved job posting',
        body: `Initial tracker record created under status **${job.status}**`,
        occurredAt: pastDays(5),
      });
    }

    // Add synthetic highlight to first job
    if (job.title === 'Senior Frontend Engineer') {
      const quote = '5+ years with TypeScript and React or Astro';
      const offset = job.descriptionText!.indexOf(quote);
      if (offset >= 0) {
        await db.insert(schema.highlights).values({
          jobId: job.id,
          startOffset: offset,
          endOffset: offset + quote.length,
          quote,
          prefix: 'requirements include ',
          suffix: ', building accessible ',
          category: 'requirement',
          note: 'Tailor resume bullets to emphasize 6 years of TypeScript and React experience',
        });
      }
    }
  }

  // 4. Seed Profile Items (Application Kit)
  console.log('  → Inserting synthetic profile items (Application Kit)...');
  const syntheticProfileItems = [
    {
      section: 'links',
      sortOrder: 1,
      data: { label: 'Portfolio Website', value: 'https://example-portfolio.dev' },
    },
    {
      section: 'links',
      sortOrder: 2,
      data: { label: 'GitHub Profile', value: 'https://github.com/example-engineer' },
    },
    {
      section: 'links',
      sortOrder: 3,
      data: { label: 'LinkedIn', value: 'https://linkedin.com/in/example-engineer' },
    },
    {
      section: 'work',
      sortOrder: 1,
      data: {
        company: 'Sample Tech Innovations',
        title: 'Senior Software Engineer',
        location: 'Chicago, IL (Remote)',
        start: '2022-03',
        end: 'Present',
        summary: 'Lead engineer for customer web applications and dashboard microfrontends.',
        bullets: [
          'Architected high-performance web dashboard reducing load times by 40%',
          'Mentored 4 junior and mid-level engineers through code reviews and pair programming',
          'Standardized design system components across 6 product teams',
        ],
      },
    },
    {
      section: 'education',
      sortOrder: 1,
      data: {
        school: 'State University',
        credential: 'B.S.',
        field: 'Computer Science',
        location: 'Urbana-Champaign, IL',
        start: '2016-08',
        end: '2020-05',
        notes: 'Graduated Cum Laude; Focus on Distributed Systems',
      },
    },
    {
      section: 'answers',
      sortOrder: 1,
      data: {
        question: 'Are you legally authorized to work in the United States?',
        answer: 'Yes, I am authorized to work in the United States without visa sponsorship.',
      },
    },
    {
      section: 'answers',
      sortOrder: 2,
      data: {
        question: 'What are your target salary expectations?',
        answer: '$140,000 - $160,000 base salary depending on benefits and total compensation package.',
      },
    },
    {
      section: 'snippets',
      sortOrder: 1,
      data: {
        label: 'Why Us? Motivation Snippet',
        body: 'I have followed your product journey closely and admire how the engineering team prioritizes performance, accessible design, and developer developer experience. My background aligning front-end velocity with resilient backend services is directly suited for this team.',
      },
    },
  ];

  for (const item of syntheticProfileItems) {
    await db.insert(schema.profileItems).values(item);
  }

  console.log('✅ Synthetic demo data successfully seeded!');
}

runSeed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
