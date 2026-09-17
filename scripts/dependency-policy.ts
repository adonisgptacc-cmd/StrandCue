import { z } from 'zod';
import { validateWorkspaceManifestPaths } from './workspace-manifests.ts';

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
const surfaceSchema = z.enum([
  'android',
  'development',
  'ios-build-tooling',
  'production',
  'web',
]);
const runtimePlatformSchema = z.enum(['android', 'web']);
const dependencyMapSchema = z.record(
  z.string().trim().min(1),
  z.string().trim().min(1),
);

const advisorySchema = z.object({
  name: z.string().trim().min(1),
  url: z.string().regex(ghsaUrlPattern),
  severity: severitySchema,
}).passthrough();

const vulnerabilitySchema = z.object({
  name: z.string().trim().min(1),
  severity: severitySchema,
  via: z.array(z.union([z.string().trim().min(1), advisorySchema])),
  effects: z.array(z.string().trim().min(1)),
}).passthrough();

const auditReportSchema = z.object({
  auditReportVersion: z.literal(2),
  vulnerabilities: z.record(z.string().min(1), vulnerabilitySchema),
}).passthrough();

const packageManifestSchema = z.object({
  dependencies: dependencyMapSchema.optional().default({}),
  devDependencies: dependencyMapSchema.optional().default({}),
}).passthrough();

const rootSurfaceManifestSchema = packageManifestSchema.extend({
  name: z.string().trim().min(1),
  workspaces: z.array(z.string().trim().min(1)).min(1),
});

const workspacePackageManifestSchema = packageManifestSchema.extend({
  name: z.string().trim().min(1),
});

const workspaceSurfaceContextSchema = z.object({
  path: z.string().trim().min(1),
  manifest: workspacePackageManifestSchema,
  runtimePlatforms: z.array(runtimePlatformSchema).min(1)
    .refine(platforms => new Set(platforms).size === platforms.length)
    .optional(),
}).strict();

const dependencySurfaceContextSchema = z.object({
  root: rootSurfaceManifestSchema,
  workspaceManifestPaths: z.array(z.string().trim().min(1)),
  workspaces: z.array(workspaceSurfaceContextSchema).min(1),
}).strict().superRefine((context, refinement) => {
  let discoveredPaths: string[];
  try {
    discoveredPaths = validateWorkspaceManifestPaths(
      context.root,
      context.workspaceManifestPaths,
    );
  } catch {
    refinement.addIssue({ code: 'custom', message: 'Invalid workspace manifest inventory.' });
    return;
  }

  const suppliedPaths = context.workspaces.map(({ path }) => path);
  const suppliedNames = context.workspaces.map(({ manifest }) => manifest.name);
  const setsMatch = discoveredPaths.length === suppliedPaths.length
    && discoveredPaths.every(path => suppliedPaths.includes(path));
  const identitiesAreUnique = new Set(suppliedPaths).size === suppliedPaths.length
    && new Set(suppliedNames).size === suppliedNames.length
    && !suppliedNames.includes(context.root.name);
  const surfacesMatchPaths = context.workspaces.every(({ path, runtimePlatforms }) => (
    path.startsWith('apps/') ? runtimePlatforms !== undefined : runtimePlatforms === undefined
  ));
  if (!setsMatch || !identitiesAreUnique || !surfacesMatchPaths) {
    refinement.addIssue({ code: 'custom', message: 'Workspace manifest evidence is incomplete.' });
  }
});

const approvedPackageBranchSchema = z.object({
  path: z.array(z.string().trim().min(1)).min(1),
  surfaces: z.array(surfaceSchema).min(1).refine(
    surfaces => new Set(surfaces).size === surfaces.length,
  ),
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

type DependencySurface = z.infer<typeof surfaceSchema>;

type SurfaceExposureBranch = {
  path: string[];
  surfaces: DependencySurface[];
};

type SurfaceExposureResolution = {
  exposureBranches: SurfaceExposureBranch[];
  unidentifiedPaths: string[][];
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

function sortedSurfaceSignature(surfaces: DependencySurface[]): string {
  return JSON.stringify([...new Set(surfaces)].sort());
}

function addSurfaceClassification(
  classifications: Map<string, Set<DependencySurface>>,
  packageName: string,
  surfaces: DependencySurface[],
): void {
  const current = classifications.get(packageName) ?? new Set<DependencySurface>();
  classifications.set(packageName, new Set([...current, ...surfaces]));
}

function buildSurfaceClassifications(
  context: z.infer<typeof dependencySurfaceContextSchema>,
): Map<string, Set<DependencySurface>> {
  const classifications = new Map<string, Set<DependencySurface>>();
  const addManifest = (
    manifest: z.infer<typeof packageManifestSchema>,
    productionSurfaces: DependencySurface[],
  ) => {
    Object.keys(manifest.dependencies).forEach(packageName => {
      addSurfaceClassification(classifications, packageName, productionSurfaces);
    });
    Object.keys(manifest.devDependencies).forEach(packageName => {
      addSurfaceClassification(classifications, packageName, ['development']);
    });
  };

  addManifest(context.root, ['production']);
  context.workspaces.forEach(({ manifest, runtimePlatforms }) => {
    addManifest(
      manifest,
      runtimePlatforms
        ? ['production', ...runtimePlatforms]
        : ['production'],
    );
  });
  return classifications;
}

function buildViaDependents(
  vulnerabilities: z.infer<typeof auditReportSchema>['vulnerabilities'],
): Map<string, Set<string>> {
  const dependents = new Map<string, Set<string>>();
  Object.entries(vulnerabilities).forEach(([parentName, vulnerability]) => {
    vulnerability.via.forEach(via => {
      if (typeof via !== 'string') return;
      const current = dependents.get(via) ?? new Set<string>();
      dependents.set(via, new Set([...current, parentName]));
    });
  });
  return dependents;
}

function resolveSurfaceExposureBranches(
  packageName: string,
  vulnerabilities: z.infer<typeof auditReportSchema>['vulnerabilities'],
  classifications: Map<string, Set<DependencySurface>>,
  viaDependents: Map<string, Set<string>>,
  path: string[] = [],
): SurfaceExposureResolution {
  const currentPath = [...path, packageName];
  if (path.includes(packageName)) {
    return { exposureBranches: [], unidentifiedPaths: [currentPath] };
  }

  const directSurfaces = classifications.get(packageName);
  const directBranches = directSurfaces
    ? [{ path: currentPath, surfaces: [...directSurfaces] }]
    : [];
  const vulnerability = vulnerabilities[packageName];
  if (!vulnerability) {
    return directBranches.length > 0
      ? { exposureBranches: directBranches, unidentifiedPaths: [] }
      : { exposureBranches: [], unidentifiedPaths: [currentPath] };
  }

  const effectNames = new Set([
    ...vulnerability.effects,
    ...(viaDependents.get(packageName) ?? []),
  ]);
  if (effectNames.size === 0) {
    return directBranches.length > 0
      ? { exposureBranches: directBranches, unidentifiedPaths: [] }
      : { exposureBranches: [], unidentifiedPaths: [currentPath] };
  }

  return [...effectNames].reduce<SurfaceExposureResolution>((resolution, effectName) => {
    const effect = vulnerabilities[effectName];
    const hasReciprocalVia = effect?.via.some(via => via === packageName) ?? false;
    const isManifestRoot = classifications.has(effectName);
    const branch = effect && !hasReciprocalVia
      ? { exposureBranches: [], unidentifiedPaths: [[...currentPath, effectName]] }
      : resolveSurfaceExposureBranches(
          effectName,
          vulnerabilities,
          classifications,
          viaDependents,
          currentPath,
        );

    if (!effect && !isManifestRoot) {
      return {
        exposureBranches: resolution.exposureBranches,
        unidentifiedPaths: [...resolution.unidentifiedPaths, [...currentPath, effectName]],
      };
    }

    return {
      exposureBranches: [...resolution.exposureBranches, ...branch.exposureBranches],
      unidentifiedPaths: [...resolution.unidentifiedPaths, ...branch.unidentifiedPaths],
    };
  }, { exposureBranches: directBranches, unidentifiedPaths: [] });
}

function deriveObservedSurfaces(
  branch: ResolvedAdvisoryBranch,
  vulnerabilities: z.infer<typeof auditReportSchema>['vulnerabilities'],
  classifications: Map<string, Set<DependencySurface>>,
  viaDependents: Map<string, Set<string>>,
): { surfaces: DependencySurface[]; isComplete: boolean } {
  const resolution = resolveSurfaceExposureBranches(
    branch.path[0],
    vulnerabilities,
    classifications,
    viaDependents,
  );
  const surfaces = new Set<DependencySurface>();

  resolution.exposureBranches.forEach(exposure => {
    if ([...branch.path, ...exposure.path].includes('xcode')) {
      surfaces.add('ios-build-tooling');
      const classifiedPackage = exposure.path.at(-1);
      const isDirectBranchRoot = exposure.path.length === 1;
      if (classifiedPackage === 'xcode' || isDirectBranchRoot) {
        exposure.surfaces
          .filter(surface => surface !== 'development')
          .forEach(surface => surfaces.add(surface));
      }
      return;
    }
    exposure.surfaces.forEach(surface => surfaces.add(surface));
  });

  return {
    surfaces: [...surfaces].sort(),
    isComplete: surfaces.size > 0 && resolution.unidentifiedPaths.length === 0,
  };
}

export function auditDependencyPolicy(
  report: unknown,
  exceptions: unknown,
  today: string,
  surfaceContext: unknown,
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

  const parsedSurfaceContext = dependencySurfaceContextSchema.safeParse(surfaceContext);
  if (!parsedSurfaceContext.success) {
    return [finding(
      'SURFACE-CONTEXT-SCHEMA',
      'Dependency manifest surface context is malformed or incomplete.',
    )];
  }

  const surfaceClassifications = buildSurfaceClassifications(parsedSurfaceContext.data);
  const viaDependents = buildViaDependents(parsedReport.data.vulnerabilities);

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

    const matchingPaths = exception.packages.filter(
      ({ path }) => packagePathSignature(path) === packagePathSignature(branch.path),
    );
    if (matchingPaths.length === 0) {
      return [finding(
          'ADVISORY-PATH-UNREVIEWED',
          'Observed advisory dependency path has not been reviewed.',
        )];
    }

    const observed = deriveObservedSurfaces(
      branch,
      parsedReport.data.vulnerabilities,
      surfaceClassifications,
      viaDependents,
    );
    if (!observed.isComplete) {
      return [finding(
        'ADVISORY-SURFACE-UNIDENTIFIED',
        'Advisory dependency surfaces could not be classified.',
      )];
    }

    return matchingPaths.some(({ surfaces }) => (
      sortedSurfaceSignature(surfaces) === sortedSurfaceSignature(observed.surfaces)
    ))
      ? []
      : [finding(
          'ADVISORY-SURFACE-UNREVIEWED',
          'Observed advisory dependency surfaces have not been reviewed.',
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
