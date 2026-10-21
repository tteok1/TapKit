import { expect, test } from 'vitest';
import {
  executionReportFailure,
  verificationScope,
  verificationScopeFailure,
} from '../../scripts/execution-verification.mjs';

const admin = {
  userSidHash: 'a'.repeat(64),
  integritySid: 'S-1-16-8192',
  administratorsGroup: true,
};
const standard = { ...admin, administratorsGroup: false };
const report = () => ({
  schemaVersion: 2,
  standardUser: false,
  verification: { scope: 'current-user', identity: { ...admin } },
  exitCode: 0,
  tests: { total: 22, passed: 22, failed: 0, pending: 0 },
  missingCases: [] as string[],
});

test('P00-03 default standard-user acceptance still rejects administrator-group evidence', () => {
  expect(verificationScope([])).toBe('standard-user');
  expect(verificationScopeFailure('standard-user', admin)).toBe(
    'STANDARD_USER_VERIFICATION_REQUIRED',
  );
  expect(verificationScopeFailure('standard-user', standard)).toBeNull();
  expect(verificationScope(['--scope=current-user'])).toBe('current-user');
  expect(() => verificationScope(['--skip-isolation'])).toThrow();
});
test('P00-03 current-account evidence enables only the matching tested token without claiming standard-user acceptance', () => {
  expect(verificationScopeFailure('current-user', admin)).toBeNull();
  expect(executionReportFailure(report(), admin)).toBeNull();
  expect(report().standardUser).toBe(false);
  expect(executionReportFailure(report(), { ...admin, userSidHash: 'b'.repeat(64) })).toBe(
    'PROBE_ACCOUNT_CHANGED',
  );
  expect(executionReportFailure(report(), { ...admin, integritySid: 'S-1-16-12288' })).toBe(
    'PROBE_TOKEN_CHANGED',
  );
  expect(executionReportFailure(report(), standard)).toBe('PROBE_TOKEN_CHANGED');
  expect(executionReportFailure(report(), null)).toBe('PROBE_IDENTITY_UNAVAILABLE');
});
test('P00-03 failed skipped absent or incomplete native checks cannot authorize a current-account report', () => {
  const cases = [
    { exitCode: 1 },
    { tests: undefined },
    { tests: { total: 22, passed: 21, failed: 1, pending: 0 } },
    { tests: { total: 22, passed: 21, failed: 0, pending: 1 } },
    { tests: { total: 0, passed: 0, failed: 0, pending: 0 } },
    { missingCases: ['required native case'] },
    { missingCases: undefined },
  ];
  for (const patch of cases)
    expect(executionReportFailure({ ...report(), ...patch }, admin)).toBe(
      'NATIVE_ACCEPTANCE_INCOMPLETE',
    );
});
test('P00-03 malformed or relabelled account evidence fails closed while verified legacy standard reports remain supported', () => {
  expect(executionReportFailure({ standardUser: true }, null)).toBeNull();
  expect(executionReportFailure({ standardUser: false }, admin)).toBe(
    'STANDARD_USER_VERIFICATION_REQUIRED',
  );
  expect(executionReportFailure({ ...report(), schemaVersion: 1 }, admin)).toBe(
    'PROBE_SCOPE_INVALID',
  );
  expect(
    executionReportFailure(
      { ...report(), verification: { scope: 'any-user', identity: admin } },
      admin,
    ),
  ).toBe('PROBE_SCOPE_INVALID');
  expect(executionReportFailure({ ...report(), standardUser: true }, admin)).toBe(
    'PROBE_IDENTITY_INCONSISTENT',
  );
  expect(
    executionReportFailure(
      { ...report(), verification: { scope: 'current-user', identity: {} } },
      admin,
    ),
  ).toBe('PROBE_IDENTITY_UNAVAILABLE');
  expect(verificationScopeFailure('current-user', null)).toBe('PROBE_IDENTITY_UNAVAILABLE');
});
