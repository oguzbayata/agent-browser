'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function resolveElectronBinary() {
  try {
    return require('electron');
  } catch {
    const fallback = path.join(
      process.env.LOCALAPPDATA || osTmp(),
      'Temp',
      'electron-dist-agent',
      'electron.exe',
    );
    if (fs.existsSync(fallback)) {
      return fallback;
    }
    throw new Error(
      'Electron ikilisi bulunamadı. Proje klasöründe `npm install` çalıştırın.',
    );
  }
}

function osTmp() {
  return process.env.TEMP || process.env.TMP || '.';
}

const electronPath = resolveElectronBinary();
const child = spawn(electronPath, ['.'], {
  cwd: __dirname,
  stdio: 'inherit',
  windowsHide: false,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
