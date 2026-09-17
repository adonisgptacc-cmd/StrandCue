import { z } from 'zod';

const supportedWorkspacePatternSchema = z.enum(['apps/*', 'packages/*']);
const workspaceManifestPathSchema = z.string().regex(
  /^(apps|packages)\/[A-Za-z0-9][A-Za-z0-9._-]*\/package\.json$/,
);
const rootWorkspaceManifestSchema = z.object({
  name: z.string().trim().min(1),
  workspaces: z.array(supportedWorkspacePatternSchema).min(1),
}).passthrough();

function inventoryError(): Error {
  return new Error('WORKSPACE-INVENTORY Workspace manifest inventory is invalid.');
}

function parseWorkspacePatterns(rootManifest: unknown): string[] {
  const parsed = rootWorkspaceManifestSchema.safeParse(rootManifest);
  if (!parsed.success
    || new Set(parsed.data.workspaces).size !== parsed.data.workspaces.length) {
    throw inventoryError();
  }
  return [...parsed.data.workspaces].sort();
}

export function workspaceManifestGlobs(rootManifest: unknown): string[] {
  return parseWorkspacePatterns(rootManifest)
    .map(pattern => `${pattern}/package.json`);
}

export function workspaceManifestCandidates(
  rootManifest: unknown,
  directoryNamesByRoot: unknown,
): string[] {
  const workspaceRoots = parseWorkspacePatterns(rootManifest)
    .map(pattern => pattern.split('/')[0]);
  if (!directoryNamesByRoot
    || typeof directoryNamesByRoot !== 'object'
    || Array.isArray(directoryNamesByRoot)) {
    throw inventoryError();
  }

  const entries = Object.entries(directoryNamesByRoot);
  const suppliedRoots = entries.map(([root]) => root).sort();
  if (JSON.stringify(suppliedRoots) !== JSON.stringify([...workspaceRoots].sort())) {
    throw inventoryError();
  }

  const candidates = entries.flatMap(([root, names]) => {
    if (!Array.isArray(names)
      || names.some(name => typeof name !== 'string'
        || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name))
      || new Set(names).size !== names.length) {
      throw inventoryError();
    }
    return names.map(name => `${root}/${name}/package.json`);
  });
  return validateWorkspaceManifestPaths(rootManifest, candidates);
}

export function validateWorkspaceManifestPaths(
  rootManifest: unknown,
  discoveredPaths: unknown,
): string[] {
  const allowedRoots = new Set(
    parseWorkspacePatterns(rootManifest).map(pattern => pattern.split('/')[0]),
  );
  const parsedPaths = z.array(workspaceManifestPathSchema).safeParse(discoveredPaths);
  if (!parsedPaths.success
    || new Set(parsedPaths.data).size !== parsedPaths.data.length
    || parsedPaths.data.some(path => !allowedRoots.has(path.split('/')[0]))) {
    throw inventoryError();
  }
  return [...parsedPaths.data].sort();
}
