'use strict';

function mediaTypesOf(details) {
  if (Array.isArray(details?.mediaTypes) && details.mediaTypes.length) {
    return details.mediaTypes.map((item) => String(item || '').toLowerCase());
  }
  if (details?.mediaType) {
    return [String(details.mediaType).toLowerCase()];
  }
  return [];
}

function mediaIncludesAudio(details) {
  const types = mediaTypesOf(details);
  return types.length === 0 || types.includes('audio');
}

function mediaIncludesVideo(details) {
  return mediaTypesOf(details).includes('video');
}

function originOf(rawUrl) {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return '';
  }
}

function pageHookSource() {
  return `(() => {
    const devices = navigator.mediaDevices;
    if (!devices || typeof devices.getUserMedia !== 'function') {
      return;
    }
    if (devices.getUserMedia.__agentMic) {
      return;
    }
    const live = new Set();
    const report = () => {
      window.postMessage({ source: 'agent-mic', active: live.size > 0 }, '*');
    };
    const watch = (stream) => {
      if (!stream || typeof stream.getAudioTracks !== 'function') {
        return stream;
      }
      for (const track of stream.getAudioTracks()) {
        live.add(track);
        track.addEventListener('ended', () => {
          live.delete(track);
          report();
        }, { once: true });
      }
      report();
      return stream;
    };
    try {
      const original = devices.getUserMedia.bind(devices);
      const wrapped = (constraints) => original(constraints).then(watch);
      wrapped.__agentMic = true;
      devices.getUserMedia = wrapped;
    } catch {
      return;
    }
    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data || event.data.source !== 'agent-mic-stop') {
        return;
      }
      for (const track of live) {
        try {
          track.stop();
        } catch {
          // Track may already be ended.
        }
      }
      live.clear();
      report();
    });
  })()`;
}

function pageStopSource() {
  return `window.postMessage({ source: 'agent-mic-stop' }, '*');`;
}

module.exports = {
  mediaIncludesAudio,
  mediaIncludesVideo,
  mediaTypesOf,
  originOf,
  pageHookSource,
  pageStopSource,
};
