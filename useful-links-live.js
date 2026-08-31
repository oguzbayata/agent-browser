'use strict';

function isoDaysAgo(days) {
  const ms = Number(days) > 0 ? Number(days) * 86400000 : 86400000;
  return new Date(Date.now() - ms).toISOString().slice(0, 10);
}

function keywordQuery(raw) {
  const token = String(raw || '')
    .trim()
    .slice(0, 80)
    .replace(/[^\p{L}\p{N}._+\- ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return token;
}

function defaultLiveQueries() {
  const week = isoDaysAgo(7);
  const month = isoDaysAgo(30);
  return [
    { id: 'popular', title: 'Popular', query: 'stars:>5000', sort: 'stars', perPage: 8 },
    { id: 'new', title: 'New', query: `created:>${week} stars:>5`, sort: 'updated', perPage: 8 },
    { id: 'updated', title: 'Recently updated', query: `pushed:>${week} stars:>100`, sort: 'updated', perPage: 8 },
    { id: 'rising', title: 'Rising', query: `created:>${month} stars:>80`, sort: 'stars', perPage: 8 },
  ];
}

function inferQueries() {
  return defaultLiveQueries();
}

function catalogSignature(userSections) {
  const extra = (Array.isArray(userSections) ? userSections : [])
    .map((item) => item?.query || item?.title || '')
    .filter(Boolean)
    .join('|');
  return `live-generic|${extra}`;
}

function intelSignature() {
  return 'live-generic';
}

function selectedModel() {
  return null;
}

function runningAgents() {
  return [];
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
  const query = keywordQuery(raw.query || title);
  return {
    id: String(raw.id || fallbackId || `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`).slice(0, 80),
    title,
    source: raw.source === 'live' || raw.source === 'user' ? raw.source : 'seed',
    query,
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
  if (!out.length) {
    (Array.isArray(seed) ? seed : []).forEach((section) => push({ ...section, source: 'seed' }));
  }
  return out;
}

function boundLine() {
  return 'Live GitHub catalog — popular, new, and recently updated. Type a keyword to add another live column.';
}

if (typeof module === 'object' && module.exports) {
  module.exports = {
    defaultLiveQueries,
    inferQueries,
    keywordQuery,
    catalogSignature,
    intelSignature,
    selectedModel,
    runningAgents,
    normalizeLink,
    normalizeSection,
    mergeCatalog,
    boundLine,
    isoDaysAgo,
  };
}
