import { buildHelper } from './helper-build.mjs';
import { buildDesktop } from './desktop-build.mjs';
await buildHelper();
buildDesktop();
