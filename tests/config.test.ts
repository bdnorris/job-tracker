import { describe, it, expect } from 'vitest';
import { TrackerConfigSchema, defineConfig } from '../src/config/schema';

describe('tracker.config schema validation', () => {
  it('validates a complete valid configuration', () => {
    const valid = defineConfig({
      app: { name: 'My Test Tracker', timezone: 'UTC', currency: 'EUR' },
      pipeline: {
        stages: [
          { id: 'lead', label: 'Lead' },
          { id: 'done', label: 'Done', closed: true },
        ],
        defaultStage: 'lead',
      },
      highlights: {
        categories: [
          { id: 'key', label: 'Key', color: '#ff0000' },
        ],
      },
    });

    expect(valid.app.name).toBe('My Test Tracker');
    expect(valid.app.currency).toBe('EUR');
    expect(valid.pipeline.defaultStage).toBe('lead');
    expect(valid.pipeline.stages.length).toBe(2);
  });

  it('populates defaults when empty object is passed', () => {
    const valid = defineConfig({});
    expect(valid.app.name).toBe('Job Tracker');
    expect(valid.app.currency).toBe('USD');
    expect(valid.pipeline.defaultStage).toBe('saved');
    expect(valid.pipeline.stages.length).toBeGreaterThanOrEqual(5);
  });

  it('fails fast with readable error if defaultStage does not exist in stages', () => {
    expect(() => {
      defineConfig({
        pipeline: {
          stages: [{ id: 'saved', label: 'Saved' }],
          defaultStage: 'nonexistent',
        },
      });
    }).toThrow(/pipeline\.defaultStage must exist in pipeline\.stages/);
  });

  it('fails fast if category color is not a valid hex code', () => {
    expect(() => {
      defineConfig({
        highlights: {
          categories: [{ id: 'cat1', label: 'Cat 1', color: 'not-a-hex-color' }],
        },
      });
    }).toThrow(/Category color must be a valid hex color code/);
  });

  it('fails fast if stage id or label is empty', () => {
    expect(() => {
      defineConfig({
        pipeline: {
          stages: [{ id: '', label: 'Label' }],
          defaultStage: '',
        },
      });
    }).toThrow(/Stage id cannot be empty/);
  });
});
