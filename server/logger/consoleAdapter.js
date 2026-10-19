import { formatEntry } from './format.js';

export function createConsoleAdapter({ stream = process.stdout } = {}) {
  return {
    name: 'console',
    write(entry) {
      stream.write(`${formatEntry(entry)}\n`);
    },
    close() {},
  };
}
