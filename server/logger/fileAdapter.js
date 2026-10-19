import fs from 'node:fs';
import path from 'node:path';
import { formatEntry } from './format.js';

const MAX_BYTES = 5 * 1024 * 1024;

export function createFileAdapter({
  dir = 'logs',
  fileName = 'server.log',
  maxBytes = MAX_BYTES,
  onError = (error) => process.stderr.write(`[logger:file] ${error.message}\n`),
} = {}) {
  const directory = path.resolve(process.cwd(), dir);
  const filePath = path.join(directory, fileName);
  let stream = null;
  let bytes = 0;
  let queue = Promise.resolve();

  function open() {
    if (stream) {
      return stream;
    }

    fs.mkdirSync(directory, { recursive: true });
    bytes = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    stream = fs.createWriteStream(filePath, { flags: 'a' });
    stream.on('error', (error) => {
      onError(error);
      stream = null;
    });
    return stream;
  }

  function rotate() {
    if (stream) {
      stream.end();
      stream = null;
    }

    try {
      const backup = `${filePath}.1`;
      if (fs.existsSync(backup)) {
        fs.rmSync(backup);
      }
      if (fs.existsSync(filePath)) {
        fs.renameSync(filePath, backup);
      }
    } catch (error) {
      onError(error);
    }

    bytes = 0;
  }

  function append(entry) {
    const line = `${formatEntry(entry)}\n`;
    const size = Buffer.byteLength(line);

    if (bytes + size > maxBytes) {
      rotate();
    }

    const active = open();
    if (!active) {
      return;
    }

    bytes += size;
    active.write(line);
  }

  return {
    name: 'file',
    write(entry) {
      queue = queue.then(() => append(entry)).catch((error) => onError(error));
      return queue;
    },
    close() {
      return queue.then(
        () =>
          new Promise((resolve) => {
            if (!stream) {
              resolve();
              return;
            }
            stream.end(resolve);
            stream = null;
          }),
      );
    },
  };
}
