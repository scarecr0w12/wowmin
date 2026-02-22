/// <reference path="./types/window.d.ts" />
import { ts, escapeHtml, showResult, debounce, getMapName, getZoneName, CLASS_COLORS, RACE_ICONS } from './utils/helpers';
import { AppState, createInitialState, PlayerInfo } from './types/state';

// ── Application State ────────────────────────────────────────────────────
const state: AppState = createInitialState();

// ── DOM References ────────────────────────────────────────────────────────
const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;
const $$ = <T extends HTMLElement>(sel: string): NodeListOf<T> => document.querySelectorAll<T>(sel);

// Connection elements
const $host = $<HTMLInputElement>('host');
const $port = $<HTMLInputElement>('port');
const $username = $<HTMLInputElement>('username');
const $password = $<HTMLInputElement>('password');
const $btnConnect = $<HTMLButtonElement>('btn-connect');
const $btnDisconnect = $<HTMLButtonElement>('btn-disconnect');
const $status = $<HTMLElement>('status-indicator');
const $output = $<HTMLElement>('output');
const $form = $<HTMLFormElement>('command-form');
const $cmdInput = $<HTMLInputElement>('command-input');
const $btnSend = $<HTMLButtonElement>('.btn-send');

// Profile elements
const $profileSelect = $<HTMLSelectElement>('profile-select');
const $btnSaveProfile = $<HTMLButtonElement>('btn-save-profile');
const $btnUpdateProfile = $<HTMLButtonElement>('btn-update-profile');
const $btnDeleteProfile = $<HTMLButtonElement>('btn-delete-profile');

// Modal elements
const $modalOverlay = $<HTMLElement>('modal-overlay');
const $modalTitle = $<HTMLElement>('modal-title');
const $modalMessage = $<HTMLElement>('modal-message');
const $modalInput = $<HTMLInputElement>('modal-input');
const $modalOk = $<HTMLButtonElement>('modal-ok');
const $modalCancel = $<HTMLButtonElement>('modal-cancel');

// Dashboard elements
const $dashServerInfo = $<HTMLElement>('dash-server-info');
const $uptimeValue = $<HTMLElement>('uptime-value');
const $playersCount = $<HTMLElement>('players-count');
const $peakCount = $<HTMLElement>('peak-count');
const $dashMotd = $<HTMLElement>('dash-motd');
const $activityLog = $<HTMLElement>('activity-log');
const $btnClearLog = $<HTMLButtonElement>('btn-clear-log');

// Players elements
const $playersTbody = $<HTMLElement>('players-tbody');
const $autoRefreshPlayers = $<HTMLInputElement>('auto-refresh-players');
const $playersSearch = $<HTMLInputElement>('players-search');
const $playersFilterType = $<HTMLSelectElement>('players-filter-type');
const $playersFilterMap = $<HTMLSelectElement>('players-filter-map');
const $playersPerPage = $<HTMLSelectElement>('players-per-page');

// Player action elements
const $paCharname = $<HTMLInputElement>('pa-charname');
const $paAction = $<HTMLSelectElement>('pa-action');
const $paExtra = $<HTMLInputElement>('pa-extra');
const $paExtraLabel = $<HTMLLabelElement>('pa-extra-label');
const $playerActionResult = $<HTMLElement>('player-action-result');

// ── Modal Functions ───────────────────────────────────────────────────────
interface ModalOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  showInput?: boolean;
}

function showModal(options: ModalOptions): Promise<string | boolean | null> {
  const { title, message = '', defaultValue = '', showInput = false } = options;
  
  return new Promise((resolve) => {
    if (!$modalOverlay || !$modalTitle || !$modalMessage || !$modalInput) {
      resolve(null);
      return;
    }
    
    $modalTitle.textContent = title;
    $modalMessage.textContent = message;
    
    if (showInput) {
      $modalInput.classList.remove('hidden');
      $modalInput.value = defaultValue;
    } else {
      $modalInput.classList.add('hidden');
    }
    
    $modalOverlay.classList.remove('hidden');
    if (showInput) $modalInput.focus();

    function cleanup(result: string | boolean | null): void {
      $modalOverlay?.classList.add('hidden');
      $modalOk?.removeEventListener('click', onOk);
      $modalCancel?.removeEventListener('click', onCancel);
      $modalInput?.removeEventListener('keydown', onKey);
      resolve(result);
    }

    function onOk(): void {
      cleanup(showInput ? ($modalInput?.value ?? '') : true);
    }

    function onCancel(): void {
      cleanup(null);
    }

    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Enter') onOk();
      else if (e.key === 'Escape') onCancel();
    }

    $modalOk?.addEventListener('click', onOk);
    $modalCancel?.addEventListener('click', onCancel);
    if (showInput) $modalInput?.addEventListener('keydown', onKey);
  });
}

// ── Helper Functions ───────────────────────────────────────────────────────
function appendOutput(html: string): void {
  if (!$output) return;
  $output.insertAdjacentHTML('beforeend', html);
  $output.scrollTop = $output.scrollHeight;
}

function setConnected(connected: boolean): void {
  state.connected = connected;
  if ($btnConnect) $btnConnect.disabled = connected;
  if ($btnDisconnect) $btnDisconnect.disabled = !connected;
  if ($cmdInput) $cmdInput.disabled = !connected;
  if ($btnSend) $btnSend.disabled = !connected;
  if ($status) {
    $status.textContent = connected ? 'Connected' : 'Disconnected';
    $status.className = `status ${connected ? 'connected' : 'disconnected'}`;
  }
  if (connected && $cmdInput) $cmdInput.focus();
}

async function exec(cmd: string): Promise<{ success: boolean; message: string }> {
  if (!state.connected) return { success: false, message: 'Not connected.' };
  try {
    return await window.electronAPI.soap.command(cmd);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return { success: false, message: errorMessage };
  }
}

function logActivity(cmd: string, msg: string, ok: boolean): void {
  const cls = ok ? 'log-ok' : 'log-err';
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML =
    `<span class="log-ts">[${ts()}]</span>` +
    `<span class="log-cmd">> ${escapeHtml(cmd)}</span> ` +
    `<span class="${cls}">${escapeHtml(msg.substring(0, 200))}</span>`;
  $activityLog?.prepend(entry);
  // Keep max 100 entries
  while ($activityLog && $activityLog.children.length > 100) {
    $activityLog.lastChild?.remove();
  }
}

// ── Tab Switching ──────────────────────────────────────────────────────────
$$<HTMLButtonElement>('#tab-bar .tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$<HTMLButtonElement>('#tab-bar .tab').forEach((t) => t.classList.remove('active'));
    $$<HTMLElement>('.tab-content').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    const tabId = btn.dataset.tab;
    if (tabId) {
      const tabContent = $(`tab-${tabId}`);
      tabContent?.classList.add('active');
    }
  });
});

// ── Connection Handlers ────────────────────────────────────────────────────
$btnConnect?.addEventListener('click', async () => {
  const config = {
    host: $host?.value.trim() || '127.0.0.1',
    port: Number($port?.value.trim() || '7878'),
    username: $username?.value.trim() || '',
    password: $password?.value.trim() || '',
  };

  if (!config.username || !config.password) {
    appendOutput(`<div class="entry"><span class="response error">⚠ Username and password are required.</span></div>`);
    return;
  }

  if ($status) {
    $status.textContent = 'Connecting…';
    $status.className = 'status connecting';
  }
  if ($btnConnect) $btnConnect.disabled = true;

  const result = await window.electronAPI.soap.connect(config);

  if (result.success) {
    setConnected(true);
    appendOutput(
      `<div class="entry"><span class="response success">✔ Connected to ${escapeHtml(config.host)}:${config.port}</span><br/>` +
        `<span class="response">${escapeHtml(result.message)}</span></div>`
    );
    logActivity('server info', result.message, true);
    refreshDashboard();
    startDashboardAutoRefresh();
  } else {
    setConnected(false);
    appendOutput(
      `<div class="entry"><span class="response error">✘ Connection failed: ${escapeHtml(result.message)}</span></div>`
    );
  }
});

$btnDisconnect?.addEventListener('click', async () => {
  await window.electronAPI.soap.disconnect();
  setConnected(false);
  stopDashboardAutoRefresh();
  stopPlayersAutoRefresh();
  appendOutput(`<div class="entry"><span class="response">Disconnected.</span></div>`);
  resetDashboard();
});

// ── Console Tab ────────────────────────────────────────────────────────────
async function sendCommand(cmd: string): Promise<void> {
  if (!state.connected || !cmd) return;

  state.commandHistory.unshift(cmd);
  if (state.commandHistory.length > 200) state.commandHistory.pop();
  state.historyIndex = -1;

  appendOutput(
    `<div class="entry sending">` +
      `<span class="timestamp">[${ts()}]</span>` +
      `<span class="cmd-line">> ${escapeHtml(cmd)}</span><br/>` +
      `<span class="response" style="color:var(--text-muted)">…</span>` +
      `</div>`
  );
  if ($output) $output.scrollTop = $output.scrollHeight;

  const result = await exec(cmd);

  const sending = $output?.querySelector('.sending');
  if (sending) {
    const cls = result.success ? 'success' : 'error';
    sending.classList.remove('sending');
    const responseEl = sending.querySelector('.response');
    if (responseEl) {
      responseEl.className = `response ${cls}`;
      responseEl.textContent = result.message || '(no output)';
    }
    if ($output) $output.scrollTop = $output.scrollHeight;
  }
  logActivity(cmd, result.message || '(no output)', result.success);
}

$form?.addEventListener('submit', (e) => {
  e.preventDefault();
  const cmd = $cmdInput?.value.trim();
  if (!cmd) return;
  if ($cmdInput) $cmdInput.value = '';
  sendCommand(cmd);
});

$$<HTMLButtonElement>('.quick-cmd').forEach((btn) => {
  btn.addEventListener('click', () => {
    const cmd = btn.dataset.cmd;
    if (cmd) sendCommand(cmd);
  });
});

$cmdInput?.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (state.historyIndex < state.commandHistory.length - 1) {
      state.historyIndex++;
      $cmdInput.value = state.commandHistory[state.historyIndex];
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (state.historyIndex > 0) {
      state.historyIndex--;
      $cmdInput.value = state.commandHistory[state.historyIndex];
    } else {
      state.historyIndex = -1;
      $cmdInput.value = '';
    }
  }
});

// Welcome message
appendOutput(
  `<div class="entry">` +
    `<span class="welcome">WoW Admin – AzerothCore SOAP Console</span><br/>` +
    `<span class="welcome">Configure your connection above, then click Connect.</span><br/>` +
    `<span class="welcome">Type commands below or use the quick-command sidebar.</span>` +
    `</div>`
);

// ── Dashboard ──────────────────────────────────────────────────────────────
function resetDashboard(): void {
  if ($dashServerInfo) $dashServerInfo.innerHTML = '<p class="placeholder">Connect to view server information</p>';
  if ($uptimeValue) $uptimeValue.textContent = '--';
  if ($playersCount) $playersCount.textContent = '--';
  if ($peakCount) $peakCount.textContent = '--';
  if ($dashMotd) $dashMotd.innerHTML = '<p class="placeholder">--</p>';
}

async function refreshDashboard(): Promise<void> {
  if (!state.connected) return;

  const info = await exec('server info');
  if (info.success) {
    parseServerInfo(info.message);
  }

  const up = await exec('server uptime');
  if (up.success && $uptimeValue) {
    $uptimeValue.textContent = up.message.replace(/^Server uptime:\s*/i, '').trim() || up.message;
  }

  const motd = await exec('server motd');
  if (motd.success && $dashMotd) {
    $dashMotd.innerHTML = `<p>${escapeHtml(motd.message)}</p>`;
  }
}

function parseServerInfo(msg: string): void {
  const lines = msg.split('\n').map((l) => l.trim()).filter(Boolean);

  const playersMatch = msg.match(/Connected players:\s*(\d+)/i);
  const charsMatch = msg.match(/Characters in world:\s*(\d+)/i);
  const peakMatch = msg.match(/Connection peak:\s*(\d+)/i);

  if (playersMatch && $playersCount) $playersCount.textContent = playersMatch[1];
  if (peakMatch && $peakCount) $peakCount.textContent = peakMatch[1];

  let html = '';
  if (lines[0]) {
    html += `<div class="info-line"><span class="info-label">Version</span><span class="info-value">${escapeHtml(lines[0])}</span></div>`;
  }
  if (playersMatch) {
    html += `<div class="info-line"><span class="info-label">Players Online</span><span class="info-value">${playersMatch[1]}</span></div>`;
  }
  if (charsMatch) {
    html += `<div class="info-line"><span class="info-label">Characters in World</span><span class="info-value">${charsMatch[1]}</span></div>`;
  }
  if (peakMatch) {
    html += `<div class="info-line"><span class="info-label">Connection Peak</span><span class="info-value">${peakMatch[1]}</span></div>`;
  }

  for (let i = 1; i < lines.length; i++) {
    if (
      !lines[i].match(/Connected players/i) &&
      !lines[i].match(/Characters in world/i) &&
      !lines[i].match(/Connection peak/i)
    ) {
      html += `<div class="info-line"><span class="info-value">${escapeHtml(lines[i])}</span></div>`;
    }
  }

  if ($dashServerInfo) {
    $dashServerInfo.innerHTML = html || `<p>${escapeHtml(msg)}</p>`;
  }
}

function startDashboardAutoRefresh(): void {
  stopDashboardAutoRefresh();
  state.dashboardInterval = setInterval(refreshDashboard, 30000);
}

function stopDashboardAutoRefresh(): void {
  if (state.dashboardInterval) {
    clearInterval(state.dashboardInterval);
    state.dashboardInterval = null;
  }
}

// Dashboard refresh button
$('[data-action="refresh-dashboard"]')?.addEventListener('click', refreshDashboard);

// Players refresh button
$('[data-action="refresh-players"]')?.addEventListener('click', refreshPlayers);

// Dashboard quick action buttons
$$<HTMLButtonElement>('.quick-actions .btn-action').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const cmd = btn.dataset.cmd;
    if (!cmd || !state.connected) return;
    const r = await exec(cmd);
    logActivity(cmd, r.message || '(done)', r.success);
  });
});

// Announcement form
$('announce-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msgEl = $<HTMLInputElement>('announce-msg');
  const msg = msgEl?.value.trim();
  if (!msg || !state.connected) return;
  const r = await exec(`announce ${msg}`);
  logActivity(`announce ${msg}`, r.message || 'Announced', r.success);
  if (msgEl) msgEl.value = '';
});

// Set MOTD form
$('set-motd-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msgEl = $<HTMLInputElement>('set-motd-msg');
  const msg = msgEl?.value.trim();
  if (!msg || !state.connected) return;
  const r = await exec(`server set motd ${msg}`);
  logActivity('server set motd', r.message || 'MOTD updated', r.success);
  if (r.success) {
    if (msgEl) msgEl.value = '';
    refreshDashboard();
  }
});

// Clear log
$btnClearLog?.addEventListener('click', () => {
  if ($activityLog) $activityLog.innerHTML = '';
});

// ── Players Tab ────────────────────────────────────────────────────────────
function parseOnlineList(msg: string): PlayerInfo[] {
  const players: PlayerInfo[] = [];
  const lines = msg.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const m = line.match(/^-\[([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\]-$/);
    if (!m) continue;

    const account = m[1];
    const name = m[2];
    const ip = m[3];
    const mapId = parseInt(m[4], 10);
    const zoneId = parseInt(m[5], 10);
    const expansion = parseInt(m[6], 10);
    const gmLevel = parseInt(m[7], 10);
    const isBot = /^RNDBOT/i.test(account);

    players.push({
      account,
      name,
      ip,
      mapId,
      zoneId,
      expansion,
      gmLevel,
      isBot,
      mapName: getMapName(mapId),
      zoneName: getZoneName(zoneId),
      level: '',
      race: '',
      className: '',
      raceId: 0,
      classId: 0,
    });
  }
  return players;
}

function populateMapFilter(players: PlayerInfo[]): void {
  const maps = new Set<number>();
  players.forEach((p) => maps.add(p.mapId));
  const sorted = [...maps].sort((a, b) => a - b);
  const current = $playersFilterMap?.value;
  if ($playersFilterMap) {
    $playersFilterMap.innerHTML = '<option value="">All Maps</option>';
    sorted.forEach((id) => {
      const opt = document.createElement('option');
      opt.value = String(id);
      opt.textContent = getMapName(id);
      if (String(id) === current) opt.selected = true;
      $playersFilterMap?.appendChild(opt);
    });
  }
}

function updatePlayerStats(): void {
  const real = state.allPlayers.filter((p) => !p.isBot);
  const bots = state.allPlayers.filter((p) => p.isBot);
  const accounts = new Set(state.allPlayers.map((p) => p.account));
  const $statTotal = $('stat-total');
  const $statReal = $('stat-real');
  const $statBots = $('stat-bots');
  const $statAccounts = $('stat-accounts');
  if ($statTotal) $statTotal.textContent = String(state.allPlayers.length);
  if ($statReal) $statReal.textContent = String(real.length);
  if ($statBots) $statBots.textContent = String(bots.length);
  if ($statAccounts) $statAccounts.textContent = String(accounts.size);
}

function applyPlayersFilter(): void {
  const search = ($playersSearch?.value || '').toLowerCase();
  const filterType = $playersFilterType?.value || 'all';
  const filterMap = $playersFilterMap?.value || '';

  state.filteredPlayers = state.allPlayers.filter((p) => {
    if (filterType === 'real' && p.isBot) return false;
    if (filterType === 'bots' && !p.isBot) return false;
    if (filterType === 'gm' && p.gmLevel < 1) return false;
    if (filterMap && String(p.mapId) !== filterMap) return false;
    if (search) {
      const hay = [p.name, p.account, p.ip, p.mapName, p.zoneName, p.level, p.race, p.className]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  sortPlayers();
  updatePlayerStats();
  state.playersPage = 1;
  renderPlayersTable();
}

function sortPlayers(): void {
  const col = state.playersSortCol;
  const dir = state.playersSortAsc ? 1 : -1;
  state.filteredPlayers.sort((a, b) => {
    let va: string | number;
    let vb: string | number;
    switch (col) {
      case 'name':
        va = a.name.toLowerCase();
        vb = b.name.toLowerCase();
        break;
      case 'level':
        va = parseInt(a.level) || 0;
        vb = parseInt(b.level) || 0;
        break;
      case 'race':
        va = a.race || '';
        vb = b.race || '';
        break;
      case 'class':
        va = a.className || '';
        vb = b.className || '';
        break;
      case 'map':
        va = a.mapName;
        vb = b.mapName;
        break;
      case 'zone':
        va = a.zoneName;
        vb = b.zoneName;
        break;
      case 'account':
        va = a.account.toLowerCase();
        vb = b.account.toLowerCase();
        break;
      default:
        va = a.name.toLowerCase();
        vb = b.name.toLowerCase();
    }
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

function renderPlayersTable(): void {
  const perPage = parseInt($playersPerPage?.value || '25', 10);
  const total = state.filteredPlayers.length;
  let pageData: PlayerInfo[];

  if (perPage === 0 || perPage >= total) {
    pageData = state.filteredPlayers;
    state.playersPage = 1;
  } else {
    const maxPage = Math.ceil(total / perPage);
    if (state.playersPage > maxPage) state.playersPage = maxPage;
    if (state.playersPage < 1) state.playersPage = 1;
    const start = (state.playersPage - 1) * perPage;
    pageData = state.filteredPlayers.slice(start, start + perPage);
  }

  if (!$playersTbody) return;

  if (pageData.length === 0) {
    $playersTbody.innerHTML = `<tr><td colspan="9" class="placeholder">No matching players</td></tr>`;
  } else {
    let html = '';
    for (const p of pageData) {
      const classColor = CLASS_COLORS[p.classId] || 'var(--text)';
      const raceIcon = RACE_ICONS[p.raceId] || '';
      const gmBadge = p.gmLevel > 0 ? `<span class="gm-badge">GM${p.gmLevel}</span>` : '';
      const botBadge = p.isBot ? `<span class="bot-badge">BOT</span>` : '';

      html += `<tr class="${p.isBot ? 'row-bot' : 'row-real'}" data-charname="${escapeHtml(p.name)}">
        <td>
          <span class="char-name">${escapeHtml(p.name)}</span>
          ${gmBadge}${botBadge}
        </td>
        <td class="td-level">${p.level || '—'}</td>
        <td>${raceIcon} ${escapeHtml(p.race || '—')}</td>
        <td><span style="color:${classColor}">${escapeHtml(p.className || '—')}</span></td>
        <td>${escapeHtml(p.mapName)}</td>
        <td>${escapeHtml(p.zoneName)}</td>
        <td>${escapeHtml(p.account)}</td>
        <td class="td-ip">${escapeHtml(p.ip)}</td>
        <td class="td-actions">
          <button class="tbl-action" data-player-action="detail" data-charname="${escapeHtml(p.name)}" title="Detailed Info">🔍</button>
          <button class="tbl-action" data-player-action="kick" data-charname="${escapeHtml(p.name)}" title="Kick">❌</button>
          <button class="tbl-action" data-player-action="mute" data-charname="${escapeHtml(p.name)}" title="Mute">🔇</button>
          <button class="tbl-action danger" data-player-action="ban account" data-charname="${escapeHtml(p.name)}" title="Ban">🚫</button>
        </td>
      </tr>`;
    }
    $playersTbody.innerHTML = html;
  }

  updatePagination(total, perPage);
}

function updatePagination(total: number, perPage: number): void {
  const pgInfo = $('pg-info');
  const pgTotal = $('pg-total');
  if (perPage === 0 || total === 0) {
    if (pgInfo) pgInfo.textContent = 'Page 1 of 1';
    if (pgTotal) pgTotal.textContent = `${total} results`;
    return;
  }
  const maxPage = Math.ceil(total / perPage);
  if (pgInfo) pgInfo.textContent = `Page ${state.playersPage} of ${maxPage}`;
  if (pgTotal) pgTotal.textContent = `${total} results`;
  
  const $pgFirst = $<HTMLButtonElement>('pg-first');
  const $pgPrev = $<HTMLButtonElement>('pg-prev');
  const $pgNext = $<HTMLButtonElement>('pg-next');
  const $pgLast = $<HTMLButtonElement>('pg-last');
  
  if ($pgFirst) $pgFirst.disabled = state.playersPage <= 1;
  if ($pgPrev) $pgPrev.disabled = state.playersPage <= 1;
  if ($pgNext) $pgNext.disabled = state.playersPage >= maxPage;
  if ($pgLast) $pgLast.disabled = state.playersPage >= maxPage;
}

async function refreshPlayers(): Promise<void> {
  if (!state.connected) return;

  const r = await exec('account onlinelist');
  if (!$playersTbody) return;
  
  if (!r.success) {
    $playersTbody.innerHTML = `<tr><td colspan="9" class="placeholder">${escapeHtml(r.message)}</td></tr>`;
    return;
  }

  state.allPlayers = parseOnlineList(r.message);
  if (state.allPlayers.length === 0) {
    $playersTbody.innerHTML = `<tr><td colspan="9" class="placeholder">No players online</td></tr>`;
    updatePlayerStats();
    return;
  }

  populateMapFilter(state.allPlayers);
  applyPlayersFilter();
}

function startPlayersAutoRefresh(): void {
  stopPlayersAutoRefresh();
  state.playersInterval = setInterval(refreshPlayers, 10000);
}

function stopPlayersAutoRefresh(): void {
  if (state.playersInterval) {
    clearInterval(state.playersInterval);
    state.playersInterval = null;
  }
}

// Pagination handlers
$('pg-first')?.addEventListener('click', () => {
  state.playersPage = 1;
  renderPlayersTable();
});
$('pg-prev')?.addEventListener('click', () => {
  state.playersPage--;
  renderPlayersTable();
});
$('pg-next')?.addEventListener('click', () => {
  state.playersPage++;
  renderPlayersTable();
});
$('pg-last')?.addEventListener('click', () => {
  const perPage = parseInt($playersPerPage?.value || '25', 10);
  state.playersPage = perPage > 0 ? Math.ceil(state.filteredPlayers.length / perPage) : 1;
  renderPlayersTable();
});

// Search & filter handlers
const debouncedFilter = debounce(applyPlayersFilter, 200);
$playersSearch?.addEventListener('input', debouncedFilter);
$playersFilterType?.addEventListener('change', applyPlayersFilter);
$playersFilterMap?.addEventListener('change', applyPlayersFilter);
$playersPerPage?.addEventListener('change', () => {
  state.playersPage = 1;
  renderPlayersTable();
});

// Column sort handlers
$$<HTMLTableCellElement>('#players-table th.sortable').forEach((th) => {
  th.addEventListener('click', () => {
    const col = th.dataset.sort;
    if (!col) return;
    
    if (state.playersSortCol === col) {
      state.playersSortAsc = !state.playersSortAsc;
    } else {
      state.playersSortCol = col;
      state.playersSortAsc = true;
    }
    $$<HTMLTableCellElement>('#players-table th.sortable').forEach((h) =>
      h.classList.remove('sort-asc', 'sort-desc')
    );
    th.classList.add(state.playersSortAsc ? 'sort-asc' : 'sort-desc');
    sortPlayers();
    renderPlayersTable();
  });
});

// Auto-refresh toggle
$autoRefreshPlayers?.addEventListener('change', () => {
  if ($autoRefreshPlayers.checked) {
    startPlayersAutoRefresh();
  } else {
    stopPlayersAutoRefresh();
  }
});

// ── Profile Management ─────────────────────────────────────────────────────
async function loadProfiles(): Promise<void> {
  try {
    state.profiles = await window.electronAPI.config.getProfiles();
    state.activeProfileId = await window.electronAPI.config.getActiveProfileId();
    renderProfiles();
  } catch (e) {
    console.error('Failed to load profiles:', e);
  }
}

function renderProfiles(): void {
  if (!$profileSelect) return;
  
  $profileSelect.innerHTML = '<option value="">-- Select Profile --</option>';
  for (const profile of state.profiles) {
    const opt = document.createElement('option');
    opt.value = profile.id;
    opt.textContent = profile.name;
    if (profile.id === state.activeProfileId) {
      opt.selected = true;
      loadProfileConfig(profile);
    }
    $profileSelect.appendChild(opt);
  }
}

function loadProfileConfig(profile: ConnectionProfile): void {
  if ($host) $host.value = profile.config.host;
  if ($port) $port.value = String(profile.config.port);
  if ($username) $username.value = profile.config.username;
  if ($password) $password.value = profile.config.password;
}

$profileSelect?.addEventListener('change', async () => {
  const id = $profileSelect.value;
  if (!id) return;
  
  const profile = state.profiles.find((p) => p.id === id);
  if (profile) {
    loadProfileConfig(profile);
    await window.electronAPI.config.setActiveProfile(id);
    state.activeProfileId = id;
  }
});

$btnSaveProfile?.addEventListener('click', async () => {
  const name = await showModal({
    title: 'Save Profile',
    message: 'Enter a name for this profile:',
    showInput: true,
  });
  
  if (!name || typeof name !== 'string' || !name.trim()) return;
  
  const profile = await window.electronAPI.config.addProfile({
    name: name.trim(),
    type: 'soap',
    config: {
      host: $host?.value.trim() || '127.0.0.1',
      port: Number($port?.value.trim() || '7878'),
      username: $username?.value.trim() || '',
      password: $password?.value.trim() || '',
    },
  });
  
  state.profiles.push(profile);
  renderProfiles();
});

$btnDeleteProfile?.addEventListener('click', async () => {
  const id = $profileSelect?.value;
  if (!id) return;
  
  const confirmed = await showModal({
    title: 'Delete Profile',
    message: 'Are you sure you want to delete this profile?',
  });
  
  if (!confirmed) return;
  
  await window.electronAPI.config.deleteProfile(id);
  state.profiles = state.profiles.filter((p) => p.id !== id);
  if (state.activeProfileId === id) {
    state.activeProfileId = null;
  }
  renderProfiles();
});

// Load profiles on startup
loadProfiles();

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE TAB FUNCTIONALITY
// ═══════════════════════════════════════════════════════════════════════════

// Database state
interface DatabaseState {
  connected: boolean;
  database: string | null;
  tables: string[];
  currentTable: string | null;
  tableData: Record<string, unknown>[];
  tableSchema: { name: string; type: string }[];
  queryHistory: { sql: string; timestamp: Date }[];
  currentPage: number;
  totalPages: number;
  rowsPerPage: number;
  totalRows: number;
  modifiedRows: Set<number>;
}

const dbState: DatabaseState = {
  connected: false,
  database: null,
  tables: [],
  currentTable: null,
  tableData: [],
  tableSchema: [],
  queryHistory: [],
  currentPage: 1,
  totalPages: 1,
  rowsPerPage: 50,
  totalRows: 0,
  modifiedRows: new Set(),
};

// Database DOM elements
const $dbType = $<HTMLSelectElement>('db-type');
const $dbHost = $<HTMLInputElement>('db-host');
const $dbPort = $<HTMLInputElement>('db-port');
const $dbUser = $<HTMLInputElement>('db-user');
const $dbPassword = $<HTMLInputElement>('db-password');
const $dbName = $<HTMLInputElement>('db-name');
const $dbConnectBtn = $<HTMLButtonElement>('db-connect-btn');
const $dbDisconnectBtn = $<HTMLButtonElement>('db-disconnect-btn');
const $dbStatusText = $<HTMLElement>('db-status-text');
const $dbRefreshTables = $<HTMLButtonElement>('db-refresh-tables');
const $dbTableSearch = $<HTMLInputElement>('db-table-search');
const $dbTableList = $<HTMLElement>('db-table-list');
const $sqlEditor = $<HTMLTextAreaElement>('sql-editor');
const $sqlGutter = $<HTMLElement>('sql-gutter');
const $sqlExecuteBtn = $<HTMLButtonElement>('sql-execute-btn');
const $sqlExecuteSelectedBtn = $<HTMLButtonElement>('sql-execute-selected-btn');
const $sqlClearBtn = $<HTMLButtonElement>('sql-clear-btn');
const $sqlFormatBtn = $<HTMLButtonElement>('sql-format-btn');
const $sqlHistoryBtn = $<HTMLButtonElement>('sql-history-btn');
const $sqlAutocommit = $<HTMLInputElement>('sql-autocommit');
const $sqlResultInfo = $<HTMLElement>('sql-result-info');
const $sqlResults = $<HTMLElement>('sql-results');
const $sqlExportBtn = $<HTMLButtonElement>('sql-export-btn');
const $entityType = $<HTMLSelectElement>('entity-type');
const $entityId = $<HTMLInputElement>('entity-id');
const $entityLoadBtn = $<HTMLButtonElement>('entity-load-btn');
const $entityNewBtn = $<HTMLButtonElement>('entity-new-btn');
const $entitySaveBtn = $<HTMLButtonElement>('entity-save-btn');
const $entityDeleteBtn = $<HTMLButtonElement>('entity-delete-btn');
const $entityEditorContent = $<HTMLElement>('entity-editor-content');
const $tableRefreshBtn = $<HTMLButtonElement>('table-refresh-btn');

// Update database name based on type selection
$dbType?.addEventListener('change', () => {
  const type = $dbType?.value || 'world';
  const dbNames: Record<string, string> = {
    world: 'acore_world',
    auth: 'acore_auth',
    characters: 'acore_characters',
  };
  if ($dbName) {
    $dbName.value = dbNames[type] || 'acore_world';
  }
});

// Database connection
$dbConnectBtn?.addEventListener('click', async () => {
  const config = {
    host: $dbHost?.value.trim() || '127.0.0.1',
    port: Number($dbPort?.value.trim() || '3306'),
    user: $dbUser?.value.trim() || 'acore',
    password: $dbPassword?.value || '',
    database: $dbName?.value.trim() || 'acore_world',
  };
  
  try {
    $dbConnectBtn.disabled = true;
    $dbStatusText!.textContent = 'Connecting...';
    $dbStatusText!.className = 'text-wow-gold';
    
    const result = await window.electronAPI.db.connect(config);
    
    if (result.connected) {
      dbState.connected = true;
      dbState.database = result.database;
      $dbStatusText!.textContent = `Connected to ${result.database}`;
      $dbStatusText!.className = 'text-wow-green db-status-connected';
      $dbConnectBtn.disabled = true;
      $dbDisconnectBtn!.disabled = false;
      $dbRefreshTables!.disabled = false;
      $dbTableSearch!.disabled = false;
      $sqlExecuteBtn!.disabled = false;
      $sqlExecuteSelectedBtn!.disabled = false;
      $sqlFormatBtn!.disabled = false;
      
      // Load tables
      await loadDatabaseTables();
    } else {
      $dbStatusText!.textContent = `Error: ${result.error}`;
      $dbStatusText!.className = 'text-wow-red db-status-error';
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    $dbStatusText!.textContent = `Error: ${errorMsg}`;
    $dbStatusText!.className = 'text-wow-red db-status-error';
  } finally {
    $dbConnectBtn.disabled = false;
  }
});

// Database disconnect
$dbDisconnectBtn?.addEventListener('click', async () => {
  try {
    await window.electronAPI.db.disconnect();
    dbState.connected = false;
    dbState.database = null;
    dbState.tables = [];
    dbState.currentTable = null;
    
    $dbStatusText!.textContent = 'Disconnected';
    $dbStatusText!.className = 'text-wow-red db-status-disconnected';
    $dbConnectBtn.disabled = false;
    $dbDisconnectBtn!.disabled = true;
    $dbRefreshTables!.disabled = true;
    $dbTableSearch!.disabled = true;
    $sqlExecuteBtn!.disabled = true;
    $sqlExecuteSelectedBtn!.disabled = true;
    $sqlFormatBtn!.disabled = true;
    if ($tableRefreshBtn) $tableRefreshBtn.disabled = true;
    
    // Clear table list
    $dbTableList!.innerHTML = '<p class="text-dark-text-muted text-sm p-2">Connect to view tables</p>';
  } catch (err) {
    console.error('Disconnect error:', err);
  }
});

// Load database tables
async function loadDatabaseTables(): Promise<void> {
  if (!dbState.connected) return;
  
  try {
    const tables = await window.electronAPI.db.getTables();
    dbState.tables = tables;
    renderTableList(tables);
  } catch (err) {
    console.error('Error loading tables:', err);
    $dbTableList!.innerHTML = '<p class="text-wow-red text-sm p-2">Error loading tables</p>';
  }
}

// Render table list
function renderTableList(tables: string[]): void {
  if (!tables.length) {
    $dbTableList!.innerHTML = '<p class="text-dark-text-muted text-sm p-2">No tables found</p>';
    return;
  }
  
  const searchTerm = $dbTableSearch?.value.toLowerCase() || '';
  const filtered = tables.filter(t => t.toLowerCase().includes(searchTerm));
  
  $dbTableList!.innerHTML = filtered.map(table => 
    `<div class="db-table-item${dbState.currentTable === table ? ' active' : ''}" data-table="${table}">${escapeHtml(table)}</div>`
  ).join('');
  
  // Add click handlers
  $dbTableList!.querySelectorAll('.db-table-item').forEach(item => {
    item.addEventListener('click', () => {
      const tableName = item.getAttribute('data-table');
      if (tableName) {
        selectTable(tableName);
      }
    });
  });
}

// Select a table
async function selectTable(tableName: string): Promise<void> {
  dbState.currentTable = tableName;
  dbState.currentPage = 1;
  dbState.modifiedRows.clear();
  
  // Update active state in list
  $dbTableList!.querySelectorAll('.db-table-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-table') === tableName);
  });
  
  // Enable refresh button
  if ($tableRefreshBtn) $tableRefreshBtn.disabled = false;
  
  // Load table schema
  try {
    const schema = await window.electronAPI.db.getSchema(tableName);
    dbState.tableSchema = schema.map(field => ({
      name: field.name,
      type: field.type,
    }));
    
    // Load table data
    await loadTableData();
    
    // Switch to table editor tab
    switchDbSubtab('db-table-editor');
  } catch (err) {
    console.error('Error loading table schema:', err);
  }
}

// Load table data
async function loadTableData(): Promise<void> {
  if (!dbState.currentTable || !dbState.connected) return;
  
  const offset = (dbState.currentPage - 1) * dbState.rowsPerPage;
  const countQuery = `SELECT COUNT(*) as count FROM \`${dbState.currentTable}\``;
  const dataQuery = `SELECT * FROM \`${dbState.currentTable}\` LIMIT ${dbState.rowsPerPage} OFFSET ${offset}`;
  
  try {
    const countResult = await window.electronAPI.db.query<{ count: number }>(countQuery);
    dbState.totalRows = countResult.rows?.[0]?.count || 0;
    dbState.totalPages = Math.ceil(dbState.totalRows / dbState.rowsPerPage);
    
    const dataResult = await window.electronAPI.db.query(dataQuery);
    dbState.tableData = dataResult.rows || [];
    
    renderTableEditor();
    updateTablePagination();
  } catch (err) {
    console.error('Error loading table data:', err);
  }
}

// Render table editor
function renderTableEditor(): void {
  const container = document.getElementById('table-editor-content');
  if (!container) return;
  
  if (!dbState.tableData.length) {
    container.innerHTML = '<p class="text-dark-text-muted text-sm p-4">No data in this table</p>';
    return;
  }
  
  const columns = Object.keys(dbState.tableData[0]);
  
  let html = '<table class="db-results-table"><thead><tr>';
  columns.forEach(col => {
    html += `<th>${escapeHtml(col)}</th>`;
  });
  html += '</tr></thead><tbody>';
  
  dbState.tableData.forEach((row, idx) => {
    const isModified = dbState.modifiedRows.has(idx);
    html += `<tr class="${isModified ? 'modified' : ''}">`;
    columns.forEach(col => {
      const value = (row as Record<string, unknown>)[col];
      const displayValue = value === null ? 'NULL' : String(value);
      const cellClass = value === null ? 'null-value' : '';
      html += `<td class="${cellClass}" contenteditable="true" data-row="${idx}" data-col="${col}">${escapeHtml(displayValue)}</td>`;
    });
    html += '</tr>';
  });
  
  html += '</tbody></table>';
  container.innerHTML = html;
  
  // Add cell edit handlers
  container.querySelectorAll('td[contenteditable="true"]').forEach(cell => {
    cell.addEventListener('blur', handleCellEdit);
  });
}

// Handle cell edit
function handleCellEdit(event: Event): void {
  const cell = event.target as HTMLElement;
  const rowIdx = parseInt(cell.getAttribute('data-row') || '0');
  const col = cell.getAttribute('data-col') || '';
  const newValue = cell.textContent?.trim() || '';
  
  // Mark row as modified
  dbState.modifiedRows.add(rowIdx);
  cell.classList.add('modified');
  
  // Update data
  if (dbState.tableData[rowIdx]) {
    (dbState.tableData[rowIdx] as Record<string, unknown>)[col] = newValue === 'NULL' ? null : newValue;
  }
  
  // Enable save button
  const saveBtn = document.getElementById('table-save-btn') as HTMLButtonElement;
  if (saveBtn) saveBtn.disabled = false;
}

// Update table pagination
function updateTablePagination(): void {
  const pageInfo = document.getElementById('table-page-info');
  const pagination = document.getElementById('table-pagination');
  
  if (pagination) {
    pagination.classList.remove('hidden');
  }
  
  if (pageInfo) {
    pageInfo.textContent = `Page ${dbState.currentPage} of ${dbState.totalPages} (${dbState.totalRows} rows)`;
  }
}

// Refresh tables button
$dbRefreshTables?.addEventListener('click', loadDatabaseTables);

// Refresh table data button
$tableRefreshBtn?.addEventListener('click', async () => {
  if (dbState.currentTable && dbState.connected) {
    dbState.modifiedRows.clear();
    await loadTableData();
  }
});

// Table search filter
$dbTableSearch?.addEventListener('input', debounce(() => {
  renderTableList(dbState.tables);
}, 200));

// SQL Editor line numbers
function updateSqlGutter(): void {
  if (!$sqlEditor || !$sqlGutter) return;
  
  const lines = $sqlEditor.value.split('\n').length;
  let html = '';
  for (let i = 1; i <= lines; i++) {
    html += `<div>${i}</div>`;
  }
  $sqlGutter.innerHTML = html;
}

$sqlEditor?.addEventListener('input', updateSqlGutter);
$sqlEditor?.addEventListener('scroll', () => {
  if ($sqlGutter) {
    $sqlGutter.scrollTop = $sqlEditor.scrollTop;
  }
});

// Execute SQL
$sqlExecuteBtn?.addEventListener('click', async () => {
  const sql = $sqlEditor?.value.trim();
  if (!sql || !dbState.connected) return;
  
  await executeSqlQuery(sql);
});

// Execute selected SQL
$sqlExecuteSelectedBtn?.addEventListener('click', async () => {
  const sql = $sqlEditor?.value.substring($sqlEditor.selectionStart, $sqlEditor.selectionEnd).trim();
  if (!sql || !dbState.connected) return;
  
  await executeSqlQuery(sql);
});

// Execute SQL query
async function executeSqlQuery(sql: string): Promise<void> {
  try {
    $sqlResultInfo!.textContent = 'Executing...';
    $sqlResults!.innerHTML = '<p class="text-dark-text-muted text-sm p-4">Loading...</p>';
    
    // Determine if it's a SELECT query
    const isSelect = sql.toUpperCase().startsWith('SELECT') || 
                     sql.toUpperCase().startsWith('SHOW') || 
                     sql.toUpperCase().startsWith('DESCRIBE') ||
                     sql.toUpperCase().startsWith('EXPLAIN');
    
    const startTime = Date.now();
    let result;
    
    if (isSelect) {
      result = await window.electronAPI.db.query(sql);
    } else {
      result = await window.electronAPI.db.execute(sql);
    }
    
    const duration = Date.now() - startTime;
    
    // Add to history
    dbState.queryHistory.unshift({
      sql,
      timestamp: new Date(),
    });
    
    // Keep only last 50 queries
    if (dbState.queryHistory.length > 50) {
      dbState.queryHistory.pop();
    }
    
    // Display results
    if (result.rows && result.rows.length > 0) {
      $sqlResultInfo!.textContent = `${result.rows.length} rows in ${duration}ms`;
      renderQueryResults(result.rows);
      $sqlExportBtn!.disabled = false;
    } else if (result.affectedRows !== undefined) {
      $sqlResultInfo!.textContent = `${result.affectedRows} rows affected in ${duration}ms`;
      $sqlResults!.innerHTML = `<p class="text-wow-green text-sm p-4">Query executed successfully. ${result.affectedRows} rows affected.</p>`;
      $sqlExportBtn!.disabled = true;
    } else {
      $sqlResultInfo!.textContent = `Empty result set (${duration}ms)`;
      $sqlResults!.innerHTML = '<p class="text-dark-text-muted text-sm p-4">No results</p>';
      $sqlExportBtn!.disabled = true;
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    $sqlResultInfo!.textContent = 'Error';
    $sqlResults!.innerHTML = `<p class="text-wow-red text-sm p-4">Error: ${escapeHtml(errorMsg)}</p>`;
    $sqlExportBtn!.disabled = true;
  }
}

// Render query results
function renderQueryResults(rows: Record<string, unknown>[]): void {
  if (!rows.length) {
    $sqlResults!.innerHTML = '<p class="text-dark-text-muted text-sm p-4">No results</p>';
    return;
  }
  
  const columns = Object.keys(rows[0]);
  
  let html = '<table class="db-results-table"><thead><tr>';
  columns.forEach(col => {
    html += `<th>${escapeHtml(col)}</th>`;
  });
  html += '</tr></thead><tbody>';
  
  rows.forEach(row => {
    html += '<tr>';
    columns.forEach(col => {
      const value = row[col];
      const displayValue = value === null ? 'NULL' : String(value);
      const cellClass = value === null ? 'null-value' : '';
      html += `<td class="${cellClass}">${escapeHtml(displayValue)}</td>`;
    });
    html += '</tr>';
  });
  
  html += '</tbody></table>';
  $sqlResults!.innerHTML = html;
}

// Clear SQL editor
$sqlClearBtn?.addEventListener('click', () => {
  if ($sqlEditor) {
    $sqlEditor.value = '';
    updateSqlGutter();
  }
});

// Format SQL (basic formatting)
$sqlFormatBtn?.addEventListener('click', () => {
  if (!$sqlEditor) return;
  
  let sql = $sqlEditor.value;
  
  // Basic SQL formatting
  const keywords = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'ON', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE'];
  
  keywords.forEach(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, 'gi');
    sql = sql.replace(regex, `\n${kw}`);
  });
  
  // Clean up multiple newlines
  sql = sql.replace(/\n\s*\n/g, '\n').trim();
  
  $sqlEditor.value = sql;
  updateSqlGutter();
});

// Export to CSV
$sqlExportBtn?.addEventListener('click', () => {
  // This would need to be implemented with file system access
  // For now, copy to clipboard
  const table = $sqlResults?.querySelector('table');
  if (!table) return;
  
  let csv = '';
  const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent);
  csv += headers.join(',') + '\n';
  
  table.querySelectorAll('tbody tr').forEach(row => {
    const cells = Array.from(row.querySelectorAll('td')).map(td => {
      const text = td.textContent || '';
      // Escape quotes and wrap in quotes if contains comma
      if (text.includes(',') || text.includes('"')) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    });
    csv += cells.join(',') + '\n';
  });
  
  navigator.clipboard.writeText(csv).then(() => {
    $sqlResultInfo!.textContent += ' (CSV copied to clipboard)';
  });
});

// Database subtab switching
function switchDbSubtab(subtabId: string): void {
  // Update subtab buttons
  document.querySelectorAll('.db-subtabs button').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-subtab') === subtabId);
  });
  
  // Update content panels
  document.querySelectorAll('.db-subtab-content').forEach(panel => {
    panel.classList.toggle('hidden', panel.id !== subtabId);
  });
}

// Add click handlers for subtabs
document.querySelectorAll('.db-subtabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    const subtabId = btn.getAttribute('data-subtab');
    if (subtabId) {
      switchDbSubtab(subtabId);
    }
  });
});

// Entity Editor
const ENTITY_TABLES: Record<string, { table: string; primaryKey: string; nameField: string }> = {
  creature: { table: 'creature_template', primaryKey: 'entry', nameField: 'name' },
  item: { table: 'item_template', primaryKey: 'entry', nameField: 'name' },
  quest: { table: 'quest_template', primaryKey: 'ID', nameField: 'LogTitle' },
  spell: { table: 'spell_dbc', primaryKey: 'ID', nameField: 'SpellName' },
  gameobject: { table: 'gameobject_template', primaryKey: 'entry', nameField: 'name' },
  npc: { table: 'npc_vendor', primaryKey: 'entry', nameField: 'item' },
  loot: { table: 'creature_loot_template', primaryKey: 'Entry', nameField: 'Item' },
  smartai: { table: 'smart_scripts', primaryKey: 'entryorguid', nameField: 'action_type' },
};

$entityLoadBtn?.addEventListener('click', async () => {
  const entityType = $entityType?.value;
  const entityId = $entityId?.value;
  
  if (!entityType || !entityId || !dbState.connected) return;
  
  const entityConfig = ENTITY_TABLES[entityType];
  if (!entityConfig) return;
  
  try {
    const query = `SELECT * FROM \`${entityConfig.table}\` WHERE \`${entityConfig.primaryKey}\` = ?`;
    const result = await window.electronAPI.db.query(query, [entityId]);
    
    if (result.rows && result.rows.length > 0) {
      renderEntityEditor(result.rows[0], entityConfig);
      $entitySaveBtn!.disabled = false;
      $entityDeleteBtn!.disabled = false;
    } else {
      $entityEditorContent!.innerHTML = `<p class="text-wow-red text-sm p-4">No ${entityType} found with ID ${entityId}</p>`;
      $entitySaveBtn!.disabled = true;
      $entityDeleteBtn!.disabled = true;
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    $entityEditorContent!.innerHTML = `<p class="text-wow-red text-sm p-4">Error: ${escapeHtml(errorMsg)}</p>`;
  }
});

// Render entity editor
function renderEntityEditor(entity: Record<string, unknown>, config: { table: string; primaryKey: string; nameField: string }): void {
  const fields = Object.keys(entity);
  
  let html = `
    <div class="entity-form-section">
      <h4>Basic Information</h4>
      <div class="entity-form-grid">
  `;
  
  fields.forEach((field, idx) => {
    const value = entity[field];
    const displayValue = value === null ? '' : String(value);
    const isPrimaryKey = field === config.primaryKey;
    const isName = field === config.nameField;
    
    // Put important fields first
    const fieldClass = isPrimaryKey || isName ? '' : '';
    
    html += `
      <div class="entity-field ${fieldClass}">
        <label>${escapeHtml(field)}${isPrimaryKey ? ' (PK)' : ''}</label>
        <input type="text" data-field="${escapeHtml(field)}" value="${escapeHtml(displayValue)}" 
               ${isPrimaryKey ? 'readonly' : ''} placeholder="${value === null ? 'NULL' : ''}" />
      </div>
    `;
    
    // Add section break after first 10 fields
    if (idx === 9) {
      html += `
        </div>
        </div>
        <div class="entity-form-section">
          <h4>Additional Fields</h4>
          <div class="entity-form-grid">
      `;
    }
  });
  
  html += '</div></div>';
  $entityEditorContent!.innerHTML = html;
}

// New entity
$entityNewBtn?.addEventListener('click', async () => {
  const entityType = $entityType?.value;
  if (!entityType || !dbState.connected) return;
  
  const entityConfig = ENTITY_TABLES[entityType];
  if (!entityConfig) return;
  
  // Get schema for the table
  try {
    const schema = await window.electronAPI.db.getSchema(entityConfig.table);
    
    const emptyEntity: Record<string, unknown> = {};
    schema.forEach(field => {
      emptyEntity[field.name] = null;
    });
    
    renderEntityEditor(emptyEntity, entityConfig);
    $entitySaveBtn!.disabled = false;
    $entityDeleteBtn!.disabled = true;
  } catch (err) {
    console.error('Error creating new entity:', err);
  }
});

// Save entity
$entitySaveBtn?.addEventListener('click', async () => {
  const entityType = $entityType?.value;
  const entityId = $entityId?.value;
  
  if (!entityType || !dbState.connected) return;
  
  const entityConfig = ENTITY_TABLES[entityType];
  if (!entityConfig) return;
  
  // Collect field values
  const fields: Record<string, unknown> = {};
  $entityEditorContent?.querySelectorAll('input[data-field]').forEach(input => {
    const field = input.getAttribute('data-field');
    const value = (input as HTMLInputElement).value.trim();
    if (field) {
      fields[field] = value === '' ? null : value;
    }
  });
  
  try {
    // Check if this is an insert or update
    const isUpdate = entityId && entityId !== '0';
    
    if (isUpdate) {
      // Update existing
      const setClauses = Object.keys(fields)
        .filter(f => f !== entityConfig.primaryKey)
        .map(f => `\`${f}\` = ?`)
        .join(', ');
      
      const values = Object.keys(fields)
        .filter(f => f !== entityConfig.primaryKey)
        .map(f => fields[f]);
      values.push(entityId);
      
      const query = `UPDATE \`${entityConfig.table}\` SET ${setClauses} WHERE \`${entityConfig.primaryKey}\` = ?`;
      await window.electronAPI.db.execute(query, values);
      
      $entityEditorContent!.innerHTML = `<p class="text-wow-green text-sm p-4 mb-4">Entity updated successfully!</p>` + $entityEditorContent!.innerHTML;
    } else {
      // Insert new
      const columns = Object.keys(fields).map(f => `\`${f}\``).join(', ');
      const placeholders = Object.keys(fields).map(() => '?').join(', ');
      const values = Object.values(fields);
      
      const query = `INSERT INTO \`${entityConfig.table}\` (${columns}) VALUES (${placeholders})`;
      const result = await window.electronAPI.db.execute(query, values);
      
      // Update entity ID with insert ID
      if (result.insertId) {
        $entityId!.value = String(result.insertId);
      }
      
      $entityEditorContent!.innerHTML = `<p class="text-wow-green text-sm p-4 mb-4">Entity created successfully!</p>` + $entityEditorContent!.innerHTML;
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    $entityEditorContent!.innerHTML = `<p class="text-wow-red text-sm p-4 mb-4">Error: ${escapeHtml(errorMsg)}</p>` + $entityEditorContent!.innerHTML;
  }
});

// Delete entity
$entityDeleteBtn?.addEventListener('click', async () => {
  const entityType = $entityType?.value;
  const entityId = $entityId?.value;
  
  if (!entityType || !entityId || !dbState.connected) return;
  
  const entityConfig = ENTITY_TABLES[entityType];
  if (!entityConfig) return;
  
  const confirmed = await showModal({
    title: 'Delete Entity',
    message: `Are you sure you want to delete this ${entityType}?`,
  });
  
  if (!confirmed) return;
  
  try {
    const query = `DELETE FROM \`${entityConfig.table}\` WHERE \`${entityConfig.primaryKey}\` = ?`;
    await window.electronAPI.db.execute(query, [entityId]);
    
    $entityEditorContent!.innerHTML = `<p class="text-wow-green text-sm p-4">Entity deleted successfully!</p>`;
    $entitySaveBtn!.disabled = true;
    $entityDeleteBtn!.disabled = true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    $entityEditorContent!.innerHTML = `<p class="text-wow-red text-sm p-4">Error: ${escapeHtml(errorMsg)}</p>`;
  }
});

// Table pagination handlers
document.getElementById('table-prev-page')?.addEventListener('click', () => {
  if (dbState.currentPage > 1) {
    dbState.currentPage--;
    loadTableData();
  }
});

document.getElementById('table-next-page')?.addEventListener('click', () => {
  if (dbState.currentPage < dbState.totalPages) {
    dbState.currentPage++;
    loadTableData();
  }
});

// Export for debugging
(window as unknown as Record<string, unknown>).appState = state;
(window as unknown as Record<string, unknown>).dbState = dbState;
