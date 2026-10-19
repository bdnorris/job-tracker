import rawConfig from '../../tracker.config';
import { TrackerConfigSchema, type TrackerConfig } from './schema';

let validatedConfig: TrackerConfig;

try {
  const result = TrackerConfigSchema.safeParse(rawConfig);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[tracker.config.ts] Configuration validation failed at startup:\n${issues}`);
  }
  validatedConfig = result.data;
} catch (err: any) {
  console.error(`\n================ CONFIGURATION ERROR ================`);
  console.error(err.message || err);
  console.error(`=====================================================\n`);
  throw err;
}

export const config = validatedConfig;
export * from './schema';
export default config;
