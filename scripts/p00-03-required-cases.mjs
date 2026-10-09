export const requiredCases = Object.freeze([
  [
    'P00-03.sandbox.test.ts',
    'Node reads only input and writes workspace; runtime and input are read only; environment is private',
  ],
  ['P00-03.sandbox.test.ts', 'execution lease cleanup allows the next helper invocation'],
  [
    'P00-03.sandbox.test.ts',
    'concurrent runs keep independent AppContainer identities and workspace ACLs',
  ],
  [
    'P00-03.sandbox.test.ts',
    'hard-killing the helper stops job descendants and recovers its ACL/profile lease',
  ],
  ['P00-03.sandbox.test.ts', 'Python starts and spawns a child in AppContainer'],
  ['P00-03.sandbox.test.ts', 'network denies public, loopback and metadata connections'],
  ['P00-03.sandbox.test.ts', 'cancel kills descendants'],
  ['P00-03.sandbox.test.ts', 'timeout, output flood and fork limits are enforced'],
  ['P00-03.sandbox.test.ts', 'memory exhaustion is contained'],
  ['P00-03.sandbox.test.ts', 'UNC, ADS, traversal, aliases and junction input paths fail closed'],
  ['P00-03.sandbox.test.ts', 'ConPTY is interactive while still in AppContainer'],
  ['P00-03.legacy-route.test.ts', 'P00-03 rejects the superseded account.execute protocol'],
  [
    'P00-03.office.test.ts',
    'P00-03 T07 OfficeWorker converts DOCX, XLSX and PPTX in the current AppContainer route',
  ],
  [
    'P00-03.office.test.ts',
    'P00-03 T08 T19 OfficeWorker blocks an executable embedded macro with an isolated positive control',
  ],
  [
    'P00-03.office.test.ts',
    'P00-03 T19 OfficeWorker preserves cached external-link data with an isolated refresh control',
  ],
  [
    'P00-03.office.test.ts',
    'P00-03 T08 OfficeWorker fails closed on a corrupt document and remains usable',
  ],
  [
    'P00-03.office.test.ts',
    'P00-03 Office hard kill recovers only its recorded mapped drives on the next helper run',
  ],
  [
    'P00-03.git-broker.test.ts',
    'P00-03 GitBroker bounds oversized diff output and cleans the private lease',
  ],
  [
    'P00-03.git-broker.test.ts',
    'P00-03 GitBroker runs real MinGit status/diff on private byte snapshots',
  ],
  [
    'P00-03.git-broker.test.ts',
    'P00-03 GitBroker rejects model args, metadata pointers and Windows path aliases',
  ],
  [
    'P00-03.git-broker.test.ts',
    'P00-03 GitBroker excludes inherited Git config, external diff and SSH commands',
  ],
  [
    'P00-03.capability.test.ts',
    'P00-03 Core reports isolated capabilities failed while storage remains usable',
  ],
]);
