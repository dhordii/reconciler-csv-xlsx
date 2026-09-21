import { z } from 'zod';

import type {
  ColumnMapping,
  ComparisonRule,
  ParsedSource,
  ReconciliationConfig,
  SavedMapping,
  SavedProfile,
} from '../domain/types';

const STORAGE_KEY = 'reconciler.profiles.v1';

const keyRuleSchema = z.object({
  caseInsensitive: z.boolean(),
  collapseWhitespace: z.boolean(),
  trim: z.boolean(),
});

const comparisonRuleSchema: z.ZodType<ComparisonRule> = z.discriminatedUnion('kind', [
  z.object({
    caseInsensitive: z.boolean(),
    collapseWhitespace: z.boolean(),
    kind: z.literal('text'),
    trim: z.boolean(),
  }),
  z.object({
    absoluteTolerance: z.number().nonnegative(),
    format: z.enum(['plain', 'standard', 'european']),
    kind: z.literal('number'),
    relativeTolerancePercent: z.number().nonnegative(),
  }),
  z.object({ format: z.enum(['iso', 'mdy', 'dmy']), kind: z.literal('date') }),
  z.object({ kind: z.literal('boolean') }),
]);

const savedMappingSchema: z.ZodType<SavedMapping> = z.object({
  compare: z.boolean(),
  key: z.boolean(),
  keyRule: keyRuleSchema,
  leftName: z.string().min(1),
  rightName: z.string().min(1),
  rule: comparisonRuleSchema,
});

const profileSchema: z.ZodType<SavedProfile> = z.object({
  createdAt: z.string(),
  id: z.string().min(1),
  mappings: z.array(savedMappingSchema),
  name: z.string().trim().min(1).max(80),
  updatedAt: z.string(),
  version: z.literal(1),
});

const profileListSchema = z.array(profileSchema);

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

export function loadProfiles(): SavedProfile[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return profileListSchema.parse(JSON.parse(raw)).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function writeProfiles(profiles: SavedProfile[]): SavedProfile[] {
  const validated = profileListSchema.parse(profiles);
  if (canUseStorage()) localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
  return validated.sort((a, b) => a.name.localeCompare(b.name));
}

export function saveProfile(
  name: string,
  config: ReconciliationConfig,
  existing?: SavedProfile,
): SavedProfile[] {
  const profiles = loadProfiles();
  const now = new Date().toISOString();
  const profile: SavedProfile = {
    createdAt: existing?.createdAt ?? now,
    id: existing?.id ?? crypto.randomUUID(),
    mappings: config.mappings.map(({ compare, key, keyRule, leftName, rightName, rule }) => ({
      compare,
      key,
      keyRule,
      leftName,
      rightName,
      rule,
    })),
    name: name.trim(),
    updatedAt: now,
    version: 1,
  };
  profileSchema.parse(profile);
  return writeProfiles([...profiles.filter((candidate) => candidate.id !== profile.id), profile]);
}

export function deleteProfile(id: string): SavedProfile[] {
  return writeProfiles(loadProfiles().filter((profile) => profile.id !== id));
}

export function duplicateProfile(profile: SavedProfile): SavedProfile[] {
  return writeProfiles([
    ...loadProfiles(),
    {
      ...profile,
      createdAt: new Date().toISOString(),
      id: crypto.randomUUID(),
      name: `${profile.name} copy`,
      updatedAt: new Date().toISOString(),
    },
  ]);
}

export function importProfileJson(json: string): SavedProfile[] {
  const parsed = profileSchema.parse(JSON.parse(json));
  return writeProfiles([
    ...loadProfiles().filter((profile) => profile.id !== parsed.id),
    { ...parsed, id: crypto.randomUUID(), updatedAt: new Date().toISOString() },
  ]);
}

export function profileToJson(profile: SavedProfile): string {
  return JSON.stringify(profileSchema.parse(profile), null, 2);
}

export interface AppliedProfile {
  config: ReconciliationConfig;
  missingKeyColumns: string[];
  missingOtherColumns: string[];
}

export function applyProfile(profile: SavedProfile, left: ParsedSource, right: ParsedSource): AppliedProfile {
  const missingKeyColumns: string[] = [];
  const missingOtherColumns: string[] = [];
  const mappings: ColumnMapping[] = [];

  for (const saved of profile.mappings) {
    const leftColumn = left.columns.find((column) => column.name === saved.leftName);
    const rightColumn = right.columns.find((column) => column.name === saved.rightName);
    if (!leftColumn || !rightColumn) {
      const missing = `${saved.leftName} ↔ ${saved.rightName}`;
      if (saved.key) missingKeyColumns.push(missing);
      else missingOtherColumns.push(missing);
      continue;
    }
    mappings.push({
      ...saved,
      id: crypto.randomUUID(),
      leftColumnId: leftColumn.id,
      rightColumnId: rightColumn.id,
    });
  }

  return { config: { mappings }, missingKeyColumns, missingOtherColumns };
}
