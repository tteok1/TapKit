import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

/** @typedef {{userSidHash: string, integritySid: string, administratorsGroup: boolean}} ExecutionIdentity */
/** @param {string[]} args @returns {'standard-user' | 'current-user'} */
export function verificationScope(args) {
  if (args.length === 0) return 'standard-user';
  if (args.length === 1 && args[0] === '--scope=current-user') return 'current-user';
  throw new Error('Expected no arguments or --scope=current-user');
}

/** @param {unknown} identity @returns {identity is ExecutionIdentity} */
export function validExecutionIdentity(identity) {
  return (
    !!identity &&
    typeof identity === 'object' &&
    'userSidHash' in identity &&
    typeof identity.userSidHash === 'string' &&
    /^[a-f0-9]{64}$/.test(identity.userSidHash) &&
    'integritySid' in identity &&
    typeof identity.integritySid === 'string' &&
    /^S-1-16-\d+$/.test(identity.integritySid) &&
    'administratorsGroup' in identity &&
    typeof identity.administratorsGroup === 'boolean'
  );
}

/** Read token metadata only. Do not persist account names, raw SIDs or whoami output. @returns {ExecutionIdentity | null} */
export function readExecutionIdentity() {
  const user = spawnSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const groups = spawnSync('whoami.exe', ['/groups', '/fo', 'csv', '/nh'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const sids = user.stdout?.match(/\bS-1-5-(?:\d+-)*\d+\b/g) ?? [];
  const integrity = groups.stdout?.match(/\bS-1-16-\d+\b/g) ?? [];
  if (user.status !== 0 || groups.status !== 0 || sids.length !== 1 || integrity.length !== 1)
    return null;
  return {
    userSidHash: createHash('sha256').update(sids[0]).digest('hex'),
    integritySid: integrity[0],
    administratorsGroup: /\bS-1-5-32-544\b/.test(groups.stdout),
  };
}

/** @param {ExecutionIdentity | null} identity */
export function isStandardUser(identity) {
  return (
    validExecutionIdentity(identity) &&
    !identity.administratorsGroup &&
    identity.integritySid === 'S-1-16-8192'
  );
}

/** @param {'standard-user' | 'current-user'} scope @param {ExecutionIdentity | null} identity */
export function verificationScopeFailure(scope, identity) {
  if (!validExecutionIdentity(identity)) return 'PROBE_IDENTITY_UNAVAILABLE';
  return scope === 'current-user' || isStandardUser(identity)
    ? null
    : 'STANDARD_USER_VERIFICATION_REQUIRED';
}

/**
 * Fingerprint/policy/capability checks remain with the caller. A current-user
 * report also needs complete native evidence and an exact host token binding.
 * @param {any} report @param {ExecutionIdentity | null} currentIdentity
 * @returns {string | null}
 */
export function executionReportFailure(report, currentIdentity) {
  if (report.verification === undefined)
    return report.standardUser === true ? null : 'STANDARD_USER_VERIFICATION_REQUIRED';
  if (report.schemaVersion !== 2 || report.verification?.scope !== 'current-user')
    return 'PROBE_SCOPE_INVALID';
  const bound = report.verification.identity;
  if (!validExecutionIdentity(bound) || !validExecutionIdentity(currentIdentity))
    return 'PROBE_IDENTITY_UNAVAILABLE';
  if (bound.userSidHash !== currentIdentity.userSidHash) return 'PROBE_ACCOUNT_CHANGED';
  if (
    bound.integritySid !== currentIdentity.integritySid ||
    bound.administratorsGroup !== currentIdentity.administratorsGroup
  )
    return 'PROBE_TOKEN_CHANGED';
  if (report.standardUser !== isStandardUser(bound)) return 'PROBE_IDENTITY_INCONSISTENT';
  const tests = report.tests;
  if (
    report.exitCode !== 0 ||
    !Number.isSafeInteger(tests?.total) ||
    tests.total <= 0 ||
    tests.passed !== tests.total ||
    tests.failed !== 0 ||
    tests.pending !== 0 ||
    !Array.isArray(report.missingCases) ||
    report.missingCases.length !== 0
  )
    return 'NATIVE_ACCEPTANCE_INCOMPLETE';
  return null;
}
