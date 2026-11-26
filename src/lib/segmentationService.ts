/**
 * ML Segmentation Client Service
 * Calls /api/ml/segment with silent fallback to rule-based engine when ML service is offline.
 */

import { SegmentCode } from '../types';

export interface CustomerMLFeatures {
  sim_age_months: number;
  topup_regularity: number;
  avg_monthly_topup_kz: number;
  spend_stability: number;
  airtime_loans_repaid_ratio: number;
  wallet_level: number;
}

export interface MLPredictionResult {
  segmentCode: SegmentCode;
  clusterId?: number;
  confidence?: number;
  isOffline: boolean;
  model: string;
}

export async function predictCustomerSegment(
  features: CustomerMLFeatures,
  fallbackSegment: SegmentCode
): Promise<MLPredictionResult> {
  try {
    const res = await fetch('/api/ml/segment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(features),
    });

    if (!res.ok) {
      return {
        segmentCode: fallbackSegment,
        isOffline: true,
        model: 'Rule-based Priority Chain (ML Offline Fallback)',
      };
    }

    const data = await res.json();
    if (data.fallback || data.error || !data.segment_code) {
      return {
        segmentCode: fallbackSegment,
        isOffline: true,
        model: 'Rule-based Priority Chain (ML Offline Fallback)',
      };
    }

    return {
      segmentCode: data.segment_code as SegmentCode,
      clusterId: data.cluster_id,
      confidence: data.confidence,
      isOffline: false,
      model: data.model || 'K-Means (k=10)',
    };
  } catch {
    return {
      segmentCode: fallbackSegment,
      isOffline: true,
      model: 'Rule-based Priority Chain (ML Offline Fallback)',
    };
  }
}
