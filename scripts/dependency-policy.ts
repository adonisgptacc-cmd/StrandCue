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

const exceptionSchema = z.object({
  advisoryId: z.string().regex(ghsaIdPattern),
  packages: z.array(z.string().trim().min(1)).min(1),
  severity: z.literal('moderate'),
  surfaces: z.array(z.enum(['android', 'web', 'development', 'production'])).min(1),
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

function hasConcreteAdvisory(
  packageName: string,
  vulnerabilities: z.infer<typeof auditReportSchema>['vulnerabilities'],
  path: string[] = [],
): boolean {
  if (path.includes(packageName)) return false;

  const vulnerability = vulnerabilities[packageName];
  if (!vulnerability) return false;

  return vulnerability.via.some(via => (
    typeof via !== 'string'
      || hasConcreteAdvisory(via, vulnerabilities, [...path, packageName])
  ));
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

  const unidentifiedModerateFindings = Object.entries(parsedReport.data.vulnerabilities)
    .filter(([, vulnerability]) => vulnerability.severity === 'moderate')
    .filter(([packageName]) => !hasConcreteAdvisory(
      packageName,
      parsedReport.data.vulnerabilities,
    ))
    .map(([, vulnerability]) => finding(
      'ADVISORY-UNIDENTIFIED',
      `Moderate vulnerability has no concrete GHSA advisory: ${vulnerability.name}.`,
    ));

  const staleExceptionFindings = parsedExceptions.data
    .filter(exception => !observedAdvisoryIds.has(exception.advisoryId))
    .map(exception => finding(
      'EXCEPTION-STALE',
      `Exception no longer matches an observed advisory: ${exception.advisoryId}.`,
    ));

  return [
    ...duplicateExceptionFindings,
    ...exceptionDateFindings,
    ...advisoryFindings,
    ...severeNodeFindings,
    ...unidentifiedModerateFindings,
    ...staleExceptionFindings,
  ];
}
