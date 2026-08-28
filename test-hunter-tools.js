'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findFfmpeg, findYtDlp, hunterPathEnv } = require('./hunter-tools');

const savedPath = process.env.PATH;
process.env.PATH = process.platform === 'win32' ? 'C:\\Windows\\System32' : '/usr/bin';
const ytStripped = findYtDlp();
const ffmpegStripped = findFfmpeg();
process.env.PATH = savedPath;
if (!ytStripped || !ffmpegStripped) {
  console.error('expected hunter binaries when PATH is empty');
  process.exit(1);
}

const yt = findYtDlp();
const ffmpeg = findFfmpeg();
if (!yt) {
  console.error('expected to find yt-dlp on this machine');
  process.exit(1);
}
if (!ffmpeg) {
  console.error('expected to find ffmpeg on this machine');
  process.exit(1);
}

const env = {
  ...process.env,
  PATH: hunterPathEnv(ffmpeg),
  PYTHONUTF8: '1',
  PYTHONIOENCODING: 'utf-8',
};
delete env.ELECTRON_RUN_AS_NODE;

const savePath = path.join(os.tmpdir(), `agent-hunter-verify-${Date.now()}.mp4`);
const result = spawnSync(
  yt,
  [
    '--ffmpeg-location',
    ffmpeg,
    '--no-playlist',
    '--newline',
    '--no-warnings',
    '-f',
    'bv*+ba/b',
    '--merge-output-format',
    'mp4',
    '-o',
    savePath,
    'https://www.youtube.com/watch?v=jNQXAC9IVRw',
  ],
  { encoding: 'utf8', timeout: 120000, windowsHide: true, env },
);

const size = fs.existsSync(savePath) ? fs.statSync(savePath).size : 0;
if (result.status !== 0 || size <= 0) {
  console.error(result.stderr || result.stdout || 'download failed');
  process.exit(1);
}

fs.unlinkSync(savePath);
console.log(`hunter-tools ok · yt-dlp ${path.basename(yt)} · ffmpeg ${path.basename(ffmpeg)} · ${size} bytes`);
