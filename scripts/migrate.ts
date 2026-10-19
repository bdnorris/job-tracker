import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import * as dotenv from 'dotenv';
import * as path from 'node:path';

dotenv.config();

async function runMigrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn(
      '⚠️ DATABASE_URL is not set. Skipping database migrations. Set DATABASE_URL to run migrations.'
    );
    return;
  }

  console.log('🔄 Running database migrations...');
  const sql = neon(url);
  const db = drizzle(sql);

  const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
  await migrate(db, { migrationsFolder });
  console.log('✅ Database migrations applied successfully.');
}

runMigrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
