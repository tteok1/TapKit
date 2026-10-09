import type { TapKitBridge } from '@tapkit/contracts';
declare global {
  interface Window {
    tapkit: TapKitBridge;
  }
}
