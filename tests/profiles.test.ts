import { describe, expect, it } from 'vitest';

import { importProfileJson, loadProfiles, saveProfile } from '../src/profiles/profiles';

describe('profiles', () => {
  it('stores configuration without source records', () => {
    const profiles = saveProfile('Monthly', {
      mappings: [
        {
          compare: true,
          id: 'runtime-only',
          key: true,
          keyRule: { caseInsensitive: false, collapseWhitespace: false, trim: false },
          leftColumnId: '0:ID',
          leftName: 'ID',
          rightColumnId: '0:ID',
          rightName: 'ID',
          rule: { caseInsensitive: false, collapseWhitespace: false, kind: 'text', trim: false },
        },
      ],
    });
    expect(profiles[0]?.mappings[0]).not.toHaveProperty('leftColumnId');
    expect(localStorage.getItem('reconciler.profiles.v1')).not.toContain('runtime-only');
  });

  it('validates imported JSON', () => {
    expect(() => importProfileJson('{"name":"unsafe"}')).toThrow();
    expect(loadProfiles()).toEqual([]);
  });
});
