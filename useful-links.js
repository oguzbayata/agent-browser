'use strict';

const api = window.electronAPI;

function seedSections() {
  const raw = typeof globalThis !== 'undefined' ? globalThis.USEFUL_LINK_SEED : typeof USEFUL_LINK_SEED !== 'undefined' ? USEFUL_LINK_SEED : null;
  const seed = Array.isArray(raw) ? raw : [];
  return seed.map((section) => ({
    id: section.id,
    title: section.title,
    source: 'seed',
    links: Array.isArray(section.links) ? section.links.map((link) => ({ ...link })) : [],
  }));
}

function padIndex(index) {
  return String(index + 1).padStart(2, '0');
}

function renderCatalog(snapshot) {
  const grid = document.getElementById('useful-catalog');
  const bound = document.getElementById('useful-bound');
  const status = document.getElementById('useful-status');
  if (!grid) {
    return;
  }
  const sections = Array.isArray(snapshot?.sections) ? snapshot.sections : seedSections();
  if (bound) {
    bound.textContent = snapshot?.bound || 'Local agents, models, and privacy tools.';
  }
  if (status) {
    status.textContent = snapshot?.status || '';
  }
  grid.replaceChildren();
  sections.forEach((section, index) => {
    const card = document.createElement('article');
    card.className = 'card';
    if (section.source === 'live') {
      card.classList.add('is-live');
    }
    const kicker = document.createElement('p');
    kicker.className = 'card-kicker';
    kicker.textContent = section.source === 'live' ? `LIVE ${padIndex(index)}` : padIndex(index);
    const title = document.createElement('h2');
    title.textContent = section.title;
    const list = document.createElement('ul');
    (section.links || []).forEach((link) => {
      const item = document.createElement('li');
      const anchor = document.createElement('a');
      anchor.href = link.url;
      anchor.textContent = link.name;
      anchor.dataset.url = link.url;
      const note = document.createElement('span');
      note.textContent = link.note || '';
      item.append(anchor, note);
      list.append(item);
    });
    const form = document.createElement('form');
    form.className = 'card-add';
    form.dataset.section = section.id;
    form.innerHTML =
      '<label><span class="sr-only">Name</span><input name="name" type="text" placeholder="owner/repo" required maxlength="120" /></label>' +
      '<label><span class="sr-only">URL</span><input name="url" type="url" placeholder="https://github.com/…" required maxlength="400" /></label>' +
      '<button type="submit">Add link</button>';
    card.append(kicker, title, list, form);
    grid.append(card);
  });
}

function applySnapshot(result) {
  if (result?.ok === false && !result?.sections) {
    const status = document.getElementById('useful-status');
    if (status) {
      status.textContent = result.error || 'Could not refresh useful links.';
    }
    return;
  }
  renderCatalog(result);
}

function bindPage() {
  renderCatalog({
    sections: seedSections(),
    bound: 'Live GitHub catalog — popular, new, and recently updated. Type a keyword to add another live column.',
    status: 'Loading live GitHub columns…',
  });

  document.getElementById('useful-refresh')?.addEventListener('click', () => {
    const button = document.getElementById('useful-refresh');
    if (button) {
      button.disabled = true;
    }
    const request = api?.refreshUsefulLinks?.();
    if (!request) {
      const status = document.getElementById('useful-status');
      if (status) {
        status.textContent = 'Open this page inside Agent Browser to fetch live repos.';
      }
      if (button) {
        button.disabled = false;
      }
      return;
    }
    request
      .then(applySnapshot)
      .catch(() => applySnapshot({ ok: false, error: 'GitHub could not be reached.' }))
      .finally(() => {
        if (button) {
          button.disabled = false;
        }
      });
  });

  document.getElementById('useful-add-section')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = event.currentTarget.querySelector('input[name="title"]');
    const title = String(input?.value || '').trim();
    if (!title) {
      return;
    }
    const status = document.getElementById('useful-status');
    if (status) {
      status.textContent = `Searching GitHub for “${title}”…`;
    }
    const request = api?.addUsefulSection?.(title);
    if (!request) {
      if (status) {
        status.textContent = 'Open this page inside Agent Browser to fetch live repos.';
      }
      return;
    }
    request.then((result) => {
      applySnapshot(result);
      if (result?.ok && input) {
        input.value = '';
      }
    });
  });

  document.getElementById('useful-catalog')?.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[data-url]');
    if (!anchor) {
      return;
    }
    if (!api?.openUsefulLink) {
      return;
    }
    event.preventDefault();
    api.openUsefulLink(anchor.dataset.url);
  });

  document.getElementById('useful-catalog')?.addEventListener('submit', (event) => {
    const form = event.target.closest('form.card-add');
    if (!form) {
      return;
    }
    event.preventDefault();
    const sectionId = form.dataset.section;
    const name = String(form.elements.name?.value || '').trim();
    const url = String(form.elements.url?.value || '').trim();
    if (!sectionId || !name || !url) {
      return;
    }
    const request = api?.addUsefulLink?.(sectionId, name, url, '');
    if (!request) {
      return;
    }
    request.then((result) => {
      applySnapshot(result);
    });
  });

  api?.onUsefulLinks?.((snapshot) => {
    applySnapshot(snapshot);
  });
  api?.getUsefulLinks?.()?.then(applySnapshot);
}

bindPage();
