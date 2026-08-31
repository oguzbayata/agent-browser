'use strict';

const MODEL_FAMILIES = [
  { re: /llama|llama3|llama-?3/i, query: 'llama.cpp OR ollama llama', title: 'Llama stack' },
  { re: /qwen/i, query: 'qwen llm', title: 'Qwen models' },
  { re: /mistral|mixtral/i, query: 'mistral llm', title: 'Mistral' },
  { re: /gemma/i, query: 'gemma llm google', title: 'Gemma' },
  { re: /deepseek/i, query: 'deepseek llm', title: 'DeepSeek' },
  { re: /phi-?[34]/i, query: 'microsoft phi llm', title: 'Phi' },
  { re: /whisper/i, query: 'openai whisper', title: 'Speech' },
  { re: /flux|stable.?diff|sdxl|sd3|comfy/i, query: 'comfyui flux stable-diffusion', title: 'Image models' },
];

const RUNTIME_QUERIES = {
  ollama: { query: 'ollama', title: 'Ollama ecosystem' },
  lmstudio: { query: 'lmstudio OR "lm studio"', title: 'LM Studio' },
  jan: { query: 'jan ai llm', title: 'Jan' },
  gpt4all: { query: 'gpt4all', title: 'GPT4All' },
  anythingllm: { query: 'anythingllm', title: 'AnythingLLM' },
  openwebui: { query: 'open-webui', title: 'Open WebUI' },
  localai: { query: 'localai llm', title: 'LocalAI' },
  koboldcpp: { query: 'koboldcpp', title: 'KoboldCpp' },
  textgen: { query: 'text-generation-webui', title: 'Text Generation WebUI' },
  llamacpp: { query: 'ggerganov llama.cpp', title: 'llama.cpp' },
  vllm: { query: 'vllm', title: 'vLLM' },
};

function selectedModel(intel) {
  const models = Array.isArray(intel?.models) ? intel.models : [];
  if (intel?.selectedId) {
    const match = models.find((item) => item && item.id === intel.selectedId);
    if (match) {
      return match;
    }
  }
  return models.find((item) => item && item.live && item.ready) || models[0] || null;
}

function runningAgents(intel) {
  return (Array.isArray(intel?.agents) ? intel.agents : []).filter((item) => item && item.status === 'running');
}

function intelSignature(intel) {
  const model = selectedModel(intel);
  const agents = runningAgents(intel)
    .map((item) => item.id || item.name)
    .sort()
    .join(',');
  return `${model?.id || ''}|${model?.name || ''}|${agents}`;
}

function inferQueries(intel) {
  const queries = [];
  const seen = new Set();
  const push = (id, title, query) => {
    const key = String(query || '').toLowerCase();
    if (!key || seen.has(key) || queries.length >= 4) {
      return;
    }
    seen.add(key);
    queries.push({ id, title, query, perPage: 6 });
  };

  const model = selectedModel(intel);
  if (model?.name) {
    const family = MODEL_FAMILIES.find((item) => item.re.test(model.name));
    if (family) {
      push(`family-${family.title}`, family.title, family.query);
    } else {
      const token = String(model.name).replace(/[^A-Za-z0-9._-]+/g, ' ').trim().split(/\s+/)[0];
      if (token && token.length > 2) {
        push('family-bound', `Bound model: ${model.name}`, `${token} llm`);
      }
    }
  }

  for (const agent of runningAgents(intel)) {
    const runtime = RUNTIME_QUERIES[agent.id] || RUNTIME_QUERIES[String(agent.id || '').replace(/-app$/, '')];
    if (runtime) {
      push(`runtime-${agent.id}`, runtime.title, runtime.query);
    }
  }

  push('fresh-agents', 'Fresh agent repos', 'local llm agent OR "browser agent"');
  return queries;
}

function normalizeLink(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const url = String(raw.url || '').trim();
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return null;
    }
  } catch {
    return null;
  }
  const name = String(raw.name || url).trim().slice(0, 120);
  if (!name || url.length > 400) {
    return null;
  }
  return {
    name,
    url,
    note: String(raw.note || '').trim().slice(0, 180),
  };
}

function normalizeSection(raw, fallbackId) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const title = String(raw.title || '').trim().slice(0, 80);
  if (!title) {
    return null;
  }
  const links = Array.isArray(raw.links) ? raw.links.map(normalizeLink).filter(Boolean).slice(0, 40) : [];
  return {
    id: String(raw.id || fallbackId || `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`).slice(0, 80),
    title,
    source: raw.source === 'live' || raw.source === 'user' ? raw.source : 'seed',
    links,
  };
}

function mergeCatalog(seed, liveSections, userSections) {
  const out = [];
  const seen = new Set();
  const push = (section) => {
    const next = normalizeSection(section, `s${out.length + 1}`);
    if (!next || seen.has(next.id)) {
      return;
    }
    seen.add(next.id);
    out.push(next);
  };
  (Array.isArray(liveSections) ? liveSections : []).forEach(push);
  (Array.isArray(userSections) ? userSections : []).forEach(push);
  (Array.isArray(seed) ? seed : []).forEach((section) => push({ ...section, source: 'seed' }));
  return out;
}

function boundLine(intel) {
  const model = selectedModel(intel);
  const agents = runningAgents(intel).map((item) => item.name);
  if (model && agents.length) {
    return `Bound to ${model.name} via ${agents.join(', ')}`;
  }
  if (model) {
    return `Bound to ${model.name}`;
  }
  if (agents.length) {
    return `Bound to ${agents.join(', ')}`;
  }
  return 'No local model or agent is live. Showing the session seed plus any repos you add.';
}

if (typeof module === 'object' && module.exports) {
  module.exports = {
    MODEL_FAMILIES,
    inferQueries,
    intelSignature,
    selectedModel,
    runningAgents,
    normalizeLink,
    normalizeSection,
    mergeCatalog,
    boundLine,
  };
}
