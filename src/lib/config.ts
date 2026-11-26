import {
  FeatureFlags,
  SegmentWeight,
  ConfigVersion,
  Equipment,
  SegmentSwitchItem,
  ScoringConfiguration,
  BlockCode,
  SegmentCode,
} from '../types';
import {
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_WEIGHTS,
  DEFAULT_EQUIPMENT,
} from '../data/seedData';
import { PointRule, DEFAULT_POINT_RULES } from './scoring';
import { addAuditLogEntry } from './loans';

const STORAGE_KEY_FLAGS = 'unitel_credit_flags_v1';
const STORAGE_KEY_WEIGHTS = 'unitel_credit_weights_v1';
const STORAGE_KEY_VERSIONS = 'unitel_credit_versions_v1';
const STORAGE_KEY_EQUIPMENT = 'unitel_credit_equipment_v1';
const STORAGE_KEY_POINT_RULES = 'unitel_credit_point_rules_v2';

const memoryStore: Record<string, string> = {};

function safeGetItem(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return memoryStore[key] ?? null;
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {}
  memoryStore[key] = value;
}

export function getStoredFeatureFlags(): FeatureFlags {
  try {
    const raw = safeGetItem(STORAGE_KEY_FLAGS);
    if (!raw) {
      safeSetItem(STORAGE_KEY_FLAGS, JSON.stringify(DEFAULT_FEATURE_FLAGS));
      return DEFAULT_FEATURE_FLAGS;
    }
    return JSON.parse(raw);
  } catch {
    return DEFAULT_FEATURE_FLAGS;
  }
}

export function saveFeatureFlags(flags: FeatureFlags, actor: string = 'Eng. Carlos Neto (Admin)'): void {
  safeSetItem(STORAGE_KEY_FLAGS, JSON.stringify(flags));
  addAuditLogEntry({
    id: Date.now(),
    at: new Date().toISOString(),
    actor_name: actor,
    action: 'update_feature_flags',
    entity: 'feature_flags',
    entity_id: 'global',
    details: flags as Record<string, unknown>,
  });
}

export function getStoredConfigVersions(): ConfigVersion[] {
  try {
    const raw = safeGetItem(STORAGE_KEY_VERSIONS);
    if (!raw) {
      const init: ConfigVersion[] = [
        { id: 'v1.0-default', label: 'v1.0 (Initial Baseline)', is_active: true, created_at: new Date(Date.now() - 7 * 86400000).toISOString() },
      ];
      safeSetItem(STORAGE_KEY_VERSIONS, JSON.stringify(init));
      return init;
    }
    return JSON.parse(raw);
  } catch {
    return [{ id: 'v1.0-default', label: 'v1.0 (Initial Baseline)', is_active: true, created_at: new Date().toISOString() }];
  }
}

export function getStoredWeights(): SegmentWeight[] {
  try {
    const raw = safeGetItem(STORAGE_KEY_WEIGHTS);
    if (!raw) {
      safeSetItem(STORAGE_KEY_WEIGHTS, JSON.stringify(DEFAULT_WEIGHTS));
      return DEFAULT_WEIGHTS;
    }
    return JSON.parse(raw);
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

export function validateSegmentWeights(weights: SegmentWeight[]): { isValid: boolean; invalidSegments: Array<{ segment: string; sum: number }> } {
  const segmentCodes = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10'];
  const baseBlocks = ['P', 'T', 'W', 'B', 'X'];
  const invalidSegments: Array<{ segment: string; sum: number }> = [];

  for (const seg of segmentCodes) {
    const segWeights = weights.filter((w) => w.segment_code === seg && baseBlocks.includes(w.block_code));
    const sum = segWeights.reduce((acc, w) => acc + (w.points || 0), 0);
    if (sum !== 94) {
      invalidSegments.push({ segment: seg, sum });
    }
  }

  return {
    isValid: invalidSegments.length === 0,
    invalidSegments,
  };
}

export function saveNewConfigVersion(
  newLabel: string,
  newWeights: SegmentWeight[],
  actor: string = 'Eng. Carlos Neto (Admin)'
): { success: boolean; versionId: string; error?: string } {
  const validation = validateSegmentWeights(newWeights);
  if (!validation.isValid) {
    const details = validation.invalidSegments.map((s) => `${s.segment} (sum: ${s.sum})`).join(', ');
    return {
      success: false,
      versionId: '',
      error: `Validation failed: Every segment's P+T+W+B+X points must sum to exactly 94. Invalid: ${details}`,
    };
  }

  const newVersionId = `v${Date.now().toString().slice(-4)}`;
  const versions = getStoredConfigVersions();
  // Deactivate others
  versions.forEach((v) => (v.is_active = false));
  const newVersion: ConfigVersion = {
    id: newVersionId,
    label: newLabel || `v1.${versions.length}`,
    is_active: true,
    created_at: new Date().toISOString(),
  };
  versions.unshift(newVersion);
  safeSetItem(STORAGE_KEY_VERSIONS, JSON.stringify(versions));

  // Save weights tagged with new version
  const updatedWeights = newWeights.map((w) => ({
    ...w,
    config_version_id: newVersionId,
  }));
  safeSetItem(STORAGE_KEY_WEIGHTS, JSON.stringify(updatedWeights));

  // Log in Audit Log
  addAuditLogEntry({
    id: Date.now(),
    at: new Date().toISOString(),
    actor_name: actor,
    action: 'publish_config_version',
    entity: 'config_versions',
    entity_id: newVersionId,
    details: {
      version_label: newVersion.label,
      segments_count: 10,
      invariant: 'P+T+W+B+X=94 (Verified)',
    },
  });

  return {
    success: true,
    versionId: newVersionId,
  };
}

export function getStoredEquipment(): Equipment[] {
  try {
    const raw = safeGetItem(STORAGE_KEY_EQUIPMENT);
    if (!raw) {
      safeSetItem(STORAGE_KEY_EQUIPMENT, JSON.stringify(DEFAULT_EQUIPMENT));
      return DEFAULT_EQUIPMENT;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return DEFAULT_EQUIPMENT;
  } catch {
    return DEFAULT_EQUIPMENT;
  }
}

export function saveEquipmentCatalog(catalog: Equipment[], actor: string = 'Eng. Carlos Neto (Admin)'): void {
  safeSetItem(STORAGE_KEY_EQUIPMENT, JSON.stringify(catalog));
  addAuditLogEntry({
    id: Date.now(),
    at: new Date().toISOString(),
    actor_name: actor,
    action: 'update_equipment_catalog',
    entity: 'equipment',
    entity_id: 'catalog',
    details: { items_count: catalog.length },
  });
}

export function addCustomEquipment(
  item: { name: string; category?: string; price_kz: number },
  actor: string = 'Applicant (Custom Equipment)'
): Equipment {
  const current = getStoredEquipment();
  const newEquipment: Equipment = {
    id: `cust-eq-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name: item.name.trim(),
    category: item.category?.trim() || 'Custom Device',
    price_kz: Math.max(1, Math.round(item.price_kz)),
    active: true,
    is_custom: true,
  };
  const updated = [...current, newEquipment];
  saveEquipmentCatalog(updated, actor);
  return newEquipment;
}

export function deleteCustomEquipment(
  id: string,
  actor: string = 'Applicant (Delete Equipment)'
): Equipment[] {
  const current = getStoredEquipment();
  const updated = current.filter((eq) => eq.id !== id);
  saveEquipmentCatalog(updated, actor);
  return updated;
}

export function resetEquipmentCatalogToDefault(actor: string = 'Eng. Carlos Neto (Admin)'): Equipment[] {
  safeSetItem(STORAGE_KEY_EQUIPMENT, JSON.stringify(DEFAULT_EQUIPMENT));
  addAuditLogEntry({
    id: Date.now(),
    at: new Date().toISOString(),
    actor_name: actor,
    action: 'reset_equipment_catalog',
    entity: 'equipment',
    entity_id: 'catalog',
    details: { items_count: DEFAULT_EQUIPMENT.length },
  });
  return DEFAULT_EQUIPMENT;
}

export function getStoredPointRules(): Record<string, PointRule[]> {
  try {
    const raw = safeGetItem(STORAGE_KEY_POINT_RULES);
    if (!raw) {
      safeSetItem(STORAGE_KEY_POINT_RULES, JSON.stringify(DEFAULT_POINT_RULES));
      return DEFAULT_POINT_RULES;
    }
    return JSON.parse(raw);
  } catch {
    return DEFAULT_POINT_RULES;
  }
}

export function savePointRules(
  rules: Record<string, PointRule[]>,
  actor: string = 'Eng. Carlos Neto (Admin)'
): void {
  safeSetItem(STORAGE_KEY_POINT_RULES, JSON.stringify(rules));
  addAuditLogEntry({
    id: Date.now(),
    at: new Date().toISOString(),
    actor_name: actor,
    action: 'update_point_rules',
    entity: 'point_rules',
    entity_id: 'v2',
    details: {
      params_count: Object.keys(rules).length,
      timestamp: new Date().toISOString(),
    },
  });
}

export function resetPointRulesToDefault(actor: string = 'Eng. Carlos Neto (Admin)'): Record<string, PointRule[]> {
  safeSetItem(STORAGE_KEY_POINT_RULES, JSON.stringify(DEFAULT_POINT_RULES));
  addAuditLogEntry({
    id: Date.now(),
    at: new Date().toISOString(),
    actor_name: actor,
    action: 'reset_point_rules',
    entity: 'point_rules',
    entity_id: 'default',
    details: { message: 'Reset to seed defaults' },
  });
  return DEFAULT_POINT_RULES;
}

const STORAGE_KEY_SCORING_CONFIG = 'unitel_scoring_config_v3';

export const DEFAULT_SEGMENT_SWITCHES: SegmentSwitchItem[] = [
  { code: 'P', name: 'Identity & Legal KYC', enabled: true, base_weight: 15, description: 'National ID, Age 18+, SIM registration match' },
  { code: 'T', name: 'Telecom & Airtime', enabled: true, base_weight: 30, description: 'Recharge consistency, tenure, data consumption velocity' },
  { code: 'W', name: 'Unitel Money Wallet', enabled: true, base_weight: 20, description: 'Mobile money inflow, merchant QR, balance stability' },
  { code: 'B', name: 'Banking & Formal Finance', enabled: true, base_weight: 14, description: 'Multicaixa card activity, bank tenure, average balance' },
  { code: 'X', name: 'Alternative Data (Utility)', enabled: true, base_weight: 15, description: 'Prepaid electricity (ENDE), water, NIF & municipal permits' },
  { code: 'S', name: 'Social Profile Insights', enabled: true, base_weight: 0, description: 'Consent-based public post analysis for asset & business indicators' },
];

export const DEFAULT_SCORING_CONFIG: ScoringConfiguration = {
  version_id: 'v2.1-default',
  version_label: 'v2.1 (Standard Segment Mix)',
  updated_at: new Date().toISOString(),
  updated_by: 'System (Default)',
  segments: DEFAULT_SEGMENT_SWITCHES,
  assets_bonus_enabled: true,
  ai_mode: 'templates',
};

export function getStoredScoringConfig(): ScoringConfiguration {
  try {
    const raw = safeGetItem(STORAGE_KEY_SCORING_CONFIG);
    if (!raw) {
      safeSetItem(STORAGE_KEY_SCORING_CONFIG, JSON.stringify(DEFAULT_SCORING_CONFIG));
      return DEFAULT_SCORING_CONFIG;
    }
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.segments)) {
      // Ensure all 6 segments exist in configuration
      const existingCodes = new Set(parsed.segments.map((s: SegmentSwitchItem) => s.code));
      DEFAULT_SEGMENT_SWITCHES.forEach(defSeg => {
        if (!existingCodes.has(defSeg.code)) {
          parsed.segments.push(defSeg);
        }
      });
      return parsed;
    }
    return DEFAULT_SCORING_CONFIG;
  } catch {
    return DEFAULT_SCORING_CONFIG;
  }
}

export function saveScoringConfig(
  config: ScoringConfiguration,
  actor: string = 'Eng. Carlos Neto (Admin)'
): void {
  const updated: ScoringConfiguration = {
    ...config,
    updated_at: new Date().toISOString(),
    updated_by: actor,
  };
  safeSetItem(STORAGE_KEY_SCORING_CONFIG, JSON.stringify(updated));

  // Log in immutable audit trail
  addAuditLogEntry({
    id: Date.now(),
    at: new Date().toISOString(),
    actor_name: actor,
    action: 'update_scoring_config',
    entity: 'scoring_config',
    entity_id: config.version_id,
    details: {
      version_label: config.version_label,
      enabled_segments: config.segments.filter(s => s.enabled).map(s => s.code),
      assets_bonus_enabled: config.assets_bonus_enabled,
      ai_mode: config.ai_mode,
    },
  });
}

export function resetScoringConfigToDefault(actor: string = 'Eng. Carlos Neto (Admin)'): ScoringConfiguration {
  safeSetItem(STORAGE_KEY_SCORING_CONFIG, JSON.stringify(DEFAULT_SCORING_CONFIG));
  addAuditLogEntry({
    id: Date.now(),
    at: new Date().toISOString(),
    actor_name: actor,
    action: 'reset_scoring_config',
    entity: 'scoring_config',
    entity_id: 'default',
    details: { message: 'Reset segments and weights to baseline seed' },
  });
  return DEFAULT_SCORING_CONFIG;
}

export function isSegmentEnabled(blockCode: BlockCode): boolean {
  if (blockCode === 'A') return getStoredScoringConfig().assets_bonus_enabled;
  const config = getStoredScoringConfig();
  const seg = config.segments.find(s => s.code === blockCode);
  return seg ? seg.enabled : true;
}

/**
 * Re-normalizes weights for a segment based on active enabled blocks so that enabled blocks sum to 94.
 * When a segment is turned OFF (e.g. Banking B=14), the remaining active blocks scale up proportionally
 * so the total base points invariant remains exactly 94.
 */
export function getNormalizedSegmentWeights(
  segmentCode: SegmentCode,
  config?: ScoringConfiguration
): Record<BlockCode, number> {
  const currentConfig = config || getStoredScoringConfig();
  const weights = getStoredWeights();
  const segWeights = weights.filter(w => w.segment_code === segmentCode);

  const rawWeights: Record<BlockCode, number> = {
    P: 0, T: 0, W: 0, B: 0, X: 0, S: 0, A: 0,
  };
  segWeights.forEach(w => {
    rawWeights[w.block_code] = w.points;
  });

  const baseCodes: BlockCode[] = ['P', 'T', 'W', 'B', 'X'];
  const enabledBaseCodes = baseCodes.filter(code => {
    const sw = currentConfig.segments.find(s => s.code === code);
    return sw ? sw.enabled : true;
  });

  if (enabledBaseCodes.length === 0) {
    return rawWeights;
  }

  // Sum of configured raw weights for enabled blocks
  const sumRawEnabled = enabledBaseCodes.reduce((sum, c) => sum + (rawWeights[c] || 0), 0);
  if (sumRawEnabled === 0) {
    return rawWeights;
  }

  // If all default 5 blocks are enabled, return exact raw weights
  if (enabledBaseCodes.length === 5 && sumRawEnabled === 94) {
    return rawWeights;
  }

  // Re-normalize proportionally to sum to 94
  const targetSum = 94;
  const normalized: Record<BlockCode, number> = {
    P: 0, T: 0, W: 0, B: 0, X: 0, S: 0, A: 0,
  };

  let allocated = 0;
  enabledBaseCodes.forEach((code, index) => {
    if (index === enabledBaseCodes.length - 1) {
      // Last enabled block absorbs rounding difference
      normalized[code] = Math.max(0, targetSum - allocated);
    } else {
      const share = Math.round(((rawWeights[code] || 0) / sumRawEnabled) * targetSum);
      normalized[code] = share;
      allocated += share;
    }
  });

  return normalized;
}
