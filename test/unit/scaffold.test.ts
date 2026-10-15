// test/unit/scaffold.test.ts
import { describe, it, expect } from 'vitest';
import { version } from '../../src/index';

describe('Scaffolding', () => {
  it('exports a version string', () => {
    expect(version).toBeDefined();
    expect(typeof version).toBe('string');
  });
});
