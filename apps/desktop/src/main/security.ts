export function trustedSender(
  event: { sender: unknown; senderFrame: unknown },
  windows: Iterable<{ webContents: { mainFrame: { url: string } } }>,
  trustedUrl: string,
) {
  for (const window of windows) {
    if (
      event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame &&
      window.webContents.mainFrame.url === trustedUrl
    )
      return true;
  }
  return false;
}
