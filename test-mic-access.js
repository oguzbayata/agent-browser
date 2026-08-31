'use strict';

const mic = require('./mic-access');

let failed = 0;
function expect(ok, label) {
  if (!ok) {
    failed += 1;
    console.error(label);
  }
}

expect(mic.mediaIncludesAudio({ mediaTypes: ['audio'] }), 'audio-only should include audio');
expect(!mic.mediaIncludesVideo({ mediaTypes: ['audio'] }), 'audio-only should not include video');
expect(mic.mediaIncludesAudio({ mediaTypes: ['audio', 'video'] }), 'mic+camera should include audio');
expect(mic.mediaIncludesVideo({ mediaTypes: ['video'] }), 'video-only should include video');
expect(!mic.mediaIncludesAudio({ mediaTypes: ['video'] }), 'video-only should not include audio');
expect(mic.mediaIncludesAudio({}), 'empty details should treat as audio-capable');
expect(mic.originOf('https://meet.google.com/abc') === 'https://meet.google.com', 'origin parse');
expect(mic.pageHookSource().includes('getUserMedia'), 'page hook wraps getUserMedia');
expect(mic.pageStopSource().includes('agent-mic-stop'), 'stop script posts stop');

if (failed) {
  console.error(`${failed} mic-access checks failed`);
  process.exit(1);
}

console.log('mic-access ok');
