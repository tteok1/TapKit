console.error(
  'NOT_IMPLEMENTED: ' +
    (process.argv[2] ?? 'suite') +
    ' belongs to a later task. No checks were run.',
);
process.exitCode = 2;
