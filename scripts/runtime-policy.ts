export const SUPPORTED_NODE_MAJOR = 24 as const;

export type RuntimeFinding = {
  code: 'NODE-VERSION';
  message: string;
};

export function auditNodeVersion(version: string): RuntimeFinding[] {
  const match = /^v?(\d+)\./.exec(version);
  const major = match ? Number(match[1]) : Number.NaN;

  return major === SUPPORTED_NODE_MAJOR
    ? []
    : [{
        code: 'NODE-VERSION',
        message: `Node ${SUPPORTED_NODE_MAJOR}.x is required; received ${version}.`,
      }];
}
