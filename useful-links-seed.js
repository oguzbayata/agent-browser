'use strict';

const USEFUL_LINK_SEED = [
  {
    id: 'agents',
    title: 'Local Agents & Automation',
    links: [
      { name: 'n8n-io/n8n', url: 'https://github.com/n8n-io/n8n', note: 'Advanced local workflow & automation' },
      { name: 'browser-use/browser-use', url: 'https://github.com/browser-use/browser-use', note: 'LLM-based web automation' },
      { name: 'microsoft/autogen', url: 'https://github.com/microsoft/autogen', note: 'Multi-agent framework' },
      { name: 'puppeteer/puppeteer', url: 'https://github.com/puppeteer/puppeteer', note: 'Headless Chrome Node.js API' },
      { name: 'Significant-Gravitas/AutoGPT', url: 'https://github.com/Significant-Gravitas/AutoGPT', note: 'Autonomous task runner' },
    ],
  },
  {
    id: 'models',
    title: 'Local AI & language models',
    links: [
      { name: 'ollama/ollama', url: 'https://github.com/ollama/ollama', note: 'Local LLM runtime' },
      { name: 'oobabooga/text-generation-webui', url: 'https://github.com/oobabooga/text-generation-webui', note: 'Interface for local LLMs' },
      { name: 'langchain-ai/langchain', url: 'https://github.com/langchain-ai/langchain', note: 'LLM application framework' },
      { name: 'huggingface/transformers', url: 'https://github.com/huggingface/transformers', note: 'Advanced machine-learning models' },
      { name: 'LM Studio', url: 'https://lmstudio.ai', note: 'Desktop local LLM manager' },
    ],
  },
  {
    id: 'visual',
    title: 'Visual & 3D AI',
    links: [
      { name: 'comfyanonymous/ComfyUI', url: 'https://github.com/comfyanonymous/ComfyUI', note: 'Local node interface that runs on your machine' },
      { name: 'Stability-AI/generative-models', url: 'https://github.com/Stability-AI/generative-models', note: 'Stable Diffusion and generative models' },
      { name: 'mrdoob/three.js', url: 'https://github.com/mrdoob/three.js', note: 'In-browser 3D WebGL library' },
      { name: 'lllyasviel/ControlNet', url: 'https://github.com/lllyasviel/ControlNet', note: 'Control network for diffusion models' },
    ],
  },
  {
    id: 'audio',
    title: 'Music & audio AI',
    links: [
      { name: 'suno-ai/bark', url: 'https://github.com/suno-ai/bark', note: 'Text-to-audio and music model' },
      { name: 'facebookresearch/audiocraft', url: 'https://github.com/facebookresearch/audiocraft', note: 'Audio and music processing framework' },
      { name: 'yt-dlp/yt-dlp', url: 'https://github.com/yt-dlp/yt-dlp', note: 'Universal media and video downloader' },
    ],
  },
  {
    id: 'web',
    title: 'Web development & UI',
    links: [
      { name: 'facebook/react', url: 'https://github.com/facebook/react', note: 'Modern UI library' },
      { name: 'vercel/next.js', url: 'https://github.com/vercel/next.js', note: 'Advanced React framework' },
      { name: 'tailwindlabs/tailwindcss', url: 'https://github.com/tailwindlabs/tailwindcss', note: 'Utility-first CSS Framework' },
      { name: 'getcursor/cursor', url: 'https://github.com/getcursor/cursor', note: 'AI-assisted IDE' },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy & open source',
    links: [
      { name: 'torproject/tor', url: 'https://github.com/torproject/tor', note: 'Anonymous network routing protocol' },
      { name: 'searxng/searxng', url: 'https://github.com/searxng/searxng', note: 'Privacy-focused meta search engine' },
      { name: 'privacytools/privacytools.io', url: 'https://github.com/privacytools/privacytools.io', note: 'Security and privacy guide' },
    ],
  },
];

if (typeof module === 'object' && module.exports) {
  module.exports = USEFUL_LINK_SEED;
}
