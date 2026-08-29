'use strict';

const ICON_COLORS = Object.freeze([
  '#128C7E', '#5B6CFF', '#FF8A3D', '#E53935', '#F5C518', '#26A69A', '#7E57C2', '#3DFFC8',
  '#EC407A', '#42A5F5', '#66BB6A', '#FF5A6A', '#FFB300', '#8D6E63', '#29B6F6', '#26C6DA',
  '#00ACC1', '#AB47BC', '#43A047', '#5C6BC0', '#EF5350', '#FF6D00', '#8D6E63', '#37474F',
  '#00897B', '#D81B60', '#8E24AA', '#1E88E5', '#F4511E', '#6A1B9A', '#3949AB', '#C62828',
  '#EF6C00', '#AD1457', '#455A64', '#FF7043', '#00BFA5', '#039BE5', '#F9A825', '#0277BD',
  '#2E7D32', '#5D4037', '#FB8C00', '#6D4C41', '#1565C0', '#7B1FA2', '#00838F', '#C67C00',
]);

function badge(bg, inner) {
  return `<rect width="20" height="20" rx="5" fill="${bg}"/>${inner}`;
}

const GLYPHS = Object.freeze([
  (c) => `<path fill="${c}" d="M10 3.2 15.8 5.4v3.8c0 3.5-2.2 5.8-5.8 6.8-3.6-1-5.8-3.3-5.8-6.8V5.4Z"/>`,
  (c) => `<path fill="${c}" d="M10 3.6c-2.6 0-4.6 1.8-4.6 4.4v6.4l1.5-1 1.5 1 1.6-1 1.6 1 1.5-1 1.5 1V8c0-2.6-2-4.4-4.6-4.4z"/>`,
  (c) => `<rect x="4" y="5.4" width="12" height="9.2" rx="1.6" fill="${c}"/><path fill="#0a0c0f" d="M8.4 8.2 13 10.1 8.4 12z"/>`,
  (c) => `<circle cx="10" cy="10" r="6.2" fill="${c}"/><circle cx="8.2" cy="8.4" r="1" fill="#0a0c0f"/><circle cx="12.2" cy="9.8" r="0.9" fill="#0a0c0f"/>`,
  (c) => `<circle cx="10" cy="10" r="6.3" fill="${c}"/><path stroke="#0a0c0f" stroke-width="1.6" d="M6.4 10h7.2M10 6.4v7.2"/>`,
  (c) => `<circle cx="10" cy="10" r="6.3" fill="${c}"/><path fill="none" stroke="#0a0c0f" stroke-width="1.3" d="M4.4 10h11.2M10 4.4c1.6 1.6 2.4 3.4 2.4 5.6S11.6 14 10 15.6C8.4 14 7.6 12.2 7.6 10S8.4 6 10 4.4Z"/>`,
  (c) => `<rect x="3.8" y="4.6" width="12.4" height="10.8" rx="2" fill="${c}"/><path stroke="#0a0c0f" stroke-width="1.5" d="M6.6 8.4h6.8M6.6 11.6h4.2"/>`,
  (c) => `<path fill="${c}" d="M4.6 14.6 13.4 5.8a2 2 0 0 1 2.8 2.8L7.4 17.4H4.6z"/>`,
  (c) => `<circle cx="7" cy="7.6" r="2.5" fill="${c}"/><circle cx="13.2" cy="12.6" r="2.5" fill="${c}"/><path stroke="${c}" stroke-width="1.5" d="M8.8 9.2 11.4 11.4"/>`,
  (c) => `<path fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" d="M7.6 3.6 10.2 9.2 8.2 9.6 11 16.4"/>`,
  (c) => `<circle cx="10" cy="8.2" r="3.3" fill="${c}"/><path fill="${c}" d="M7.2 11.4 5.2 16.6h2.2l1.2-3.2 1.2 3.2h2.2L9.8 11.4z"/>`,
  (c) => `<path fill="${c}" d="M4.2 5.4h7L13.8 8.4v2H8.4z"/><path stroke="${c}" stroke-width="1.6" d="M8.4 10.4v5.2"/>`,
  (c) => `<path stroke="${c}" stroke-width="1.8" d="M5 5.4h10M10 5.4v9.4M7.2 14.8h5.6"/>`,
  (c) => `<path fill="none" stroke="${c}" stroke-width="1.7" d="M7 6.4 3.8 10 7 13.6M13 6.4 16.2 10 13 13.6M11.2 5.4 8.8 14.6"/>`,
  (c) => `<path fill="none" stroke="${c}" stroke-width="1.7" d="M10 3.6v12.8M6.6 13 10 16.2 13.4 13"/>`,
  (c) => `<rect x="3.6" y="4.6" width="12.8" height="10.8" rx="1.2" fill="${c}"/><path stroke="#0a0c0f" stroke-width="1.15" d="M3.6 8.2h12.8M3.6 11.8h12.8M8.2 4.6v10.8"/>`,
  (c) => `<path fill="none" stroke="${c}" stroke-width="1.8" d="M3.4 10c1.6-3 3.2-3 4.8 0s3.2 3 4.8 0 3.2-3 4.8 0"/>`,
  (c) => `<path fill="${c}" d="M10 3.6 16 7v6l-6 3.4L4 13V7Z"/>`,
  (c) => `<path fill="${c}" d="M3.6 10C5.2 7 7.4 5.6 10 5.6S14.8 7 16.4 10C14.8 13 12.6 14.4 10 14.4S5.2 13 3.6 10Z"/><circle cx="10" cy="10" r="2" fill="#0a0c0f"/>`,
  (c) => `<circle cx="5.4" cy="6.4" r="2" fill="${c}"/><circle cx="14.6" cy="6.4" r="2" fill="${c}"/><circle cx="10" cy="14.2" r="2" fill="${c}"/>`,
  (c) => `<rect x="6.2" y="6.2" width="7.6" height="7.6" rx="1.2" fill="${c}"/><path stroke="${c}" stroke-width="1.4" d="M10 3.6v2.4M10 14v2.4M3.6 10h2.4M14 10h2.4"/>`,
  (c) => `<rect x="3.4" y="4.6" width="13.2" height="10.8" rx="1.4" fill="${c}"/><path stroke="#0a0c0f" stroke-width="1.5" d="M6 8.2 8.2 10 6 11.8M10.2 12.2h3.6"/>`,
  (c) => `<path fill="${c}" d="M10 3.8 16 7 10 10.2 4 7Z"/><path fill="${c}" opacity=".7" d="M4 10 10 13.2 16 10M4 12.8 10 16 16 12.8"/>`,
  (c) => `<rect x="3" y="5.8" width="14" height="8.4" rx="1.4" fill="${c}"/><path stroke="#0a0c0f" stroke-width="1.2" d="M5.4 8.4h9.2M5.4 11.2h6"/>`,
  (c) => `<rect x="5.4" y="9" width="9.2" height="6.8" rx="1.2" fill="${c}"/><path fill="none" stroke="${c}" stroke-width="1.6" d="M7.4 9V7.4a2.6 2.6 0 0 1 5.2 0V9"/>`,
  (c) => `<path fill="${c}" d="M10 3.8c2.6 0 4.6 2 4.6 4.6 0 3.2-4.6 7.8-4.6 7.8S5.4 11.6 5.4 8.4C5.4 5.8 7.4 3.8 10 3.8z"/><circle cx="10" cy="8.2" r="1.5" fill="#0a0c0f"/>`,
  (c) => `<path fill="${c}" d="M10 3.4 16.4 16.2H3.6Z"/>`,
  (c) => `<path fill="none" stroke="${c}" stroke-width="1.7" d="M4 14.4 7.4 8.2 11 12.2 16 5.2"/>`,
  (c) => `<path fill="${c}" d="M4 8.2 10 4.8 16 8.2v7.4H4z"/>`,
  (c) => `<circle cx="8.4" cy="8.4" r="4.4" fill="none" stroke="${c}" stroke-width="1.7"/><path stroke="${c}" stroke-width="1.7" d="m11.8 11.8 4 4"/>`,
]);

const ICON_INDEX = Object.freeze({
  shield: 0,
  ghost: 1,
  guvenlik: 2,
  hunter: 2,
  cookies: 3,
  dnt: 4,
  ua: 5,
  models: 6,
  'canvas-poisoner': 7,
  'siyuan-bridge': 8,
  'human-jitter': 9,
  'dead-man-switch': 10,
  'web3-shield': 5,
  'shadow-dom-pierce': 11,
  'markdown-dom': 12,
  'ui-code-extract': 13,
  'infinite-scroll': 14,
  'table-parser': 15,
  'xhr-hunter': 16,
  'json-form-fill': 6,
  'proxy-rotate': 5,
  'webgl-inspector': 17,
  'media-source': 18,
  'n8n-webhook': 19,
  'lm-studio-port': 20,
  'memory-block': 6,
  'cursor-ide-bridge': 21,
  'tab-orchestrator': 22,
  'headless-mode': 1,
  'input-simulator': 23,
  'rate-limit-guard': 0,
  'sandbox-isolator': 15,
  'excommunicado-lock': 24,
  'webrtc-leak-blocker': 16,
  'canvas-fingerprint-defender': 7,
  'audiocontext-spoofer': 16,
  'battery-api-randomizer': 6,
  'geolocation-shifter': 25,
  'referrer-stripper-pro': 12,
  'etag-cache-cleanser': 6,
  'dom-storage-sandboxing': 15,
  'keystroke-anonymizer': 23,
  'doh-forcer': 0,
  'user-agent-rotator': 8,
  'third-party-cookie-annihilator': 3,
  'link-tracking-parameter-remover': 13,
  'ping-request-blocker': 18,
  'idle-ram-purger': 20,
  'wayback-machine-fast-fetcher': 4,
  'shodan-passive-ip-scanner': 16,
  'exif-metadata-viewer': 18,
  'subdomain-enumeration-helper': 19,
  'hidden-endpoint-discoverer': 29,
  'crypto-address-highlighter': 26,
  'social-media-handle-cross-referencer': 8,
  'bgp-route-visualizer': 27,
  'public-s3-bucket-tester': 28,
  'jwt-decoder-verifier': 21,
  'http-header-analyzer': 12,
  'dark-web-onion-status-checker': 3,
  'reverse-image-search-matrix': 15,
  'phishing-domain-homograph-detector': 26,
  'ssl-tls-certificate-deep-inspector': 24,
  'shadow-dom-piercer': 11,
  'xpath-css-selector-generator': 13,
  'table-to-json-auto-parser': 15,
  'infinite-scroll-autopilot': 14,
  'headless-mode-resource-saver': 1,
  'captcha-resource-exporter': 6,
  'human-jitter-cursor-simulator': 9,
  'rate-limit-auto-pauser': 24,
  'dynamic-proxy-swapper': 5,
  'hidden-form-field-revealer': 18,
  'websocket-traffic-interceptor': 16,
  'xhr-fetch-payload-catcher': 16,
  'dom-mutation-logger': 27,
  'iframe-content-extractor': 6,
  'semantic-html-simplifier': 12,
  'page-to-markdown-converter': 12,
  'generic-llm-api-bridge': 8,
  'context-window-splitter': 22,
  'system-prompt-injector': 13,
  'vision-api-screenshot-sender': 18,
  'vector-db-text-embedder': 19,
  'autonomous-agent-task-queue': 22,
  'llm-cost-token-estimator': 4,
  'scraping-schema-enforcer': 15,
  'multi-agent-swarm-broadcaster': 19,
  'react-vue-state-inspector': 13,
  'graphql-query-visualizer': 19,
  'rest-api-replay-tool': 21,
  'localhost-port-scanner': 29,
  'regex-search-replace': 29,
  'base64-hex-url-decoder': 13,
  'css-grid-flexbox-highlighter': 15,
  'console-error-aggregator': 26,
  'indexeddb-localstorage-editor': 21,
  'media-source-blob-revealer': 18,
  'cron-expression-tester': 4,
  'webassembly-wasm-decompiler': 13,
  'network-throttling-simulator': 16,
  'broken-link-404-crawler': 29,
  'page-load-performance-profiler': 27,
});

function colorFor(id, index) {
  if (id === 'dead-man-switch' || id === 'excommunicado-lock') {
    return '#C62828';
  }
  if (typeof index === 'number') {
    const hue = (index * 37) % 360;
    return `hsl(${hue} 64% 46%)`;
  }
  let n = 0;
  const key = String(id);
  for (let i = 0; i < key.length; i += 1) {
    n = (n * 31 + key.charCodeAt(i)) >>> 0;
  }
  return ICON_COLORS[n % ICON_COLORS.length];
}

function extensionIconSvg(id, index) {
  const color = colorFor(id, index);
  const glyphAt = Object.hasOwn(ICON_INDEX, id) ? ICON_INDEX[id] : (typeof index === 'number' ? index : 0) % GLYPHS.length;
  const glyph = GLYPHS[glyphAt] || GLYPHS[0];
  const ink = '#fff';
  return `<svg viewBox="0 0 20 20" aria-hidden="true">${badge(color, glyph(ink))}</svg>`;
}

if (typeof window !== 'undefined') {
  window.extensionIconSvg = extensionIconSvg;
}
if (typeof module === 'object' && module.exports) {
  module.exports = { extensionIconSvg };
}
