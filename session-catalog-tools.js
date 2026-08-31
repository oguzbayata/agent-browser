'use strict';

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_name',
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'si',
  'yclid',
  '_hsenc',
  '_hsmi',
]);

const TOGGLE_IDS = Object.freeze({
  'webrtc-leak-blocker': 'webrtcLeakBlock',
  'audiocontext-spoofer': 'audioContextSpoof',
  'battery-api-randomizer': 'batteryApiRandom',
  'geolocation-shifter': 'geolocationShift',
  'referrer-stripper-pro': 'referrerStrip',
  'etag-cache-cleanser': 'etagCacheClean',
  'dom-storage-sandboxing': 'domStorageSandbox',
  'keystroke-anonymizer': 'keystrokeAnonymize',
  'doh-forcer': 'dohForcer',
  'link-tracking-parameter-remover': 'linkTrackingStrip',
  'ping-request-blocker': 'pingRequestBlock',
  'idle-ram-purger': 'idleRamPurge',
  'wayback-machine-fast-fetcher': 'waybackFetch',
  'shodan-passive-ip-scanner': 'shodanPassive',
  'exif-metadata-viewer': 'exifViewer',
  'subdomain-enumeration-helper': 'subdomainEnum',
  'hidden-endpoint-discoverer': 'hiddenEndpoints',
  'crypto-address-highlighter': 'cryptoHighlight',
  'social-media-handle-cross-referencer': 'socialHandleXref',
  'bgp-route-visualizer': 'bgpVisualize',
  'public-s3-bucket-tester': 's3BucketTest',
  'jwt-decoder-verifier': 'jwtDecoder',
  'http-header-analyzer': 'httpHeaderAnalyze',
  'dark-web-onion-status-checker': 'onionStatus',
  'reverse-image-search-matrix': 'reverseImage',
  'phishing-domain-homograph-detector': 'homographDetect',
  'ssl-tls-certificate-deep-inspector': 'sslInspect',
  'xpath-css-selector-generator': 'xpathGenerator',
  'captcha-resource-exporter': 'captchaExport',
  'hidden-form-field-revealer': 'hiddenFormReveal',
  'websocket-traffic-interceptor': 'websocketIntercept',
  'dom-mutation-logger': 'domMutationLog',
  'iframe-content-extractor': 'iframeExtract',
  'semantic-html-simplifier': 'semanticHtml',
  'page-translate': 'pageTranslate',
  'generic-llm-api-bridge': 'genericLlmBridge',
  'context-window-splitter': 'contextSplitter',
  'system-prompt-injector': 'systemPromptInject',
  'vision-api-screenshot-sender': 'visionScreenshot',
  'vector-db-text-embedder': 'vectorEmbed',
  'llm-cost-token-estimator': 'llmCostEstimate',
  'scraping-schema-enforcer': 'schemaEnforce',
  'react-vue-state-inspector': 'reactVueInspect',
  'graphql-query-visualizer': 'graphqlVisualize',
  'rest-api-replay-tool': 'restReplay',
  'localhost-port-scanner': 'localhostScan',
  'regex-search-replace': 'regexReplace',
  'base64-hex-url-decoder': 'base64Decode',
  'css-grid-flexbox-highlighter': 'cssGridHighlight',
  'console-error-aggregator': 'consoleErrorAgg',
  'indexeddb-localstorage-editor': 'idbEditor',
  'cron-expression-tester': 'cronTester',
  'webassembly-wasm-decompiler': 'wasmDecompile',
  'network-throttling-simulator': 'networkThrottle',
  'broken-link-404-crawler': 'brokenLinkCrawl',
  'page-load-performance-profiler': 'pageLoadProfile',
});

const SETTING_KEYS = Object.freeze(Array.from(new Set(Object.values(TOGGLE_IDS))));

function defaultSettings() {
  const next = {};
  for (const key of SETTING_KEYS) {
    next[key] = false;
  }
  return next;
}

function resetSettings(target) {
  if (!target || typeof target !== 'object') {
    return;
  }
  for (const key of SETTING_KEYS) {
    target[key] = false;
  }
}

function snapshot(settings) {
  const next = {};
  for (const key of SETTING_KEYS) {
    next[key] = Boolean(settings && settings[key]);
  }
  return next;
}

function isCatalogSetting(key) {
  return SETTING_KEYS.includes(key);
}

function stripTrackingUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    let changed = false;
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        parsed.searchParams.delete(key);
        changed = true;
      }
    }
    return changed ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function beforeRequest(details, settings) {
  if (settings?.pingRequestBlock && details?.resourceType === 'ping') {
    return { cancel: true };
  }
  if (settings?.linkTrackingStrip && details?.url) {
    const next = stripTrackingUrl(details.url);
    if (next) {
      return { redirectURL: next };
    }
  }
  return null;
}

function pageFlags(settings) {
  const src = settings && typeof settings === 'object' ? settings : {};
  const flags = {};
  for (const key of SETTING_KEYS) {
    flags[key] = Boolean(src[key]);
  }
  return flags;
}

function agentCatalogPageTools(flags) {
  const on = flags || {};
  const store = (key, value) => {
    window.__agentCatalog = window.__agentCatalog || {};
    window.__agentCatalog[key] = value;
    return value;
  };

  if (on.audioContextSpoof && !window.__agentAudioSpoof) {
    window.__agentAudioSpoof = true;
    const Orig = window.AudioContext || window.webkitAudioContext;
    if (Orig) {
      const Wrapped = function AgentAudio() {
        const ctx = new Orig();
        const original = ctx.createAnalyser.bind(ctx);
        ctx.createAnalyser = function createAnalyser() {
          const node = original();
          const getFloat = node.getFloatFrequencyData.bind(node);
          node.getFloatFrequencyData = function getFloatFrequencyData(array) {
            getFloat(array);
            if (array && array.length) {
              array[0] += 0.0001;
            }
          };
          return node;
        };
        return ctx;
      };
      Wrapped.prototype = Orig.prototype;
      window.AudioContext = Wrapped;
      if (window.webkitAudioContext) {
        window.webkitAudioContext = Wrapped;
      }
    }
  }

  if (on.batteryApiRandom && navigator.getBattery && !window.__agentBatterySpoof) {
    window.__agentBatterySpoof = true;
    navigator.getBattery = function getBattery() {
      return Promise.resolve({
        charging: true,
        chargingTime: 0,
        dischargingTime: Infinity,
        level: 0.64,
        addEventListener() {},
        removeEventListener() {},
      });
    };
  }

  if (on.geolocationShift && navigator.geolocation && !window.__agentGeoShift) {
    window.__agentGeoShift = true;
    const fake = { coords: { latitude: 41.0082, longitude: 28.9784, accuracy: 1400 }, timestamp: Date.now() };
    navigator.geolocation.getCurrentPosition = function getCurrentPosition(ok) {
      if (typeof ok === 'function') {
        ok(fake);
      }
    };
    navigator.geolocation.watchPosition = function watchPosition(ok) {
      if (typeof ok === 'function') {
        ok(fake);
      }
      return 1;
    };
  }

  if (on.webrtcLeakBlock && !window.__agentRtcStub) {
    window.__agentRtcStub = true;
    const Orig = window.RTCPeerConnection;
    if (Orig) {
      window.RTCPeerConnection = function AgentRtc(config) {
        const next = Object.assign({}, config || {}, { iceServers: [] });
        return new Orig(next);
      };
      window.RTCPeerConnection.prototype = Orig.prototype;
    }
  }

  if (on.domStorageSandbox && !window.__agentStorageBox) {
    window.__agentStorageBox = true;
    const prefix = `agent:${location.hostname}:`;
    const wrap = (storage) => ({
      getItem(key) {
        return storage.getItem(prefix + key);
      },
      setItem(key, value) {
        storage.setItem(prefix + key, value);
      },
      removeItem(key) {
        storage.removeItem(prefix + key);
      },
      clear() {
        const drop = [];
        for (let i = 0; i < storage.length; i += 1) {
          const key = storage.key(i);
          if (key && key.startsWith(prefix)) {
            drop.push(key);
          }
        }
        drop.forEach((key) => storage.removeItem(key));
      },
      key(index) {
        return storage.key(index);
      },
      get length() {
        return storage.length;
      },
    });
    try {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: wrap(window.localStorage) });
      Object.defineProperty(window, 'sessionStorage', { configurable: true, value: wrap(window.sessionStorage) });
    } catch {
      // Page may lock storage.
    }
  }

  if (on.keystrokeAnonymize && !window.__agentKeys) {
    window.__agentKeys = true;
    const original = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function agentKeyListen(type, listener, options) {
      if ((type === 'keydown' || type === 'keyup' || type === 'keypress') && typeof listener === 'function') {
        return original.call(this, type, function delayed(event) {
          const wait = 20 + Math.floor(Math.random() * 40);
          setTimeout(() => listener.call(this, event), wait);
        }, options);
      }
      return original.call(this, type, listener, options);
    };
  }

  if (on.hiddenFormReveal) {
    Array.from(document.querySelectorAll('input[type="hidden"]')).slice(0, 40).forEach((el) => {
      el.type = 'text';
      el.style.outline = '1px dashed #3dffc8';
    });
  }

  if (on.cssGridHighlight && !document.getElementById('agent-grid-css')) {
    const style = document.createElement('style');
    style.id = 'agent-grid-css';
    style.textContent = '*{outline-offset:-1px}*:is([style*="display: grid"],[style*="display:flex"],.grid,.flex){outline:1px solid #3dffc8}';
    document.documentElement.appendChild(style);
    Array.from(document.querySelectorAll('*')).slice(0, 400).forEach((el) => {
      const display = getComputedStyle(el).display;
      if (display === 'grid' || display === 'flex') {
        el.style.outline = '1px solid rgba(61,255,200,0.55)';
      }
    });
  }

  if (on.cryptoHighlight) {
    const re = /\b(?:[13][a-km-zA-HJ-NP-Z1-9]{25,34}|0x[a-fA-F0-9]{40}|bc1[a-z0-9]{25,60})\b/g;
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    const hits = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.nodeValue || '';
      if (!re.test(text) || !node.parentElement || node.parentElement.closest('script,style,textarea')) {
        re.lastIndex = 0;
        continue;
      }
      re.lastIndex = 0;
      hits.push(node);
    }
    hits.slice(0, 30).forEach((node) => {
      const wrap = document.createElement('mark');
      wrap.style.background = 'rgba(61,255,200,0.25)';
      wrap.textContent = node.nodeValue;
      node.parentElement.replaceChild(wrap, node);
    });
  }

  if (on.homographDetect) {
    const host = location.hostname || '';
    const mixed = /[A-Za-z]/.test(host) && /[^\u0000-\u007f]/.test(host);
    store('homograph', { host, mixed });
    if (mixed && !document.getElementById('agent-homograph')) {
      const bar = document.createElement('div');
      bar.id = 'agent-homograph';
      bar.textContent = `Homograph risk: ${host} mixes scripts.`;
      bar.style.cssText = 'position:fixed;z-index:2147483646;left:12px;right:12px;top:12px;padding:8px 12px;background:#2a1216;color:#ffb4bc;font:13px sans-serif;border:1px solid #ff5a6a';
      document.documentElement.appendChild(bar);
    }
  }

  if (on.exifViewer) {
    store(
      'exif',
      Array.from(document.images)
        .slice(0, 24)
        .map((img) => ({ src: img.currentSrc || img.src, w: img.naturalWidth, h: img.naturalHeight })),
    );
  }

  if (on.subdomainEnum) {
    const root = location.hostname.replace(/^www\./, '');
    const found = new Set();
    Array.from(document.querySelectorAll('a[href],script[src],link[href],img[src]')).forEach((el) => {
      try {
        const href = el.href || el.src;
        const host = new URL(href, location.href).hostname;
        if (host.endsWith(`.${root}`) || host === root) {
          found.add(host);
        }
      } catch {
        // Ignore bad URLs.
      }
    });
    store('subdomains', Array.from(found).slice(0, 40));
  }

  if (on.hiddenEndpoints) {
    const html = String(document.documentElement.innerHTML || '').slice(0, 400000);
    const found = new Set();
    const re = /["'`](\/[a-zA-Z0-9_\-./]{3,80}|https?:\/\/[^"'` ]+\/api\/[^"'` ]+)["'`]/g;
    let match = re.exec(html);
    while (match) {
      found.add(match[1]);
      if (found.size > 40) {
        break;
      }
      match = re.exec(html);
    }
    store('endpoints', Array.from(found));
  }

  if (on.socialHandleXref) {
    const handles = new Set();
    const re = /@([A-Za-z0-9_]{2,24})/g;
    const text = String(document.body && document.body.innerText ? document.body.innerText : '').slice(0, 20000);
    let match = re.exec(text);
    while (match) {
      handles.add(match[1]);
      if (handles.size > 20) {
        break;
      }
      match = re.exec(text);
    }
    store(
      'handles',
      Array.from(handles).map((name) => ({
        name,
        urls: [
          `https://x.com/${name}`,
          `https://github.com/${name}`,
          `https://www.reddit.com/user/${name}`,
        ],
      })),
    );
  }

  if (on.jwtDecoder) {
    const tokens = [];
    const jwtRe = /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/;
    const scan = (storeName, bag) => {
      try {
        for (let i = 0; i < bag.length; i += 1) {
          const key = bag.key(i);
          const value = String(bag.getItem(key) || '');
          const found = value.match(jwtRe);
          if (!found) {
            continue;
          }
          const parts = found[0].split('.');
          let payload = {};
          try {
            payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          } catch {
            payload = {};
          }
          tokens.push({ store: storeName, key, payload });
        }
      } catch {
        // Ignore blocked storage.
      }
    };
    scan('localStorage', window.localStorage);
    scan('sessionStorage', window.sessionStorage);
    store('jwt', tokens.slice(0, 12));
  }

  if (on.onionStatus) {
    store(
      'onions',
      Array.from(document.querySelectorAll('a[href]'))
        .map((a) => a.href)
        .filter((href) => /\.onion\b/i.test(href))
        .slice(0, 20),
    );
  }

  if (on.s3BucketTest) {
    store(
      's3',
      Array.from(document.querySelectorAll('img[src],source[src],a[href],video[src]'))
        .map((el) => el.src || el.href)
        .filter((href) => /s3[.-].*amazonaws\.com|storage\.googleapis\.com|\.r2\.dev/i.test(String(href || '')))
        .slice(0, 16),
    );
  }

  if (on.xpathGenerator && !window.__agentXpathBound) {
    window.__agentXpathBound = true;
    document.addEventListener(
      'click',
      (event) => {
        const el = event.target;
        if (!(el instanceof Element)) {
          return;
        }
        const parts = [];
        let node = el;
        while (node && node.nodeType === 1 && parts.length < 6) {
          let piece = node.tagName.toLowerCase();
          if (node.id) {
            parts.unshift(`#${node.id}`);
            break;
          }
          if (node.classList.length) {
            piece += `.${Array.from(node.classList).slice(0, 2).join('.')}`;
          }
          parts.unshift(piece);
          node = node.parentElement;
        }
        store('selector', { css: parts.join(' > '), tag: el.tagName });
      },
      true,
    );
  }

  if (on.captchaExport) {
    store(
      'captcha',
      Array.from(document.querySelectorAll('iframe[src*="recaptcha"],iframe[src*="hcaptcha"],img[src*="captcha"]')).map((el) => ({
        tag: el.tagName,
        src: el.src,
      })),
    );
  }

  if (on.websocketIntercept && !window.__agentWsTap) {
    window.__agentWsTap = true;
    window.__agentWsLog = window.__agentWsLog || [];
    const Orig = window.WebSocket;
    if (Orig) {
      window.WebSocket = function AgentWs(url, protocols) {
        const socket = protocols !== undefined ? new Orig(url, protocols) : new Orig(url);
        socket.addEventListener('message', (event) => {
          window.__agentWsLog.push({ url: String(url).slice(0, 200), body: String(event.data || '').slice(0, 1024) });
          if (window.__agentWsLog.length > 40) {
            window.__agentWsLog.shift();
          }
        });
        return socket;
      };
      window.WebSocket.prototype = Orig.prototype;
    }
  }

  if (on.domMutationLog && !window.__agentMut) {
    window.__agentMut = [];
    const obs = new MutationObserver((records) => {
      records.slice(0, 8).forEach((record) => {
        window.__agentMut.push({ type: record.type, added: record.addedNodes.length, t: Date.now() });
      });
      if (window.__agentMut.length > 60) {
        window.__agentMut.splice(0, window.__agentMut.length - 60);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (on.iframeExtract) {
    store(
      'iframes',
      Array.from(document.querySelectorAll('iframe')).slice(0, 12).map((frame) => {
        try {
          const doc = frame.contentDocument;
          return { src: frame.src, text: doc && doc.body ? String(doc.body.innerText || '').slice(0, 2000) : '' };
        } catch {
          return { src: frame.src, text: '' };
        }
      }),
    );
  }

  if (on.semanticHtml) {
    const root = document.querySelector('article,main,[role="main"]') || document.body;
    store('semantic', root ? String(root.innerText || '').slice(0, 12000) : '');
  }

  if (on.contextSplitter || on.vectorEmbed || on.llmCostEstimate) {
    const text = String(document.body && document.body.innerText ? document.body.innerText : '');
    const chunks = [];
    for (let i = 0; i < text.length && chunks.length < 12; i += 1800) {
      chunks.push(text.slice(i, i + 1800));
    }
    store('chunks', chunks);
    store('tokens', Math.ceil(text.length / 4));
  }

  if (on.reactVueInspect) {
    const root = document.querySelector('#root,#app,[data-reactroot],#__nuxt');
    store('framework', {
      react: Boolean(root && (root._reactRootContainer || Object.keys(root).some((key) => key.startsWith('__react')))),
      vue: Boolean(root && (root.__vue_app__ || root.__vue__)),
    });
  }

  if (on.consoleErrorAgg && !window.__agentConsole) {
    window.__agentConsole = [];
    const orig = console.error.bind(console);
    console.error = function agentError(...args) {
      window.__agentConsole.push(String(args[0] || 'error').slice(0, 400));
      if (window.__agentConsole.length > 40) {
        window.__agentConsole.shift();
      }
      return orig(...args);
    };
  }

  if (on.idbEditor) {
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length && keys.length < 30; i += 1) {
        const key = localStorage.key(i);
        keys.push({ key, value: String(localStorage.getItem(key) || '').slice(0, 200) });
      }
    } catch {
      // Ignore.
    }
    store('storage', keys);
  }

  if (on.cronTester) {
    window.__agentCron = function agentCron(expr) {
      const parts = String(expr || '').trim().split(/\s+/);
      return { ok: parts.length === 5 || parts.length === 6, parts };
    };
  }

  if (on.regexReplace) {
    window.__agentRegexReplace = function agentRegexReplace(pattern, replacement) {
      try {
        const re = new RegExp(pattern, 'g');
        const root = document.body;
        if (!root) {
          return { ok: false };
        }
        root.innerHTML = String(root.innerHTML).replace(re, String(replacement || ''));
        return { ok: true };
      } catch {
        return { ok: false };
      }
    };
  }

  if (on.base64Decode) {
    window.__agentDecode = function agentDecode(raw) {
      const text = String(raw || '');
      try {
        return { kind: 'base64', value: atob(text) };
      } catch {
        try {
          return { kind: 'url', value: decodeURIComponent(text) };
        } catch {
          return { kind: 'raw', value: text };
        }
      }
    };
  }

  if (on.wasmDecompile) {
    store(
      'wasm',
      Array.from(document.querySelectorAll('script[src]'))
        .map((el) => el.src)
        .filter((src) => /\.wasm(?:\?|$)/i.test(src))
        .slice(0, 12),
    );
  }

  if (on.pageLoadProfile) {
    const t = performance.timing || {};
    store('perf', {
      nav: Math.max(0, (t.loadEventEnd || 0) - (t.navigationStart || 0)),
      dcl: Math.max(0, (t.domContentLoadedEventEnd || 0) - (t.navigationStart || 0)),
    });
  }

  if (on.brokenLinkCrawl) {
    window.__agentBrokenLinks = function agentBrokenLinks() {
      return Array.from(document.querySelectorAll('a[href]'))
        .slice(0, 40)
        .map((a) => a.href)
        .filter((href) => href.startsWith(location.origin));
    };
  }

  if (on.schemaEnforce) {
    window.__agentEnforceSchema = function agentEnforceSchema(record, schema) {
      if (!record || !schema || typeof schema !== 'object') {
        return { ok: false };
      }
      const missing = Object.keys(schema).filter((key) => !Object.prototype.hasOwnProperty.call(record, key));
      return { ok: missing.length === 0, missing };
    };
  }

  if (on.graphqlVisualize) {
    window.__agentGraphql = function agentGraphql(query) {
      const names = String(query || '').match(/\b(?:query|mutation|subscription)\s+[A-Za-z0-9_]+/g) || [];
      return { operations: names.slice(0, 12) };
    };
  }

  if (on.restReplay) {
    window.__agentLastRest = window.__agentNetLog ? window.__agentNetLog.slice(-1)[0] || null : null;
  }
}

function pageToolSource(settings) {
  return `(${agentCatalogPageTools.toString()})(${JSON.stringify(pageFlags(settings))});`;
}

module.exports = {
  TOGGLE_IDS,
  SETTING_KEYS,
  defaultSettings,
  resetSettings,
  snapshot,
  isCatalogSetting,
  stripTrackingUrl,
  beforeRequest,
  pageFlags,
  pageToolSource,
  agentCatalogPageTools,
};
