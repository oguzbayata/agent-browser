'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function isWindowsStoreStub(filePath) {
  return /[/\\]WindowsApps[/\\]/i.test(String(filePath || ''));
}

function firstExisting(files) {
  for (const file of files) {
    if (file && fs.existsSync(file)) {
      return file;
    }
  }
  return '';
}

function extraBinDirs() {
  const local = process.env.LOCALAPPDATA || '';
  const home = process.env.USERPROFILE || '';
  const dirs = [
    path.join(local, 'hermes', 'hermes-agent', 'venv', 'Scripts'),
    path.join(local, 'Microsoft', 'WinGet', 'Links'),
    path.join(local, 'Programs', 'yt-dlp'),
    path.join(local, 'Programs', 'ffmpeg', 'bin'),
    path.join(home, 'scoop', 'shims'),
    path.join(home, 'scoop', 'apps', 'ffmpeg', 'current', 'bin'),
    path.join(home, 'scoop', 'apps', 'yt-dlp', 'current'),
    'C:\\ffmpeg\\bin',
    'C:\\yt-dlp',
  ];
  return dirs.filter((dir) => dir && fs.existsSync(dir));
}

function whereAll(name) {
  try {
    const printed = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], {
      encoding: 'utf8',
      timeout: 4000,
      windowsHide: true,
    });
    return String(printed.stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && fs.existsSync(line) && !isWindowsStoreStub(line));
  } catch {
    return [];
  }
}

function findWinGetFfmpeg() {
  const root = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  if (!root || !fs.existsSync(root)) {
    return '';
  }
  let packages = [];
  try {
    packages = fs.readdirSync(root);
  } catch {
    return '';
  }
  for (const dir of packages) {
    if (!/^Gyan\.FFmpeg/i.test(dir)) {
      continue;
    }
    const pkg = path.join(root, dir);
    let inners = [];
    try {
      inners = fs.readdirSync(pkg);
    } catch {
      continue;
    }
    for (const inner of inners) {
      const bin = path.join(pkg, inner, 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
      if (fs.existsSync(bin)) {
        return bin;
      }
    }
  }
  return '';
}

function findYtDlp() {
  const exe = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  return (
    firstExisting([
      ...whereAll('yt-dlp'),
      ...whereAll(exe),
      ...extraBinDirs().map((dir) => path.join(dir, exe)),
    ]) || ''
  );
}

function findFfmpeg() {
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  return (
    firstExisting([
      ...whereAll('ffmpeg'),
      ...whereAll(exe),
      ...extraBinDirs().map((dir) => path.join(dir, exe)),
      findWinGetFfmpeg(),
    ]) || ''
  );
}

function hunterPathEnv(ffmpegPath) {
  const parts = extraBinDirs();
  if (ffmpegPath) {
    parts.unshift(path.dirname(ffmpegPath));
  }
  const yt = findYtDlp();
  if (yt) {
    parts.unshift(path.dirname(yt));
  }
  return [...parts, process.env.PATH || ''].filter(Boolean).join(path.delimiter);
}

module.exports = {
  extraBinDirs,
  findFfmpeg,
  findYtDlp,
  hunterPathEnv,
  isWindowsStoreStub,
};
