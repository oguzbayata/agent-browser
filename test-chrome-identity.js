'use strict';

const chromeIdentity = require('./chrome-identity');

let failed = 0;
const ua = chromeIdentity.userAgent();
const source = chromeIdentity.pageSource();

if (!/^Mozilla\/5\.0 /.test(ua) || /Electron/i.test(ua)) {
  failed += 1;
  console.error('userAgent should look like Chrome, not Electron:', ua);
}
if (/__agent/i.test(source) || /Electron/i.test(source)) {
  failed += 1;
  console.error('page identity script leaked an agent/Electron marker');
}
if (!source.includes('Google Chrome') || !source.includes('userAgentData')) {
  failed += 1;
  console.error('page identity script missing Chrome client hints');
}

if (failed) {
  console.error(`${failed} chrome-identity checks failed`);
  process.exit(1);
}

console.log(`chrome-identity ok · ${ua}`);
