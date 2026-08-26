'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROBE_MS = 700;
const WALK_MAX_FILES = 280;
const WALK_MAX_DEPTH = 6;
const FILE_EXTS = new Set(['.gguf', '.ggml', '.bin', '.onnx', '.safetensors', '.pt', '.pth']);
const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'blobs',
  'tmp',
  'temp',
  'cache',
  'logs',
  'log',
  '$recycle.bin',
  'system volume information',
]);

const RUNTIME_PROBES = Object.freeze([
  {
    id: 'ollama',
    name: 'Ollama',
    port: 11434,
    kind: 'ollama',
    modelsPath: '/api/tags',
    chatPath: '/api/chat',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    port: 1234,
    kind: 'openai-compat',
    modelsPath: '/v1/models',
    chatPath: '/v1/chat/completions',
  },
  {
    id: 'jan',
    name: 'Jan',
    port: 1337,
    kind: 'openai-compat',
    modelsPath: '/v1/models',
    chatPath: '/v1/chat/completions',
  },
  {
    id: 'gpt4all',
    name: 'GPT4All',
    port: 4891,
    kind: 'openai-compat',
    modelsPath: '/v1/models',
    chatPath: '/v1/chat/completions',
  },
  {
    id: 'anythingllm',
    name: 'AnythingLLM',
    port: 3001,
    kind: 'openai-compat',
    modelsPath: '/v1/models',
    chatPath: '/v1/chat/completions',
  },
  {
    id: 'openwebui',
    name: 'Open WebUI',
    port: 3000,
    kind: 'openai-compat',
    modelsPath: '/api/models',
    chatPath: '/api/chat/completions',
  },
  {
    id: 'localai',
    name: 'LocalAI',
    port: 8080,
    kind: 'openai-compat',
    modelsPath: '/v1/models',
    chatPath: '/v1/chat/completions',
  },
  {
    id: 'koboldcpp',
    name: 'KoboldCpp',
    port: 5001,
    kind: 'openai-compat',
    modelsPath: '/v1/models',
    chatPath: '/v1/chat/completions',
  },
  {
    id: 'textgen',
    name: 'Text Generation WebUI',
    port: 5000,
    kind: 'openai-compat',
    modelsPath: '/v1/models',
    chatPath: '/v1/chat/completions',
  },
  {
    id: 'llamacpp',
    name: 'llama.cpp sunucusu',
    port: 8081,
    kind: 'openai-compat',
    modelsPath: '/v1/models',
    chatPath: '/v1/chat/completions',
  },
  {
    id: 'vllm',
    name: 'vLLM',
    port: 8000,
    kind: 'openai-compat',
    modelsPath: '/v1/models',
    chatPath: '/v1/chat/completions',
  },
]);

const AGENT_INSTALLS = Object.freeze([
  { id: 'ollama-app', name: 'Ollama', files: () => ollamaInstallHints() },
  { id: 'lmstudio-app', name: 'LM Studio', files: () => lmStudioInstallHints() },
  { id: 'gpt4all-app', name: 'GPT4All', files: () => gpt4AllInstallHints() },
  { id: 'jan-app', name: 'Jan', files: () => janInstallHints() },
  { id: 'continue-app', name: 'Continue', files: () => [userPath('.continue')] },
  { id: 'aider-app', name: 'Aider', files: () => [userPath('.aider')] },
  { id: 'open-interpreter', name: 'Open Interpreter', files: () => [userPath('.openinterpreter')] },
  { id: 'anythingllm-app', name: 'AnythingLLM', files: () => [roamingPath('anythingllm-desktop')] },
  { id: 'n8n-app', name: 'n8n', files: () => [userPath('.n8n')] },
  { id: 'huggingface-hub', name: 'Hugging Face Hub', files: () => [userPath('.cache', 'huggingface', 'hub')] },
]);

function homeDir() {
  return os.homedir() || process.env.USERPROFILE || '';
}

function userPath(...parts) {
  return path.join(homeDir(), ...parts);
}

function roamingPath(...parts) {
  return path.join(process.env.APPDATA || userPath('AppData', 'Roaming'), ...parts);
}

function localPath(...parts) {
  return path.join(process.env.LOCALAPPDATA || userPath('AppData', 'Local'), ...parts);
}

function programFilesPath(...parts) {
  return path.join(process.env.ProgramFiles || 'C:\\Program Files', ...parts);
}

function exists(target) {
  if (!target) {
    return false;
  }
  try {
    fs.accessSync(target);
    return true;
  } catch {
    return false;
  }
}

function statSafe(target) {
  try {
    return fs.statSync(target);
  } catch {
    return null;
  }
}

function ollamaInstallHints() {
  return [
    userPath('.ollama'),
    localPath('Programs', 'Ollama', 'ollama.exe'),
    programFilesPath('Ollama', 'ollama.exe'),
  ];
}

function lmStudioInstallHints() {
  return [
    userPath('.lmstudio'),
    userPath('.cache', 'lm-studio'),
    localPath('LM-Studio'),
    localPath('LM Studio'),
    localPath('Programs', 'LM Studio'),
  ];
}

function gpt4AllInstallHints() {
  return [
    roamingPath('nomic.ai', 'GPT4All'),
    localPath('nomic.ai', 'GPT4All'),
  ];
}

function janInstallHints() {
  return [
    roamingPath('Jan'),
    userPath('jan'),
    userPath('.jan'),
  ];
}

function knownModelRoots(extraDirs) {
  const roots = [
    userPath('.ollama', 'models'),
    userPath('.lmstudio', 'models'),
    userPath('.cache', 'lm-studio', 'models'),
    userPath('models'),
    userPath('Documents', 'models'),
    roamingPath('nomic.ai', 'GPT4All'),
    localPath('nomic.ai', 'GPT4All'),
    roamingPath('Jan', 'models'),
    userPath('.jan', 'models'),
    userPath('jan', 'models'),
  ];
  if (Array.isArray(extraDirs)) {
    for (const dir of extraDirs) {
      if (typeof dir === 'string' && dir.trim()) {
        roots.push(dir);
      }
    }
  }
  return [...new Set(roots.filter((dir) => exists(dir)))];
}

function formatBytes(size) {
  if (!Number.isFinite(size) || size <= 0) {
    return '';
  }
  if (size >= 1024 ** 3) {
    return `${(size / 1024 ** 3).toFixed(1)} GB`;
  }
  if (size >= 1024 ** 2) {
    return `${Math.round(size / 1024 ** 2)} MB`;
  }
  return `${Math.round(size / 1024)} KB`;
}

function modelId(kind, key) {
  return `${kind}:${key}`.slice(0, 480);
}

function displayFromPath(filePath) {
  const base = path.basename(filePath);
  if (base.startsWith('models--')) {
    return base.replace(/^models--/, '').replace(/--/g, '/');
  }
  const parent = path.basename(path.dirname(filePath));
  if (parent.startsWith('models--')) {
    return parent.replace(/^models--/, '').replace(/--/g, '/');
  }
  return base.replace(/\.(gguf|ggml|bin|onnx|safetensors|pt|pth)$/i, '');
}

async function probeJson(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(PROBE_MS),
    });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
}

function parseOllamaModels(body, runtime) {
  const list = Array.isArray(body?.models) ? body.models : [];
  return list
    .map((item) => {
      const name = typeof item?.name === 'string' ? item.name : typeof item?.model === 'string' ? item.model : '';
      if (!name) {
        return null;
      }
      return {
        id: modelId('ollama', name),
        name,
        source: runtime.name,
        runtime: runtime.id,
        kind: 'ollama',
        ready: true,
        live: true,
        port: runtime.port,
        chatUrl: `http://127.0.0.1:${runtime.port}${runtime.chatPath}`,
        sizeLabel: formatBytes(Number(item.size)),
      };
    })
    .filter(Boolean);
}

function parseOpenAiModels(body, runtime) {
  const list = Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : [];
  return list
    .map((item) => {
      const name = typeof item === 'string' ? item : typeof item?.id === 'string' ? item.id : typeof item?.name === 'string' ? item.name : '';
      if (!name) {
        return null;
      }
      return {
        id: modelId('openai', `${runtime.port}:${name}`),
        name,
        source: runtime.name,
        runtime: runtime.id,
        kind: 'openai-compat',
        ready: true,
        live: true,
        port: runtime.port,
        chatUrl: `http://127.0.0.1:${runtime.port}${runtime.chatPath}`,
        sizeLabel: '',
      };
    })
    .filter(Boolean);
}

async function probeRuntime(runtime) {
  const url = `http://127.0.0.1:${runtime.port}${runtime.modelsPath}`;
  const body = await probeJson(url);
  if (!body) {
    return { running: false, models: [] };
  }
  const models = runtime.kind === 'ollama' ? parseOllamaModels(body, runtime) : parseOpenAiModels(body, runtime);
  return { running: true, models };
}

function walkWeights(extraFiles) {
  const found = new Map();
  let visited = 0;

  function considerFile(filePath, force) {
    const ext = path.extname(filePath).toLowerCase();
    if (!force && !FILE_EXTS.has(ext)) {
      return;
    }
    const info = statSafe(filePath);
    if (!info || !info.isFile() || (!force && info.size < 1024 * 1024)) {
      return;
    }
    if (ext === '.safetensors' || ext === '.bin' || ext === '.pt' || ext === '.pth') {
      const dir = path.dirname(filePath);
      const id = modelId('disk', dir);
      if (found.has(id)) {
        const prev = found.get(id);
        prev.size = (prev.size || 0) + info.size;
        prev.sizeLabel = formatBytes(prev.size);
        return;
      }
      found.set(id, {
        id,
        name: displayFromPath(dir),
        source: 'disk',
        runtime: 'file',
        kind: 'file',
        ready: false,
        live: false,
        path: dir,
        size: info.size,
        sizeLabel: formatBytes(info.size),
      });
      return;
    }
    const id = modelId('file', filePath);
    found.set(id, {
      id,
      name: displayFromPath(filePath),
      source: 'disk',
      runtime: 'file',
      kind: 'file',
      ready: false,
      live: false,
      path: filePath,
      size: info.size,
      sizeLabel: formatBytes(info.size),
    });
  }

  function walk(dir, depth) {
    if (depth > WALK_MAX_DEPTH || visited >= WALK_MAX_FILES) {
      return;
    }
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (visited >= WALK_MAX_FILES) {
        return;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name.toLowerCase()) || entry.name.startsWith('.')) {
          if (entry.name !== '.ollama' && entry.name !== '.lmstudio' && entry.name !== '.jan') {
            continue;
          }
        }
        walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      visited += 1;
      considerFile(full);
    }
  }

  const roots = knownModelRoots();
  for (const rootDir of roots) {
    const info = statSafe(rootDir);
    if (info?.isDirectory()) {
      walk(rootDir, 0);
    } else if (info?.isFile()) {
      considerFile(rootDir);
    }
  }

  if (Array.isArray(extraFiles)) {
    for (const filePath of extraFiles) {
      if (typeof filePath === 'string') {
        considerFile(filePath, true);
      }
    }
  }

  return [...found.values()];
}

function scanOllamaManifests() {
  const manifests = userPath('.ollama', 'models', 'manifests');
  if (!exists(manifests)) {
    return [];
  }
  const models = [];
  function walk(dir, depth) {
    if (depth > 8) {
      return;
    }
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const rel = path.relative(manifests, full).split(path.sep);
      const tag = rel.pop();
      const nameParts = rel.filter((part) => part !== 'registry.ollama.ai' && part !== 'library');
      const modelName = tag ? `${nameParts.join('/')}:${tag}` : nameParts.join('/');
      if (!modelName) {
        continue;
      }
      models.push({
        id: modelId('ollama-disk', modelName),
        name: modelName,
        source: 'Ollama',
        runtime: 'ollama',
        kind: 'file',
        ready: false,
        live: false,
        path: full,
        sizeLabel: '',
      });
    }
  }
  walk(manifests, 0);
  return models;
}

function firstExisting(paths) {
  for (const target of paths) {
    if (exists(target)) {
      return target;
    }
  }
  return '';
}

async function probeAgentBridge(listenInfo) {
  if (listenInfo && listenInfo.host === '127.0.0.1' && listenInfo.port) {
    return {
      id: 'agent-bridge',
      name: 'Agent Browser köprüsü',
      status: 'running',
      detail: `127.0.0.1:${listenInfo.port}`,
      path: '',
    };
  }
  const body = await probeJson('http://127.0.0.1:17331/v1/health');
  if (body) {
    return {
      id: 'agent-bridge',
      name: 'Agent Browser köprüsü',
      status: 'running',
      detail: '127.0.0.1:17331',
      path: '',
    };
  }
  return null;
}

async function collectIntel(options = {}) {
  const extraDirs = Array.isArray(options.extraDirs) ? options.extraDirs : [];
  const extraFiles = Array.isArray(options.extraFiles) ? options.extraFiles : [];
  const listenInfo = options.listenInfo || null;

  const runtimeResults = await Promise.all(RUNTIME_PROBES.map((runtime) => probeRuntime(runtime)));
  const liveModels = [];
  const agents = [];
  const seenAgentNames = new Set();

  RUNTIME_PROBES.forEach((runtime, index) => {
    const result = runtimeResults[index];
    if (result.running) {
      liveModels.push(...result.models);
      agents.push({
        id: runtime.id,
        name: runtime.name,
        status: 'running',
        detail: `127.0.0.1:${runtime.port}`,
        path: '',
      });
      seenAgentNames.add(runtime.name);
    }
  });

  const bridge = await probeAgentBridge(listenInfo);
  if (bridge) {
    agents.push(bridge);
    seenAgentNames.add(bridge.name);
  }

  for (const install of AGENT_INSTALLS) {
    const foundPath = firstExisting(install.files());
    if (!foundPath) {
      continue;
    }
    if (seenAgentNames.has(install.name)) {
      const match = agents.find((item) => item.name === install.name);
      if (match && !match.path) {
        match.path = foundPath;
      }
      continue;
    }
    agents.push({
      id: install.id,
      name: install.name,
      status: 'installed',
      detail: 'kurulu · şu an çalışmıyor',
      path: foundPath,
    });
    seenAgentNames.add(install.name);
  }

  const diskModels = walkWeights(extraFiles);
  for (const dir of extraDirs) {
    if (typeof dir === 'string' && exists(dir)) {
      const extraFromDir = walkOneRoot(dir);
      for (const model of extraFromDir) {
        diskModels.push(model);
      }
    }
  }

  const ollamaDisk = scanOllamaManifests();
  const models = dedupeModels([...liveModels, ...ollamaDisk, ...diskModels]);

  return {
    models,
    agents,
    watchDirs: [...knownModelRoots(extraDirs)],
    scannedAt: Date.now(),
  };
}

function walkOneRoot(rootDir) {
  const extra = [];
  const fakeMap = walkWeightsFrom(rootDir);
  extra.push(...fakeMap);
  return extra;
}

function walkWeightsFrom(rootDir) {
  const found = [];
  let visited = 0;
  function walk(dir, depth) {
    if (depth > WALK_MAX_DEPTH || visited >= WALK_MAX_FILES) {
      return;
    }
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name.toLowerCase())) {
          continue;
        }
        walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      visited += 1;
      const ext = path.extname(entry.name).toLowerCase();
      if (!FILE_EXTS.has(ext)) {
        continue;
      }
      const info = statSafe(full);
      if (!info || info.size < 1024 * 1024) {
        continue;
      }
      found.push({
        id: modelId('file', full),
        name: displayFromPath(full),
        source: 'disk',
        runtime: 'file',
        kind: 'file',
        ready: false,
        live: false,
        path: full,
        size: info.size,
        sizeLabel: formatBytes(info.size),
      });
    }
  }
  walk(rootDir, 0);
  return found;
}

function dedupeModels(models) {
  const byName = new Map();
  for (const model of models) {
    const key = `${model.runtime}:${String(model.name).toLowerCase()}`;
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, model);
      continue;
    }
    if (model.live && !prev.live) {
      byName.set(key, { ...model, path: model.path || prev.path });
    }
  }
  return [...byName.values()].sort((a, b) => {
    if (a.live !== b.live) {
      return a.live ? -1 : 1;
    }
    return a.name.localeCompare(b.name, 'tr');
  });
}

function isLoopbackHttpUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 256) {
    return false;
  }
  try {
    const parsed = new URL(raw);
    return (
      parsed.protocol === 'http:' &&
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
      parsed.port !== '' &&
      parsed.pathname.length > 0
    );
  } catch {
    return false;
  }
}

module.exports = {
  collectIntel,
  knownModelRoots,
  isLoopbackHttpUrl,
  RUNTIME_PROBES,
};
