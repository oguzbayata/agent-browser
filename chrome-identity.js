'use strict';

function chromeFullVersion() {
  const raw = String((typeof process !== 'undefined' && process.versions && process.versions.chrome) || '').trim();
  return /^\d+\.\d+\.\d+\.\d+$/.test(raw) ? raw : '138.0.7204.0';
}

function chromeMajorVersion() {
  return chromeFullVersion().split('.')[0];
}

function chromePlatformLabel() {
  const platform = typeof process !== 'undefined' ? process.platform : 'win32';
  if (platform === 'darwin') {
    return 'macOS';
  }
  if (platform === 'linux') {
    return 'Linux';
  }
  return 'Windows';
}

function userAgent() {
  const version = chromeFullVersion();
  const platform = typeof process !== 'undefined' ? process.platform : 'win32';
  if (platform === 'darwin') {
    return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
  }
  if (platform === 'linux') {
    return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
  }
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
}

function pageSource() {
  const major = chromeMajorVersion();
  const full = chromeFullVersion();
  const platform = chromePlatformLabel();
  const ua = userAgent();
  const arch =
    typeof process !== 'undefined' && process.arch === 'arm64' ? 'arm' : 'x86';
  const platformVersion = typeof process !== 'undefined' && process.platform === 'win32' ? '15.0.0' : '14.0.0';
  return `(() => {
    const brands = [
      { brand: 'Not)A;Brand', version: '8' },
      { brand: 'Chromium', version: ${JSON.stringify(major)} },
      { brand: 'Google Chrome', version: ${JSON.stringify(major)} },
    ];
    const highEntropy = {
      architecture: ${JSON.stringify(arch)},
      bitness: '64',
      brands,
      fullVersionList: [
        { brand: 'Not)A;Brand', version: '10.0.0.4' },
        { brand: 'Chromium', version: ${JSON.stringify(full)} },
        { brand: 'Google Chrome', version: ${JSON.stringify(full)} },
      ],
      mobile: false,
      model: '',
      platform: ${JSON.stringify(platform)},
      platformVersion: ${JSON.stringify(platformVersion)},
      uaFullVersion: ${JSON.stringify(full)},
      wow64: false,
      formFactors: ['Desktop'],
    };
    const uaData = {
      brands,
      mobile: false,
      platform: ${JSON.stringify(platform)},
      getHighEntropyValues(hints) {
        const keys = Array.isArray(hints) ? hints : [];
        const next = {};
        for (const key of keys) {
          if (Object.prototype.hasOwnProperty.call(highEntropy, key)) {
            next[key] = highEntropy[key];
          }
        }
        return Promise.resolve(next);
      },
      toJSON() {
        return { brands, mobile: false, platform: ${JSON.stringify(platform)} };
      },
    };
    try {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => ${JSON.stringify(ua)} });
    } catch {
      // Page may lock userAgent.
    }
    try {
      Object.defineProperty(navigator, 'userAgentData', { configurable: true, get: () => uaData });
    } catch {
      // Client hints object may be non-configurable.
    }
    try {
      Object.defineProperty(navigator, 'vendor', { configurable: true, get: () => 'Google Inc.' });
    } catch {
      // Vendor may be locked.
    }
    try {
      Object.defineProperty(navigator, 'appVersion', {
        configurable: true,
        get: () => ${JSON.stringify(ua.replace(/^Mozilla\//, ''))},
      });
    } catch {
      // appVersion may be locked.
    }
    try {
      Object.defineProperty(navigator, 'webdriver', { configurable: true, get: () => undefined });
    } catch {
      // webdriver may be locked.
    }
  })()`;
}

module.exports = {
  chromeFullVersion,
  chromeMajorVersion,
  chromePlatformLabel,
  pageSource,
  userAgent,
};
