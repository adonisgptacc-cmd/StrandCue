import { z } from 'zod';

export type DependencyFinding = {
  code: string;
  message: string;
};

export type DependencyAuditSummary = {
  critical: number;
  high: number;
  moderate: number;
  reviewedAdvisories: number;
};

const ghsaIdPattern = /^GHSA-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}$/;
const ghsaUrlPattern = /^https:\/\/github\.com\/advisories\/(GHSA-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4})$/;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const severitySchema = z.enum(['info', 'low', 'moderate', 'high', 'critical']);
const surfaceSchema = z.enum(['android', 'web', 'development', 'production']);

const advisorySchema = z.object({
  name: z.string().trim().min(1),
  url: z.string().regex(ghsaUrlPattern),
  severity: severitySchema,
}).passthrough();

const vulnerabilitySchema = z.object({
  name: z.string().trim().min(1),
  severity: severitySchema,
  via: z.array(z.union([z.string().trim().min(1), advisorySchema])),
}).passthrough();

const auditReportSchema = z.object({
  auditReportVersion: z.literal(2),
  vulnerabilities: z.record(z.string().min(1), vulnerabilitySchema),
}).passthrough();

const approvedPackageBranchSchema = z.object({
  path: z.array(z.string().trim().min(1)).min(1),
  surfaces: z.array(surfaceSchema).min(1),
}).strict();

const exceptionSchema = z.object({
  advisoryId: z.string().regex(ghsaIdPattern),
  packages: z.array(approvedPackageBranchSchema).min(1),
  severity: z.literal('moderate'),
  reachable: z.enum(['yes', 'no', 'uncertain']),
  assessment: z.string().trim().min(1),
  mitigation: z.string().trim().min(1),
  owner: z.string().trim().min(1),
  approvedOn: z.string(),
  reviewOn: z.string(),
  expiresOn: z.string(),
  upgradePath: z.string().trim().min(1),
}).strict();

const exceptionRegistrySchema = z.array(exceptionSchema);

const finding = (code: string, message: string): DependencyFinding => ({ code, message });

export function countDependencyVulnerabilities(report: unknown): number | undefined {
  const parsedReport = auditReportSchema.safeParse(report);
  return parsedReport.success
    ? Object.keys(parsedReport.data.vulnerabilities).length
    : undefined;
}

export function summarizeDependencyAudit(
  report: unknown,
  exceptions: unknown,
): DependencyAuditSummary | undefined {
  const parsedReport = auditReportSchema.safeParse(report);
  const parsedExceptions = exceptionRegistrySchema.safeParse(exceptions);
  if (!parsedReport.success || !parsedExceptions.success) return undefined;

  const vulnerabilities = Object.values(parsedReport.data.vulnerabilities);
  return {
    critical: vulnerabilities.filter(({ severity }) => severity === 'critical').length,
    high: vulnerabilities.filter(({ severity }) => severity === 'high').length,
    moderate: vulnerabilities.filter(({ severity }) => severity === 'moderate').length,
    reviewedAdvisories: new Set(
      parsedExceptions.data.map(({ advisoryId }) => advisoryId),
    ).size,
  };
}

function isIsoDate(value: string): boolean {
  if (!isoDatePattern.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function advisoryIdFromUrl(url: string): string {
  return ghsaUrlPattern.exec(url)?.[1] ?? '';
}

type ResolvedAdvisoryBranch = {
  advisoryId: string;
  severity: z.infer<typeof severitySchema>;
  path: string[];
};

type AdvisoryBranchResolution = {
  advisoryBranches: ResolvedAdvisoryBranch[];
  unidentifiedPaths: string[][];
};

function resolveAdvisoryBranches(
  packageName: string,
  vulnerabilities: z.infer<typeof auditReportSchema>['vulnerabilities'],
  path: string[] = [],
): AdvisoryBranchResolution {
  const currentPath = [...path, packageName];
  if (path.includes(packageName)) {
    return { advisoryBranches: [], unidentifiedPaths: [currentPath] };
  }

  const vulnerability = vulnerabilities[packageName];
  if (!vulnerability || vulnerability.via.length === 0) {
    return { advisoryBranches: [], unidentifiedPaths: [currentPath] };
  }

  return vulnerability.via.reduce<AdvisoryBranchResolution>((resolution, via) => {
    const branch = typeof via === 'string'
      ? resolveAdvisoryBranches(via, vulnerabilities, currentPath)
      : {
          advisoryBranches: [{
            advisoryId: advisoryIdFromUrl(via.url),
            severity: via.severity,
            path: currentPath.at(-1) === via.name
              ? currentPath
              : [...currentPath, via.name],
          }],
          unidentifiedPaths: [],
        };

    return {
      advisoryBranches: [
        ...resolution.advisoryBranches,
        ...branch.advisoryBranches,
      ],
      unidentifiedPaths: [...resolution.unidentifiedPaths, ...branch.unidentifiedPaths],
    };
  }, { advisoryBranches: [], unidentifiedPaths: [] });
}

function packagePathSignature(path: string[]): string {
  return JSON.stringify(path);
}

export function auditDependencyPolicy(
  report: unknown,
  exceptions: unknown,
  today: string,
): DependencyFinding[] {
  if (!isIsoDate(today)) {
    return [finding('POLICY-DATE', 'Dependency policy date must be a valid ISO calendar date.')];
  }

  const parsedReport = auditReportSchema.safeParse(report);
  if (!parsedReport.success) {
    return [finding('AUDIT-SCHEMA', 'npm audit output is not a supported version 2 report.')];
  }

  const parsedExceptions = exceptionRegistrySchema.safeParse(exceptions);
  if (!parsedExceptions.success) {
    return [finding('EXCEPTION-SCHEMA', 'Dependency advisory exceptions are malformed or incomplete.')];
  }

  const advisories = Object.values(parsedReport.data.vulnerabilities)
    .flatMap(vulnerability => vulnerability.via)
    .filter((via): via is z.infer<typeof advisorySchema> => typeof via !== 'string')
    .map(advisory => ({
      advisoryId: advisoryIdFromUrl(advisory.url),
      packageName: advisory.name,
      severity: advisory.severity,
    }));

  const uniqueAdvisories = [...new Map(
    advisories.map(advisory => [
      `${advisory.advisoryId}:${advisory.severity}`,
      advisory,
    ]),
  ).values()];
  const observedAdvisoryIds = new Set(advisories.map(({ advisoryId }) => advisoryId));
  const exceptionById = new Map(parsedExceptions.data.map(exception => [exception.advisoryId, exception]));

  const exceptionIds = parsedExceptions.data.map(exception => exception.advisoryId);
  const duplicateExceptionFindings = [...new Set(
    exceptionIds.filter((advisoryId, index) => exceptionIds.indexOf(advisoryId) !== index),
  )].map(advisoryId => finding(
    'EXCEPTION-DUPLICATE',
    `Exception identity must be unique: ${advisoryId}.`,
  ));

  const exceptionDateFindings = parsedExceptions.data.flatMap(exception => {
    const datesAreValid = [exception.approvedOn, exception.reviewOn, exception.expiresOn]
      .every(isIsoDate);
    const datesAreOrdered = exception.approvedOn <= exception.reviewOn
      && exception.reviewOn <= exception.expiresOn;
    const isCurrent = exception.approvedOn <= today && today <= exception.expiresOn;

    return datesAreValid && datesAreOrdered && isCurrent
      ? []
      : [finding('EXCEPTION-DATE', `Exception dates are invalid or not current: ${exception.advisoryId}.`)];
  });

  const exceptionReviewFindings = parsedExceptions.data
    .filter(exception => (
      isIsoDate(exception.approvedOn)
      && isIsoDate(exception.reviewOn)
      && isIsoDate(exception.expiresOn)
      && exception.approvedOn <= exception.reviewOn
      && exception.reviewOn <= exception.expiresOn
      && exception.approvedOn <= today
      && today <= exception.expiresOn
      && today > exception.reviewOn
    ))
    .map(exception => finding(
      'EXCEPTION-REVIEW-DUE',
      `Exception review is due: ${exception.advisoryId}.`,
    ));

  const advisoryFindings = uniqueAdvisories.flatMap(advisory => {
    if (advisory.severity === 'high' || advisory.severity === 'critical') {
      return [finding(
        'ADVISORY-SEVERITY',
        `${advisory.severity} advisory cannot be excepted: ${advisory.advisoryId}.`,
      )];
    }

    if (advisory.severity === 'moderate' && !exceptionById.has(advisory.advisoryId)) {
      return [finding(
        'ADVISORY-UNEXCEPTED',
        `Moderate advisory has no reviewed exception: ${advisory.advisoryId}.`,
      )];
    }

    return [];
  });

  const severeNodeFindings = Object.values(parsedReport.data.vulnerabilities)
    .filter(vulnerability => (
      vulnerability.severity === 'high' || vulnerability.severity === 'critical'
    ))
    .map(vulnerability => finding(
      'ADVISORY-SEVERITY',
      `${vulnerability.severity} vulnerability cannot be excepted: ${vulnerability.name}.`,
    ));

  const moderateResolutions = Object.entries(parsedReport.data.vulnerabilities)
    .filter(([, vulnerability]) => vulnerability.severity === 'moderate')
    .map(([packageName, vulnerability]) => ({
      vulnerability,
      resolution: resolveAdvisoryBranches(
        packageName,
        parsedReport.data.vulnerabilities,
      ),
    }));

  const unidentifiedModerateFindings = moderateResolutions
    .filter(({ resolution }) => (
      resolution.advisoryBranches.length === 0
      || resolution.unidentifiedPaths.length > 0
    ))
    .map(({ vulnerability }) => finding(
      'ADVISORY-UNIDENTIFIED',
      `Moderate vulnerability has no concrete GHSA advisory: ${vulnerability.name}.`,
    ));

  const inadequateResolutionFindings = moderateResolutions
    .filter(({ resolution }) => (
      resolution.advisoryBranches.length > 0
      && resolution.advisoryBranches.every(({ severity }) => (
        severity === 'info' || severity === 'low'
      ))
    ))
    .map(() => finding(
      'ADVISORY-RESOLUTION-SEVERITY',
      'Moderate vulnerability must resolve to a moderate-or-higher concrete GHSA advisory.',
    ));

  const relevantModerateBranches = [...new Map(
    moderateResolutions.flatMap(({ resolution }) => resolution.advisoryBranches)
      .filter(({ severity }) => severity === 'moderate')
      .map(branch => [
        `${branch.advisoryId}:${packagePathSignature(branch.path)}`,
        branch,
      ]),
  ).values()];

  const unreviewedPathFindings = relevantModerateBranches.flatMap(branch => {
    const exception = exceptionById.get(branch.advisoryId);
    if (!exception) return [];

    const approvedPaths = new Set(
      exception.packages.map(({ path }) => packagePathSignature(path)),
    );
    return approvedPaths.has(packagePathSignature(branch.path))
      ? []
      : [finding(
          'ADVISORY-PATH-UNREVIEWED',
          'Observed advisory dependency path has not been reviewed.',
        )];
  });

  const staleExceptionFindings = parsedExceptions.data
    .filter(exception => !observedAdvisoryIds.has(exception.advisoryId))
    .map(exception => finding(
      'EXCEPTION-STALE',
      `Exception no longer matches an observed advisory: ${exception.advisoryId}.`,
    ));

  return [
    ...duplicateExceptionFindings,
    ...exceptionDateFindings,
    ...exceptionReviewFindings,
    ...advisoryFindings,
    ...severeNodeFindings,
    ...unidentifiedModerateFindings,
    ...inadequateResolutionFindings,
    ...unreviewedPathFindings,
    ...staleExceptionFindings,
  ];
}
