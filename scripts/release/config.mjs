import { join } from 'node:path';
import { isReleaseRepository } from '../../packages/contracts/src/distribution.ts';
import { root } from '../lib.mjs';
import { readJSON } from './sbom.mjs';

export async function distributionConfig() {
  const { repository, publicSiteURL, logo } = await readJSON(
    join(root, 'distribution.config.json'),
  );
  if (!isReleaseRepository(repository)) throw Error('Invalid distribution repository.');
  if (publicSiteURL !== null) {
    const address = new URL(publicSiteURL);
    if (
      address.protocol !== 'https:' ||
      address.username ||
      address.password ||
      address.search ||
      address.hash
    )
      throw Error('Expected a public HTTPS website address.');
  }
  if (
    logo !== null &&
    (typeof logo !== 'string' || !/^[a-z0-9][a-z0-9_.-]*\.(?:webp|png)$/i.test(logo))
  )
    throw Error('Logo must name a PNG or WebP in website/assets.');
  return { repository, publicSiteURL, logo };
}
