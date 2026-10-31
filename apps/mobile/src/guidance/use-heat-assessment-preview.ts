import { useEffect, useState } from 'react';

import type { ProtocolDecision } from '../../../../packages/domain/src/index';
import {
  getHeatCoachAssessment,
  getHeatCoachReviewedCopy,
  type HeatCoachReceipt,
  type HeatCoachReviewedCopy,
} from '../heat-coach-api';

interface ResolvedHeatPreview {
  readonly ownerId: string;
  readonly key: string;
  readonly assessment: HeatCoachReceipt;
  readonly reviewedCopy: HeatCoachReviewedCopy;
}

export interface HeatAssessmentPreviewData {
  readonly heatAssessment: HeatCoachReceipt | null;
  readonly heatReviewedCopy: HeatCoachReviewedCopy | null;
}

/** Loads only the assessment and copy bound to a server-produced heat step. */
export function useHeatAssessmentPreview(ownerId: string, decision: ProtocolDecision | null): HeatAssessmentPreviewData {
  const binding = decision?.heatAssessmentBinding;
  const hasHeatStep = decision?.status === 'ready' && decision.steps.some(step => step.action === 'heat') === true;
  const key = hasHeatStep && binding !== undefined
    ? [binding.assessmentId, binding.sourceFingerprint, binding.publicationId, binding.publicationDigest].join('\u0000')
    : null;
  const assessmentId = hasHeatStep ? binding?.assessmentId ?? null : null;
  const sourceFingerprint = hasHeatStep ? binding?.sourceFingerprint ?? null : null;
  const publicationId = hasHeatStep ? binding?.publicationId ?? null : null;
  const publicationDigest = hasHeatStep ? binding?.publicationDigest ?? null : null;
  const [resolved, setResolved] = useState<ResolvedHeatPreview | null>(null);

  useEffect(() => {
    if (key === null || assessmentId === null || sourceFingerprint === null
      || publicationId === null || publicationDigest === null) {
      return;
    }
    let active = true;
    void (async () => {
      try {
        const assessment = await getHeatCoachAssessment(assessmentId);
        if (!active) return;
        if (assessment.stale || (assessment.status !== 'appropriate' && assessment.status !== 'lower_heat')
          || assessment.result.state !== assessment.status || assessment.assessmentId !== assessmentId
          || assessment.sourceFingerprint !== sourceFingerprint || assessment.publicationId !== publicationId
          || assessment.publicationDigest !== publicationDigest) return;
        const reviewedCopy = await getHeatCoachReviewedCopy(assessment);
        if (!active) return;
        if (reviewedCopy.assessmentId !== assessmentId || reviewedCopy.publicationId !== publicationId
          || reviewedCopy.publicationDigest !== publicationDigest) return;
        setResolved({ ownerId, key, assessment, reviewedCopy });
      } catch {
        // Missing, stale or withdrawn content stays pending; never render a
        // cached copy from another assessment or owner.
      }
    })();
    return () => { active = false; };
  }, [ownerId, key, assessmentId, sourceFingerprint, publicationId, publicationDigest]);

  if (resolved === null || resolved.ownerId !== ownerId || resolved.key !== key) {
    return { heatAssessment: null, heatReviewedCopy: null };
  }
  return { heatAssessment: resolved.assessment, heatReviewedCopy: resolved.reviewedCopy };
}
