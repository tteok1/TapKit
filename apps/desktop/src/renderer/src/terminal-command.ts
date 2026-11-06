/** Tokenizes a displayed command into argv; no shell expansion or host execution. */
export function terminalArgv(text: string, runtime: 'node' | 'python') {
  const args: string[] = [];
  let value = '',
    quote = '',
    started = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === '\\' && quote === '"' && ['"', '\\'].includes(text[i + 1] ?? '')) {
      value += text[++i];
      started = true;
    } else if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? '' : char;
      started = true;
    } else if (/\s/.test(char) && !quote) {
      if (started) {
        args.push(value);
        value = '';
        started = false;
      }
    } else {
      value += char;
      started = true;
    }
  }
  if (quote) throw Error('COMMAND_QUOTES');
  if (started) args.push(value);
  const name = args.shift();
  if (runtime === 'node' && name === 'npm') return ['npm', ...args];
  if (!(runtime === 'node' ? name === 'node' : name === 'python' || name === 'python3'))
    throw Error('COMMAND_RUNTIME');
  return args;
}
