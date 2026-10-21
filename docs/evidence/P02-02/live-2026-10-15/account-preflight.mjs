// Configuration binds this acceptance to the authorized account. A failed
// connection check must still allow the normal application recovery UI to open.
const bindingKeys = ['id', 'providerId', 'apiFormat', 'baseURL', 'modelId'];
export function accountPreflight(accounts, expected) {
  if (accounts.length !== 1) throw Error('Expected exactly one bound test account');
  const account = accounts[0];
  const mismatch = bindingKeys.filter((key) => account[key] !== expected[key]);
  if (mismatch.length) throw Error('Test account configuration mismatch: ' + mismatch.join('/'));
  return {
    accountReady: account.status === 'ready',
    launchMode: account.status === 'ready' ? 'acceptance' : 'connection_recovery',
  };
}
