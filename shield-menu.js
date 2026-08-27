'use strict';

const api = window.electronAPI;

function applyStats(stats) {
  if (!stats || typeof stats !== 'object') {
    return;
  }
  const trackers = Number(stats.trackers) || 0;
  const cookies = Number(stats.cookies) || 0;
  const upgrades = Number(stats.upgrades) || 0;
  const trackerEl = document.getElementById('stat-trackers');
  const cookieEl = document.getElementById('stat-cookies');
  const upgradeEl = document.getElementById('stat-upgrades');
  if (trackerEl) {
    trackerEl.textContent = String(trackers);
  }
  if (cookieEl) {
    cookieEl.textContent = String(cookies);
  }
  if (upgradeEl) {
    upgradeEl.textContent = String(upgrades);
  }
  const blocked = document.getElementById('shield-blocked');
  if (blocked) {
    blocked.textContent = `${trackers} izleyici engellendi`;
  }
}

function applySettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return;
  }
  const shield = document.getElementById('toggle-blockTrackers');
  if (shield && typeof settings.blockTrackers === 'boolean') {
    shield.checked = settings.blockTrackers;
  }
  const ghost = document.getElementById('toggle-ghostNetwork');
  if (ghost && typeof settings.ghostNetwork === 'boolean') {
    ghost.checked = settings.ghostNetwork;
  }
  if (settings.securityStats) {
    applyStats(settings.securityStats);
  }
}

function bindShieldMenu() {
  const menu = document.getElementById('agent-shield-menu');
  if (!menu) {
    return;
  }

  menu.addEventListener('change', (event) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || !field.dataset.setting) {
      return;
    }
    api?.setSetting?.(field.dataset.setting, field.checked)?.then((result) => {
      if (result?.settings) {
        applySettings(result.settings);
      }
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      api?.setShieldOpen?.(false);
    }
  });

  api?.onSecurityStats?.((payload) => {
    applyStats(payload);
  });
  api?.onSettings?.((settings) => {
    applySettings(settings);
  });
  api?.getSettings?.()?.then((result) => {
    if (result?.ok && result.settings) {
      applySettings(result.settings);
    }
  });
  api?.getSecurityStats?.()?.then((result) => {
    if (result?.ok) {
      applyStats(result);
    }
  });
}

bindShieldMenu();
