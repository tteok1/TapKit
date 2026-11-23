import { app } from 'electron';

export function configureAnonymousNetwork() {
  app.commandLine.appendSwitch('disable-quic');
  app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
}
