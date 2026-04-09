/// <reference path="./types/window.d.ts" />
import { ts, escapeHtml, showResult, debounce, getMapName, getZoneName, CLASS_COLORS, RACE_ICONS, RACE_NAMES, CLASS_NAMES } from './utils/helpers';
import { CONTINENT_BOUNDS, worldToCanvas } from './utils/map-coords';
import { AppState, createInitialState, PlayerInfo } from './types/state';
import type { ConnectionProfile, DbConfig, SoapConfig, UpdateCheckResult, EntityMediaPreviewResult, LogMonitorConfig, LogMonitorInspectionResult, LlmConfig, LlmTaskType, LlmChatContext, QueryResult, MapBotWaypoint, CharacterInventoryResult } from '../../src/types/electron';
import { bindInventoryTableTooltips, formatInventoryLocation, ITEM_QUALITY_COLOR } from './inventory/wow-item-tooltip';

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
const $btnSend = document.querySelector<HTMLButtonElement>('.btn-send');
const $updateBanner = $<HTMLElement>('update-banner');
const $appVersion = $<HTMLElement>('app-version');
const $updateStatusText = $<HTMLElement>('update-status-text');
const $btnCheckUpdates = $<HTMLButtonElement>('btn-check-updates');
const $btnOpenUpdate = $<HTMLButtonElement>('btn-open-update');

let latestReleaseUrl: string | null = null;

const DEFAULT_SOAP_PROFILE_CONFIG: SoapConfig = {
  host: '127.0.0.1',
  port: 7878,
  username: '',
  password: '',
};

const DEFAULT_DATABASE_PROFILE_CONFIG: DbConfig = {
  host: '127.0.0.1',
  port: 3306,
  username: 'acore',
  password: '',
  database: 'acore_world',
};

const DEFAULT_MAP_DATABASE_PROFILE_CONFIG: DbConfig = {
  host: '127.0.0.1',
  port: 3306,
  username: 'acore',
  password: '',
  database: 'acore_characters',
};

const DEFAULT_LOG_MONITOR_PROFILE_CONFIG: LogMonitorConfig = {
  host: '127.0.0.1',
  port: 22,
  username: 'root',
  password: '',
  worldserverConfigPath: '/etc/azerothcore/worldserver.conf',
  liveFollow: false,
  refreshIntervalSeconds: 5,
};

// Profile elements
const $profileSelect = $<HTMLSelectElement>('profile-select');
const $btnSaveProfile = $<HTMLButtonElement>('btn-save-profile');
const $btnUpdateProfile = $<HTMLButtonElement>('btn-update-profile');
const $btnDeleteProfile = $<HTMLButtonElement>('btn-delete-profile');

// Log monitor elements
const $logHost = $<HTMLInputElement>('log-host');
const $logPort = $<HTMLInputElement>('log-port');
const $logUsername = $<HTMLInputElement>('log-username');
const $logPassword = $<HTMLInputElement>('log-password');
const $logConfigPath = $<HTMLInputElement>('log-config-path');
const $logFollowEnabled = $<HTMLInputElement>('log-follow-enabled');
const $logRefreshInterval = $<HTMLSelectElement>('log-refresh-interval');
const $logScanBtn = $<HTMLButtonElement>('log-scan-btn');
const $logRefreshPreviewBtn = $<HTMLButtonElement>('log-refresh-preview-btn');
const $logStatus = $<HTMLElement>('log-status');
const $logSummary = $<HTMLElement>('log-summary');
const $logLoggerSelect = $<HTMLSelectElement>('log-logger-select');
const $logFileSelect = $<HTMLSelectElement>('log-file-select');
const $logFileDetails = $<HTMLElement>('log-file-details');
const $logPreviewMeta = $<HTMLElement>('log-preview-meta');
const $logPreviewOutput = $<HTMLElement>('log-preview-output');
const $logAppendersTable = $<HTMLElement>('log-appenders-table');
const $logLoggersTable = $<HTMLElement>('log-loggers-table');

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

let inventoryTooltipCleanup: (() => void) | null = null;

// ── Modal Functions ───────────────────────────────────────────────────────
interface ModalOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  showInput?: boolean;
}

interface LogMonitorViewState {
  inspection: LogMonitorInspectionResult | null;
  selectedLoggerName: string | null;
  selectedFilePath: string | null;
  followTimer: ReturnType<typeof setTimeout> | null;
  previewRequestToken: number;
  previewInFlight: boolean;
}

const logMonitorState: LogMonitorViewState = {
  inspection: null,
  selectedLoggerName: null,
  selectedFilePath: null,
  followTimer: null,
  previewRequestToken: 0,
  previewInFlight: false,
};

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

function renderUpdateStatus(result: UpdateCheckResult): void {
  latestReleaseUrl = result.releaseUrl;

  if ($appVersion) {
    $appVersion.textContent = `v${result.currentVersion}`;
  }

  if ($updateBanner) {
    $updateBanner.dataset.status = result.status;
  }

  if ($updateStatusText) {
    const latestLabel = result.latestVersion ? ` Latest: v${result.latestVersion}.` : '';
    $updateStatusText.textContent = `${result.message}${latestLabel}`;
    $updateStatusText.title = $updateStatusText.textContent;
  }

  if ($btnOpenUpdate) {
    const showOpenButton = Boolean(result.releaseUrl) && (result.updateAvailable || result.status === 'error');
    $btnOpenUpdate.classList.toggle('hidden', !showOpenButton);
  }
}

function inferDatabaseType(databaseName: string): 'world' | 'auth' | 'characters' {
  if (/auth/i.test(databaseName)) return 'auth';
  if (/characters/i.test(databaseName)) return 'characters';
  return 'world';
}

function getCurrentSoapProfileConfig(): SoapConfig {
  return {
    host: $host?.value.trim() || DEFAULT_SOAP_PROFILE_CONFIG.host,
    port: Number($port?.value.trim() || String(DEFAULT_SOAP_PROFILE_CONFIG.port)),
    username: $username?.value.trim() || DEFAULT_SOAP_PROFILE_CONFIG.username,
    password: $password?.value.trim() || DEFAULT_SOAP_PROFILE_CONFIG.password,
  };
}

function getCurrentDatabaseProfileConfig(): DbConfig {
  return {
    host: $dbHost?.value.trim() || DEFAULT_DATABASE_PROFILE_CONFIG.host,
    port: Number($dbPort?.value.trim() || String(DEFAULT_DATABASE_PROFILE_CONFIG.port)),
    username: $dbUser?.value.trim() || DEFAULT_DATABASE_PROFILE_CONFIG.username,
    password: $dbPassword?.value || DEFAULT_DATABASE_PROFILE_CONFIG.password,
    database: $dbName?.value.trim() || DEFAULT_DATABASE_PROFILE_CONFIG.database,
  };
}

function getCurrentMapDatabaseProfileConfig(): DbConfig {
  return {
    host: $<HTMLInputElement>('map-db-host')?.value.trim() || DEFAULT_MAP_DATABASE_PROFILE_CONFIG.host,
    port: Number($<HTMLInputElement>('map-db-port')?.value.trim() || String(DEFAULT_MAP_DATABASE_PROFILE_CONFIG.port)),
    username: $<HTMLInputElement>('map-db-user')?.value.trim() || DEFAULT_MAP_DATABASE_PROFILE_CONFIG.username,
    password: $<HTMLInputElement>('map-db-pass')?.value || DEFAULT_MAP_DATABASE_PROFILE_CONFIG.password,
    database: $<HTMLInputElement>('map-db-name')?.value.trim() || DEFAULT_MAP_DATABASE_PROFILE_CONFIG.database,
  };
}

function getCurrentLogMonitorProfileConfig(): LogMonitorConfig {
  return {
    host: $logHost?.value.trim() || DEFAULT_LOG_MONITOR_PROFILE_CONFIG.host,
    port: Number($logPort?.value.trim() || String(DEFAULT_LOG_MONITOR_PROFILE_CONFIG.port)),
    username: $logUsername?.value.trim() || DEFAULT_LOG_MONITOR_PROFILE_CONFIG.username,
    password: $logPassword?.value || DEFAULT_LOG_MONITOR_PROFILE_CONFIG.password,
    worldserverConfigPath: $logConfigPath?.value.trim() || DEFAULT_LOG_MONITOR_PROFILE_CONFIG.worldserverConfigPath,
    liveFollow: $logFollowEnabled?.checked ?? DEFAULT_LOG_MONITOR_PROFILE_CONFIG.liveFollow,
    refreshIntervalSeconds: Number($logRefreshInterval?.value || String(DEFAULT_LOG_MONITOR_PROFILE_CONFIG.refreshIntervalSeconds)),
  };
}

function applySoapProfileConfig(config: Partial<SoapConfig> | undefined): void {
  const nextConfig = { ...DEFAULT_SOAP_PROFILE_CONFIG, ...config };
  if ($host) $host.value = nextConfig.host;
  if ($port) $port.value = String(nextConfig.port);
  if ($username) $username.value = nextConfig.username;
  if ($password) $password.value = nextConfig.password;
}

function applyDatabaseProfileConfig(config: Partial<DbConfig> | undefined): void {
  const nextConfig = { ...DEFAULT_DATABASE_PROFILE_CONFIG, ...config };
  if ($dbType) $dbType.value = inferDatabaseType(nextConfig.database);
  if ($dbHost) $dbHost.value = nextConfig.host;
  if ($dbPort) $dbPort.value = String(nextConfig.port);
  if ($dbUser) $dbUser.value = nextConfig.username;
  if ($dbPassword) $dbPassword.value = nextConfig.password;
  if ($dbName) $dbName.value = nextConfig.database;
}

function applyMapDatabaseProfileConfig(config: Partial<DbConfig> | undefined): void {
  const nextConfig = { ...DEFAULT_MAP_DATABASE_PROFILE_CONFIG, ...config };
  const $mapDbHost = $<HTMLInputElement>('map-db-host');
  const $mapDbPort = $<HTMLInputElement>('map-db-port');
  const $mapDbUser = $<HTMLInputElement>('map-db-user');
  const $mapDbPass = $<HTMLInputElement>('map-db-pass');
  const $mapDbName = $<HTMLInputElement>('map-db-name');

  if ($mapDbHost) $mapDbHost.value = nextConfig.host;
  if ($mapDbPort) $mapDbPort.value = String(nextConfig.port);
  if ($mapDbUser) $mapDbUser.value = nextConfig.username;
  if ($mapDbPass) $mapDbPass.value = nextConfig.password;
  if ($mapDbName) $mapDbName.value = nextConfig.database;
}

function applyLogMonitorProfileConfig(config: Partial<LogMonitorConfig> | undefined): void {
  const nextConfig = { ...DEFAULT_LOG_MONITOR_PROFILE_CONFIG, ...config };
  if ($logHost) $logHost.value = nextConfig.host;
  if ($logPort) $logPort.value = String(nextConfig.port);
  if ($logUsername) $logUsername.value = nextConfig.username;
  if ($logPassword) $logPassword.value = nextConfig.password;
  if ($logConfigPath) $logConfigPath.value = nextConfig.worldserverConfigPath;
  if ($logFollowEnabled) $logFollowEnabled.checked = nextConfig.liveFollow;
  if ($logRefreshInterval) $logRefreshInterval.value = String(nextConfig.refreshIntervalSeconds);
  updateLogFollowControls();
}

function stopLogFollowLoop(): void {
  if (logMonitorState.followTimer) {
    clearTimeout(logMonitorState.followTimer);
    logMonitorState.followTimer = null;
  }
}

function isLogsTabActive(): boolean {
  return document.querySelector<HTMLButtonElement>('#tab-bar .tab.active')?.dataset.tab === 'logs';
}

function getLogRefreshIntervalMs(): number {
  const seconds = Number($logRefreshInterval?.value || DEFAULT_LOG_MONITOR_PROFILE_CONFIG.refreshIntervalSeconds);
  return Math.max(2, Number.isFinite(seconds) ? seconds : DEFAULT_LOG_MONITOR_PROFILE_CONFIG.refreshIntervalSeconds) * 1000;
}

function isLogFollowEnabled(): boolean {
  return Boolean($logFollowEnabled?.checked);
}

function shouldPollLogFollow(): boolean {
  return isLogFollowEnabled() && isLogsTabActive() && Boolean(logMonitorState.selectedFilePath);
}

function updateLogFollowControls(): void {
  if ($logRefreshInterval) {
    $logRefreshInterval.disabled = !isLogFollowEnabled();
  }
}

function scheduleLogFollowRefresh(delayMs = getLogRefreshIntervalMs()): void {
  stopLogFollowLoop();
  if (!shouldPollLogFollow()) {
    return;
  }

  logMonitorState.followTimer = setTimeout(() => {
    if (!logMonitorState.selectedFilePath) return;
    if (logMonitorState.previewInFlight) {
      scheduleLogFollowRefresh();
      return;
    }
    void loadLogPreview(logMonitorState.selectedFilePath, { silent: true });
  }, delayMs);
}

function syncLogFollowPolling(immediate = false): void {
  updateLogFollowControls();

  if (!shouldPollLogFollow()) {
    stopLogFollowLoop();
    return;
  }

  if (immediate) {
    scheduleLogFollowRefresh(0);
    return;
  }

  scheduleLogFollowRefresh();
}

function resetLogMonitorView(message = 'Scan a server to see readable log files.'): void {
  stopLogFollowLoop();
  logMonitorState.inspection = null;
  logMonitorState.selectedLoggerName = null;
  logMonitorState.selectedFilePath = null;
  renderLogInspection(null);
  if ($logPreviewMeta) $logPreviewMeta.textContent = 'No file selected.';
  if ($logPreviewOutput) $logPreviewOutput.textContent = 'Select a readable file to preview its latest output.';
  if ($logStatus) {
    $logStatus.textContent = message;
    $logStatus.className = 'action-result';
  }
}

async function refreshUpdateStatus(force = false): Promise<void> {
  if ($updateBanner) {
    $updateBanner.dataset.status = 'checking';
  }
  if ($updateStatusText) {
    $updateStatusText.textContent = 'Checking GitHub for updates…';
  }
  if ($btnCheckUpdates) {
    $btnCheckUpdates.disabled = true;
  }

  try {
    if ($appVersion && $appVersion.textContent === 'v--') {
      const currentVersion = await window.electronAPI.app.getVersion();
      $appVersion.textContent = `v${currentVersion}`;
    }

    const result = await window.electronAPI.update.check(force);
    renderUpdateStatus(result);
  } catch (error) {
    if ($updateBanner) {
      $updateBanner.dataset.status = 'error';
    }
    if ($updateStatusText) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      $updateStatusText.textContent = `Unable to check for updates right now: ${errorMessage}`;
      $updateStatusText.title = $updateStatusText.textContent;
    }
  } finally {
    if ($btnCheckUpdates) {
      $btnCheckUpdates.disabled = false;
    }
  }
}

// ── Main tab navigation ─────────────────────────────────────────────────────
const MAIN_TAB_ORDER = ['dashboard', 'players', 'accounts', 'tickets', 'database', 'map', 'logs', 'console'] as const;
type MainTabId = (typeof MAIN_TAB_ORDER)[number];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

function getMainTabBarButtons(): HTMLButtonElement[] {
  const bar = document.getElementById('tab-bar');
  if (!bar) return [];
  return Array.from(bar.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
}

function getActiveMainTabId(): MainTabId {
  const id = document.querySelector<HTMLButtonElement>('#tab-bar .tab.active')?.dataset.tab;
  if (id && (MAIN_TAB_ORDER as readonly string[]).includes(id)) return id as MainTabId;
  return 'dashboard';
}

function onMainTabActivated(tabId: MainTabId): void {
  if (tabId === 'map') {
    Object.keys(CONTINENT_BOUNDS).forEach((cid) => preloadMapImage(Number(cid)));
    requestAnimationFrame(() => renderMapCanvas());
  }
}

function activateMainTab(tabId: string, options?: { focusTab?: boolean }): void {
  if (!(MAIN_TAB_ORDER as readonly string[]).includes(tabId)) return;
  const typed = tabId as MainTabId;
  const buttons = getMainTabBarButtons();
  const panels = $$<HTMLElement>('.tab-content');

  buttons.forEach((btn) => {
    const id = btn.dataset.tab;
    const selected = id === typed;
    btn.classList.toggle('active', selected);
    btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    btn.tabIndex = selected ? 0 : -1;
  });

  panels.forEach((panel) => {
    const pid = panel.id.startsWith('tab-') ? panel.id.slice(4) : '';
    const selected = pid === typed;
    panel.classList.toggle('active', selected);
    panel.setAttribute('aria-hidden', selected ? 'false' : 'true');
  });

  if (options?.focusTab) {
    document.querySelector<HTMLButtonElement>(`#tab-bar [data-tab="${typed}"]`)?.focus();
  }

  onMainTabActivated(typed);
  syncLogFollowPolling();
}

// ── Tab Switching ──────────────────────────────────────────────────────────
getMainTabBarButtons().forEach((btn) => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.tab;
    if (id) activateMainTab(id);
  });
});

document.getElementById('tab-bar')?.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
  const idx = MAIN_TAB_ORDER.indexOf(getActiveMainTabId());
  let next = idx < 0 ? 0 : idx;
  if (e.key === 'ArrowRight') next = (next + 1) % MAIN_TAB_ORDER.length;
  else if (e.key === 'ArrowLeft') next = (next - 1 + MAIN_TAB_ORDER.length) % MAIN_TAB_ORDER.length;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = MAIN_TAB_ORDER.length - 1;
  e.preventDefault();
  activateMainTab(MAIN_TAB_ORDER[next], { focusTab: true });
});

document.addEventListener('keydown', (e) => {
  if (!e.altKey || e.repeat || e.ctrlKey || e.metaKey) return;
  if (isTypingTarget(e.target)) return;
  const match = /^Digit(\d)$/.exec(e.code);
  if (!match) return;
  const digit = Number(match[1]);
  if (digit < 1 || digit > MAIN_TAB_ORDER.length) return;
  e.preventDefault();
  activateMainTab(MAIN_TAB_ORDER[digit - 1], { focusTab: true });
});

window.electronAPI.app.onNavigateTab((tabId) => {
  activateMainTab(tabId, { focusTab: true });
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

$btnCheckUpdates?.addEventListener('click', () => {
  void refreshUpdateStatus(true);
});

$btnOpenUpdate?.addEventListener('click', async () => {
  const result = await window.electronAPI.update.openReleasePage(latestReleaseUrl ?? undefined);
  if (!result.success && $updateStatusText) {
    $updateStatusText.textContent = result.message;
    $updateStatusText.title = result.message;
    $updateBanner?.setAttribute('data-status', 'error');
  }
});

void refreshUpdateStatus();

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
document.querySelector<HTMLElement>('[data-action="refresh-dashboard"]')?.addEventListener('click', refreshDashboard);

// Players refresh button
document.querySelector<HTMLElement>('[data-action="refresh-players"]')?.addEventListener('click', refreshPlayers);

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
          <button class="tbl-action" data-player-action="inventory" data-charname="${escapeHtml(p.name)}" title="Inventory (DB)">🎒</button>
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
  if (!state.connected) {
    if ($playersTbody) {
      $playersTbody.innerHTML = `<tr><td colspan="9" class="placeholder">Not connected to server</td></tr>`;
    }
    return;
  }

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

  // Batch-fetch pinfo for all online players to populate level, race, and class
  await Promise.all(
    state.allPlayers.map(async (player) => {
      const pr = await exec(`pinfo ${player.name}`);
      if (pr.success) enrichPlayerFromPinfo(player.name, pr.message);
    })
  );
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

// ── Player Detail Panel (pinfo) ────────────────────────────────────────────
function formatPinfo(msg: string): string {
  const lines = msg
    .split(/[\r\n]+/)
    .map((l) => l.replace(/^[\u00a6\u251c\u2500|]+\s*/, '').trim())
    .filter(Boolean);
  let html = '<div class="pinfo-grid">';
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx > 0 && idx < 30) {
      const label = line.substring(0, idx).trim();
      const value = line.substring(idx + 1).trim();
      html += `<div class="pinfo-label">${escapeHtml(label)}</div><div class="pinfo-value">${escapeHtml(value)}</div>`;
    } else {
      html += `<div class="pinfo-full">${escapeHtml(line)}</div>`;
    }
  }
  html += '</div>';
  return html;
}

function enrichPlayerFromPinfo(charname: string, msg: string): void {
  const levelMatch = msg.match(/(?<!\w)Level:\s*(\d+)/i);
  const raceClassMatch = msg.match(/Race:\s*((?:Female|Male)\s+)?(.+?),\s+(\S+)/i);
  if (!levelMatch && !raceClassMatch) return;

  const player = state.allPlayers.find((p) => p.name === charname);
  if (!player) return;

  if (levelMatch) player.level = levelMatch[1];
  if (raceClassMatch) {
    player.race = raceClassMatch[2].trim();
    player.className = raceClassMatch[3].trim();
    for (const [id, name] of Object.entries(RACE_NAMES)) {
      if (player.race.toLowerCase().includes(name.toLowerCase())) {
        player.raceId = parseInt(id);
        break;
      }
    }
    for (const [id, name] of Object.entries(CLASS_NAMES)) {
      if (player.className.toLowerCase() === name.toLowerCase()) {
        player.classId = parseInt(id);
        break;
      }
    }
  }
  renderPlayersTable();
}

async function showPlayerDetail(charname: string): Promise<void> {
  const panel = $<HTMLElement>('player-detail-panel');
  const body = $<HTMLElement>('detail-body');
  const title = $<HTMLElement>('detail-charname');
  if (!panel || !body || !title) return;

  panel.classList.remove('hidden');
  title.textContent = charname;
  body.innerHTML = '<p class="placeholder">Loading player info…</p>';

  const r = await exec(`pinfo ${charname}`);
  if (!r.success) {
    body.innerHTML = `<p class="action-result visible err">${escapeHtml(r.message)}</p>`;
    return;
  }

  body.innerHTML = formatPinfo(r.message);
  enrichPlayerFromPinfo(charname, r.message);
}

function renderInventoryTable(result: CharacterInventoryResult): void {
  inventoryTooltipCleanup?.();
  inventoryTooltipCleanup = null;
  const tbody = $<HTMLElement>('inventory-tbody');
  const tip = $<HTMLElement>('wow-tooltip');
  if (!tbody || !tip) return;

  if (result.items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="placeholder">No items in character_inventory for this character.</td></tr>`;
    return;
  }

  tbody.innerHTML = result.items
    .map((it, i) => {
      const loc = formatInventoryLocation(it, result.bagLabels);
      const q = Math.min(7, Math.max(0, it.Quality));
      const color = ITEM_QUALITY_COLOR[q] ?? ITEM_QUALITY_COLOR[1];
      const nameHtml =
        it.count > 1 ? `${escapeHtml(it.name)} <span class="inv-stack">×${it.count}</span>` : escapeHtml(it.name);
      return `<tr class="inv-item-row" data-inv-idx="${i}">
        <td class="inv-loc" title="${escapeHtml(loc)}">${escapeHtml(loc)}</td>
        <td class="inv-name" style="color:${color}">${nameHtml}</td>
        <td class="inv-entry mono">${it.itemEntry}</td>
      </tr>`;
    })
    .join('');

  inventoryTooltipCleanup = bindInventoryTableTooltips(tbody, tip, result.items);
}

async function openPlayerInventory(charName: string): Promise<void> {
  const panel = $<HTMLElement>('player-inventory-panel');
  const title = $<HTMLElement>('inventory-charname');
  const tbody = $<HTMLElement>('inventory-tbody');
  if (!panel || !title || !tbody) return;

  panel.classList.remove('hidden');
  title.textContent = `Inventory — ${charName}`;
  tbody.innerHTML = `<tr><td colspan="3" class="placeholder">Loading inventory…</td></tr>`;
  panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

  try {
    const r = await window.electronAPI.inventory.getCharacterInventory(charName);
    if (!r.success) {
      inventoryTooltipCleanup?.();
      inventoryTooltipCleanup = null;
      tbody.innerHTML = `<tr><td colspan="3"><p class="action-result visible err">${escapeHtml(r.message)}</p></td></tr>`;
      return;
    }
    renderInventoryTable(r);
  } catch (err) {
    inventoryTooltipCleanup?.();
    inventoryTooltipCleanup = null;
    const msg = err instanceof Error ? err.message : String(err);
    tbody.innerHTML = `<tr><td colspan="3"><p class="action-result visible err">${escapeHtml(msg)}</p></td></tr>`;
  }
}

$('detail-close')?.addEventListener('click', () => {
  $('player-detail-panel')?.classList.add('hidden');
});

$('inventory-close')?.addEventListener('click', () => {
  inventoryTooltipCleanup?.();
  inventoryTooltipCleanup = null;
  $('player-inventory-panel')?.classList.add('hidden');
  const tip = $<HTMLElement>('wow-tooltip');
  if (tip) {
    tip.classList.add('hidden');
    tip.innerHTML = '';
  }
});

$<HTMLElement>('wow-tooltip')?.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-external-url]');
  if (!a?.dataset.externalUrl) return;
  e.preventDefault();
  void window.electronAPI.app.openExternal(a.dataset.externalUrl);
});

// ── Event delegation for player table action buttons ───────────────────────
$playersTbody?.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-player-action]');
  if (!btn) return;
  const action = btn.dataset.playerAction ?? '';
  const charname = btn.dataset.charname ?? '';
  if (action === 'detail') {
    showPlayerDetail(charname);
  } else if (action === 'inventory') {
    void openPlayerInventory(charname);
  } else {
    runPlayerAction(action, charname);
  }
});

// ── Player Action Form ─────────────────────────────────────────────────────
async function runPlayerAction(action: string, charname: string): Promise<void> {
  let cmd = '';
  const extra = $paExtra?.value.trim() ?? '';

  switch (action) {
    case 'pinfo':               cmd = `pinfo ${charname}`; break;
    case 'kick':                cmd = `kick ${charname}`; break;
    case 'ban account':         cmd = `ban account ${charname} ${extra || '0 Admin action'}`; break;
    case 'ban character':       cmd = `ban character ${charname} ${extra || '0 Admin action'}`; break;
    case 'ban ip':              cmd = `ban ip ${charname} ${extra || '0 Admin action'}`; break;
    case 'unban account':       cmd = `unban account ${charname}`; break;
    case 'unban character':     cmd = `unban character ${charname}`; break;
    case 'mute':                cmd = `mute ${charname} ${extra || '10'}`; break;
    case 'unmute':              cmd = `unmute ${charname}`; break;
    case 'freeze':              cmd = `freeze ${charname}`; break;
    case 'unfreeze':            cmd = `unfreeze ${charname}`; break;
    case 'revive':              cmd = `revive ${charname}`; break;
    case 'repairitems':         cmd = `repairitems ${charname}`; break;
    case 'combatstop':          cmd = `combatstop ${charname}`; break;
    case 'unstuck':             cmd = `unstuck ${charname}`; break;
    case 'summon':              cmd = `summon ${charname}`; break;
    case 'teleport':            cmd = `teleport name ${charname} ${extra}`; break;
    case 'character level':     cmd = `character level ${charname} ${extra || '80'}`; break;
    case 'character rename':    cmd = `character rename ${charname}`; break;
    case 'character customize': cmd = `character customize ${charname}`; break;
    case 'character changefaction': cmd = `character changefaction ${charname}`; break;
    case 'character changerace':    cmd = `character changerace ${charname}`; break;
    case 'character changeaccount': cmd = `character changeaccount ${extra} ${charname}`; break;
    case 'character reputation':    cmd = `character reputation ${charname}`; break;
    case 'character titles':        cmd = `character titles ${charname}`; break;
    case 'reset talents':   cmd = `reset talents ${charname}`; break;
    case 'reset spells':    cmd = `reset spells ${charname}`; break;
    case 'reset stats':     cmd = `reset stats ${charname}`; break;
    case 'reset level':     cmd = `reset level ${charname}`; break;
    case 'reset honor':     cmd = `reset honor ${charname}`; break;
    case 'send mail':       cmd = `send mail ${charname} ${extra || '"Admin" "Message"'}`; break;
    case 'send items':      cmd = `send items ${charname} "Admin" "Items" ${extra}`; break;
    case 'send money':      cmd = `send money ${charname} ${extra || '"Admin" "Gold" 10000'}`; break;
    case 'send message':    cmd = `send message ${charname} ${extra || 'Hello from admin'}`; break;
    case 'lookup player account': cmd = `lookup player account ${extra || charname}`; break;
    case 'lookup player ip':      cmd = `lookup player ip ${extra || charname}`; break;
    default: cmd = `${action} ${charname}`;
  }

  const r = await exec(cmd);
  showResult($playerActionResult, r.success, r.message || '(no output)');
  logActivity(cmd, r.message || '(done)', r.success);
}

$('player-action-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const charname = $paCharname?.value.trim() ?? '';
  const action = $paAction?.value ?? '';
  if (!charname || !state.connected) return;
  if ($paCharname) $paCharname.value = charname;
  runPlayerAction(action, charname);
});

$paAction?.addEventListener('change', () => {
  const action = $paAction.value;
  const needsExtra = [
    'send items', 'send mail', 'send money', 'send message',
    'teleport', 'ban account', 'ban character', 'ban ip',
    'character level', 'character changeaccount', 'mute',
    'lookup player account', 'lookup player ip',
  ].includes(action);
  if ($paExtraLabel) $paExtraLabel.style.display = needsExtra ? '' : 'none';
  if ($paExtra) {
    switch (action) {
      case 'send items':      $paExtra.placeholder = 'itemid:count e.g. "49623:1"'; break;
      case 'send mail':       $paExtra.placeholder = '"Subject" "Body text"'; break;
      case 'send money':      $paExtra.placeholder = '"Subject" "Text" amount (copper)'; break;
      case 'send message':    $paExtra.placeholder = 'screen message text'; break;
      case 'teleport':        $paExtra.placeholder = 'location name'; break;
      case 'ban account':     $paExtra.placeholder = 'duration reason (e.g. 1d Cheating)'; break;
      case 'ban character':   $paExtra.placeholder = 'duration reason'; break;
      case 'ban ip':          $paExtra.placeholder = 'duration reason'; break;
      case 'character level': $paExtra.placeholder = 'level (1-80)'; break;
      case 'character changeaccount': $paExtra.placeholder = 'new account name'; break;
      case 'mute':            $paExtra.placeholder = 'minutes (default 10)'; break;
      case 'lookup player account': $paExtra.placeholder = 'account name'; break;
      case 'lookup player ip':      $paExtra.placeholder = 'IP address'; break;
      default:                $paExtra.placeholder = ''; break;
    }
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

function updateProfileButtons(): void {
  const hasSelectedProfile = Boolean($profileSelect?.value);
  if ($btnUpdateProfile) $btnUpdateProfile.disabled = !hasSelectedProfile;
  if ($btnDeleteProfile) $btnDeleteProfile.disabled = !hasSelectedProfile;
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

  updateProfileButtons();
}

function loadProfileConfig(profile: ConnectionProfile): void {
  applySoapProfileConfig(profile.soapConfig);
  applyDatabaseProfileConfig(profile.databaseConfig);
  applyMapDatabaseProfileConfig(profile.mapDatabaseConfig);
  applyLogMonitorProfileConfig(profile.logMonitorConfig);
  resetLogMonitorView('Loaded profile settings. Run a fresh log scan to inspect this server.');
}

$profileSelect?.addEventListener('change', async () => {
  const id = $profileSelect.value;
  updateProfileButtons();
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
    config: getCurrentSoapProfileConfig(),
    soapConfig: getCurrentSoapProfileConfig(),
    databaseConfig: getCurrentDatabaseProfileConfig(),
    mapDatabaseConfig: getCurrentMapDatabaseProfileConfig(),
    logMonitorConfig: getCurrentLogMonitorProfileConfig(),
  });
  
  state.profiles.push(profile);
  state.activeProfileId = profile.id;
  await window.electronAPI.config.setActiveProfile(profile.id);
  renderProfiles();
});

$btnUpdateProfile?.addEventListener('click', async () => {
  const id = $profileSelect?.value;
  if (!id) return;

  const updatedProfile = await window.electronAPI.config.updateProfile(id, {
    config: getCurrentSoapProfileConfig(),
    soapConfig: getCurrentSoapProfileConfig(),
    databaseConfig: getCurrentDatabaseProfileConfig(),
    mapDatabaseConfig: getCurrentMapDatabaseProfileConfig(),
    logMonitorConfig: getCurrentLogMonitorProfileConfig(),
  });

  if (!updatedProfile) return;

  state.profiles = state.profiles.map((profile) => (profile.id === id ? updatedProfile : profile));
  state.activeProfileId = id;
  await window.electronAPI.config.setActiveProfile(id);
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
// LOG MONITOR TAB
// ═══════════════════════════════════════════════════════════════════════════

function formatFileSize(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function getLogMonitorSelectedLogger(result: LogMonitorInspectionResult | null) {
  if (!result || !logMonitorState.selectedLoggerName) return null;
  return result.loggers.find((logger) => logger.name === logMonitorState.selectedLoggerName) ?? null;
}

function getLogMonitorFilesForSelectedLogger(result: LogMonitorInspectionResult | null) {
  if (!result) return [];

  const selectedLogger = getLogMonitorSelectedLogger(result);
  if (!selectedLogger) return [];

  const allowedPaths = new Set(selectedLogger.resolvedFiles);
  return result.files.filter((file) => file.readable && allowedPaths.has(file.path));
}

function getLogMonitorSelectedFile(result: LogMonitorInspectionResult | null) {
  if (!result || !logMonitorState.selectedFilePath) return null;
  return result.files.find((file) => file.path === logMonitorState.selectedFilePath) ?? null;
}

function selectLogLogger(loggerName: string | null): void {
  logMonitorState.selectedLoggerName = loggerName;
  renderLogInspection(logMonitorState.inspection);
}

function renderLogSummary(result: LogMonitorInspectionResult | null): void {
  if (!$logSummary) return;

  if (!result) {
    $logSummary.innerHTML = '<p class="placeholder">Connect to a server over SSH/SFTP and scan <code>worldserver.conf</code> to discover configured loggers, appenders, and readable log files.</p>';
    return;
  }

  const readableCount = result.files.filter((file) => file.readable).length;
  const warningHtml = result.warnings.length
    ? `<div class="log-monitor-warning-list">${result.warnings.map((warning) => `<div class="log-monitor-warning">${escapeHtml(warning)}</div>`).join('')}</div>`
    : '<div class="log-monitor-good">No scan warnings. The logging gremlins are behaving.</div>';

  $logSummary.innerHTML = `
    <div class="log-monitor-summary-grid">
      <div class="log-summary-chip"><span>Config</span><strong>${escapeHtml(result.configPath)}</strong></div>
      <div class="log-summary-chip"><span>Logs Dir</span><strong>${escapeHtml(result.resolvedLogsDir || result.logsDir || '—')}</strong></div>
      <div class="log-summary-chip"><span>Appenders</span><strong>${result.appenders.length}</strong></div>
      <div class="log-summary-chip"><span>Loggers</span><strong>${result.loggers.length}</strong></div>
      <div class="log-summary-chip"><span>Readable Files</span><strong>${readableCount}</strong></div>
      <div class="log-summary-chip"><span>Scanned</span><strong>${escapeHtml(formatTimestamp(result.inspectedAt))}</strong></div>
    </div>
    ${warningHtml}
  `;
}

function renderLogFileList(result: LogMonitorInspectionResult | null): void {
  if (!$logLoggerSelect || !$logFileSelect || !$logFileDetails) return;

  if (!result) {
    $logLoggerSelect.innerHTML = '<option value="">Scan a server first</option>';
    $logLoggerSelect.disabled = true;
    $logFileSelect.innerHTML = '<option value="">Choose a logger first</option>';
    $logFileSelect.disabled = true;
    $logFileDetails.innerHTML = '<p class="placeholder">Scan a server to choose a logger and inspect its live files.</p>';
    return;
  }

  const loggersWithFiles = result.loggers.filter((logger) => result.files.some((file) => file.readable && logger.resolvedFiles.includes(file.path)));
  const loggerOptions = (loggersWithFiles.length ? loggersWithFiles : result.loggers)
    .map((logger) => `<option value="${escapeHtml(logger.name)}" ${logger.name === logMonitorState.selectedLoggerName ? 'selected' : ''}>${escapeHtml(logger.name)}</option>`)
    .join('');

  $logLoggerSelect.innerHTML = loggerOptions || '<option value="">No loggers found</option>';
  $logLoggerSelect.disabled = !result.loggers.length;

  const selectedLogger = getLogMonitorSelectedLogger(result);
  if (!selectedLogger) {
    $logFileSelect.innerHTML = '<option value="">Choose a logger first</option>';
    $logFileSelect.disabled = true;
    $logFileDetails.innerHTML = '<p class="placeholder">Select a logger to see the files it currently writes to.</p>';
    return;
  }

  const files = getLogMonitorFilesForSelectedLogger(result);
  if (!files.length) {
    $logFileSelect.innerHTML = '<option value="">No readable files available</option>';
    $logFileSelect.disabled = true;
    $logFileDetails.innerHTML = `<p class="placeholder">${escapeHtml(selectedLogger.name)} does not have any readable files available right now.</p>`;
    return;
  }

  $logFileSelect.innerHTML = files.map((file) => `
    <option value="${escapeHtml(file.path)}" ${file.path === logMonitorState.selectedFilePath ? 'selected' : ''}>${escapeHtml(file.name)}</option>`).join('');
  $logFileSelect.disabled = false;

  const selectedFile = getLogMonitorSelectedFile(result) ?? files[0];
  const sources = selectedFile ? [...new Set([...selectedFile.sourceHints, ...selectedFile.matchedAppenderNames])].join(' · ') || 'discovered' : '—';
  $logFileDetails.innerHTML = selectedFile
    ? `
      <div class="log-file-detail-name">${escapeHtml(selectedFile.name)}</div>
      <div class="log-file-detail-meta">${escapeHtml(selectedFile.path)}</div>
      <div class="log-file-detail-meta">${escapeHtml(formatFileSize(selectedFile.size))} · ${escapeHtml(formatTimestamp(selectedFile.modifiedAt))}</div>
      <div class="log-file-detail-tags">${escapeHtml(sources)}</div>`
    : '<p class="placeholder">Choose a file to load its live preview.</p>';
}

function renderAppenderTable(result: LogMonitorInspectionResult | null): void {
  if (!$logAppendersTable) return;

  if (!result || !result.appenders.length) {
    $logAppendersTable.innerHTML = '<p class="placeholder">Appender details will appear here after a scan.</p>';
    return;
  }

  $logAppendersTable.innerHTML = `
    <table class="log-monitor-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Level</th>
          <th>Flags</th>
          <th>File</th>
          <th>Resolved Path</th>
        </tr>
      </thead>
      <tbody>
        ${result.appenders.map((appender) => `
          <tr>
            <td>${escapeHtml(appender.name)}</td>
            <td>${escapeHtml(appender.type)}</td>
            <td>${escapeHtml(appender.logLevelLabel)}</td>
            <td>${escapeHtml(String(appender.flags))}</td>
            <td>${escapeHtml(appender.fileName || (appender.optionalValues[0] || '—'))}</td>
            <td>${escapeHtml(appender.resolvedPath || (appender.matchedDynamicFiles?.join(', ') || '—'))}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderLoggerTable(result: LogMonitorInspectionResult | null): void {
  if (!$logLoggersTable) return;

  if (!result || !result.loggers.length) {
    $logLoggersTable.innerHTML = '<p class="placeholder">Logger mappings will appear here after a scan.</p>';
    return;
  }

  const rows = result.loggers.map((logger) => {
    const readableFiles = result.files.filter((file) => file.readable && logger.resolvedFiles.includes(file.path));
    const selected = logMonitorState.selectedLoggerName === logger.name;
    return `
      <tr class="${selected ? 'selected' : ''}" data-log-logger-name="${escapeHtml(logger.name)}">
        <td>
          <button type="button" class="log-logger-select ${selected ? 'selected' : ''}" data-log-logger-name="${escapeHtml(logger.name)}">
            ${escapeHtml(logger.name)}
          </button>
        </td>
        <td>${escapeHtml(logger.logLevelLabel)}</td>
        <td>${escapeHtml(logger.appenderNames.join(', ') || '—')}</td>
        <td>${escapeHtml(readableFiles.map((file) => file.name).join(', ') || '—')}</td>
      </tr>`;
  }).join('');

  $logLoggersTable.innerHTML = `
    <table class="log-monitor-table">
      <thead>
        <tr>
          <th>Logger</th>
          <th>Level</th>
          <th>Appenders</th>
          <th>Resolved Files</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;
}

function renderLogPreviewPlaceholder(message: string): void {
  if ($logPreviewMeta) $logPreviewMeta.textContent = message;
  if ($logPreviewOutput) {
    $logPreviewOutput.textContent = isLogFollowEnabled()
      ? 'Select a readable file to preview its latest output. Live follow will start automatically for the selected file.'
      : 'Select a readable file to preview its latest output.';
  }
}

function renderLogInspection(result: LogMonitorInspectionResult | null): void {
  if (result && logMonitorState.selectedLoggerName && !result.loggers.some((logger) => logger.name === logMonitorState.selectedLoggerName)) {
    logMonitorState.selectedLoggerName = null;
  }

  if (result && !logMonitorState.selectedLoggerName) {
    const firstLoggerWithFiles = result.loggers.find((logger) => result.files.some((file) => file.readable && logger.resolvedFiles.includes(file.path)));
    logMonitorState.selectedLoggerName = firstLoggerWithFiles?.name ?? result.loggers[0]?.name ?? null;
  }

  const availableFilePaths = new Set(getLogMonitorFilesForSelectedLogger(result).map((file) => file.path));
  if (!logMonitorState.selectedFilePath || !availableFilePaths.has(logMonitorState.selectedFilePath)) {
    logMonitorState.selectedFilePath = null;
  }

  renderLogSummary(result);
  renderLogFileList(result);
  renderAppenderTable(result);
  renderLoggerTable(result);

  if (!logMonitorState.selectedFilePath) {
    const selectedLogger = getLogMonitorSelectedLogger(result);
    renderLogPreviewPlaceholder(selectedLogger ? `No file selected for logger ${selectedLogger.name}.` : 'No logger selected.');
    if ($logRefreshPreviewBtn) $logRefreshPreviewBtn.disabled = true;
  }

  syncLogFollowPolling();
}

async function loadLogPreview(filePath: string, options: { silent?: boolean } = {}): Promise<void> {
  const config = getCurrentLogMonitorProfileConfig();
  const { silent = false } = options;
  stopLogFollowLoop();
  logMonitorState.selectedFilePath = filePath;
  if (logMonitorState.inspection && logMonitorState.selectedLoggerName) {
    const selectedLoggerFiles = getLogMonitorFilesForSelectedLogger(logMonitorState.inspection);
    if (!selectedLoggerFiles.some((file) => file.path === filePath)) {
      const matchingLogger = logMonitorState.inspection.loggers.find((logger) => logger.resolvedFiles.includes(filePath));
      if (matchingLogger) {
        logMonitorState.selectedLoggerName = matchingLogger.name;
      }
    }
  }
  renderLogFileList(logMonitorState.inspection);

  const requestToken = ++logMonitorState.previewRequestToken;
  logMonitorState.previewInFlight = true;

  if ($logPreviewMeta) $logPreviewMeta.textContent = `${silent ? 'Refreshing' : 'Loading'} ${filePath}…`;
  if (!silent && $logPreviewOutput) $logPreviewOutput.textContent = 'Fetching the latest log tail…';
  if ($logRefreshPreviewBtn) $logRefreshPreviewBtn.disabled = true;

  try {
    const result = await window.electronAPI.logs.readTail(config, filePath, 48 * 1024);
    if (requestToken !== logMonitorState.previewRequestToken) {
      return;
    }

    if (result.success) {
      if ($logPreviewMeta) {
        const followLabel = isLogFollowEnabled() ? ` · live every ${Math.round(getLogRefreshIntervalMs() / 1000)}s` : '';
        $logPreviewMeta.textContent = `${result.path} · ${result.message}${followLabel}`;
      }
      if ($logPreviewOutput) {
        $logPreviewOutput.textContent = result.content || '(file is empty)';
      }
    } else {
      if ($logPreviewMeta) {
        const retryLabel = shouldPollLogFollow() ? ` · retrying in ${Math.round(getLogRefreshIntervalMs() / 1000)}s` : '';
        $logPreviewMeta.textContent = `${result.path}${retryLabel}`;
      }
      if ($logPreviewOutput) $logPreviewOutput.textContent = result.message;
    }

    if ($logRefreshPreviewBtn) $logRefreshPreviewBtn.disabled = !result.success;
  } finally {
    if (requestToken === logMonitorState.previewRequestToken) {
      logMonitorState.previewInFlight = false;
      syncLogFollowPolling();
    }
  }
}

async function scanRemoteLogs(): Promise<void> {
  const config = getCurrentLogMonitorProfileConfig();
  if (!config.host || !config.username || !config.worldserverConfigPath) {
    showResult($logStatus, false, 'Host, username, and worldserver.conf path are required.');
    return;
  }

  stopLogFollowLoop();
  if ($logScanBtn) $logScanBtn.disabled = true;
  if ($logRefreshPreviewBtn) $logRefreshPreviewBtn.disabled = true;
  showResult($logStatus, false, 'Scanning remote worldserver.conf and log paths…');

  const result = await window.electronAPI.logs.inspect(config);
  logMonitorState.inspection = result;
  renderLogInspection(result);
  showResult($logStatus, result.success, result.message);

  if (result.success) {
    const firstReadableFile = getLogMonitorFilesForSelectedLogger(result)[0] ?? result.files.find((file) => file.readable);
    if (firstReadableFile) {
      await loadLogPreview(firstReadableFile.path);
    }
  }

  if ($logScanBtn) $logScanBtn.disabled = false;
}

$logScanBtn?.addEventListener('click', () => {
  void scanRemoteLogs();
});

$logRefreshPreviewBtn?.addEventListener('click', () => {
  if (!logMonitorState.selectedFilePath) return;
  void loadLogPreview(logMonitorState.selectedFilePath);
});

$logFollowEnabled?.addEventListener('change', () => {
  updateLogFollowControls();
  syncLogFollowPolling(true);
});

$logRefreshInterval?.addEventListener('change', () => {
  syncLogFollowPolling();
  if (logMonitorState.selectedFilePath && isLogFollowEnabled() && !$logRefreshPreviewBtn?.disabled) {
    if ($logPreviewMeta) {
      $logPreviewMeta.textContent = `${logMonitorState.selectedFilePath} · live every ${Math.round(getLogRefreshIntervalMs() / 1000)}s`;
    }
  }
});

[$logHost, $logPort, $logUsername, $logPassword, $logConfigPath].forEach((element) => {
  element?.addEventListener('change', () => {
    stopLogFollowLoop();
  });
});

$logLoggerSelect?.addEventListener('change', () => {
  const loggerName = $logLoggerSelect.value || null;
  selectLogLogger(loggerName);
  const firstReadableFile = getLogMonitorFilesForSelectedLogger(logMonitorState.inspection)[0];
  if (firstReadableFile) {
    void loadLogPreview(firstReadableFile.path);
  }
});

$logFileSelect?.addEventListener('change', () => {
  const filePath = $logFileSelect.value;
  if (!filePath) return;
  void loadLogPreview(filePath);
});

$logLoggersTable?.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLElement>('[data-log-logger-name]');
  if (!button) return;

  const loggerName = button.dataset.logLoggerName;
  if (!loggerName || loggerName === logMonitorState.selectedLoggerName) return;

  selectLogLogger(loggerName);
  const firstReadableFile = getLogMonitorFilesForSelectedLogger(logMonitorState.inspection)[0];
  if (firstReadableFile) {
    void loadLogPreview(firstReadableFile.path);
  }
});

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
  // Entity editor state
  entityOriginalData: Record<string, unknown> | null;
  entityCurrentData: Record<string, unknown> | null;
  entitySqlMode: 'diff' | 'full';
  entityIsNew: boolean;
  entityRenderVersion: number;
  // Flags selector state
  flagsFieldName: string | null;
  flagsInputEl: HTMLInputElement | null;
  selectorFieldName: string | null;
  selectorInputEl: HTMLInputElement | null;
  selectorEntityType: string | null;
  selectorSearchToken: number;
  entityMediaKey: string | null;
  entityMediaPreview: EntityMediaPreviewResult | null;
  entityMediaStatus: 'idle' | 'loading' | 'ready' | 'unsupported' | 'error';
  entityMediaMessage: string | null;
  entityMediaToken: number;
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
  entityOriginalData: null,
  entityCurrentData: null,
  entitySqlMode: 'diff',
  entityIsNew: false,
  entityRenderVersion: 0,
  flagsFieldName: null,
  flagsInputEl: null,
  selectorFieldName: null,
  selectorInputEl: null,
  selectorEntityType: null,
  selectorSearchToken: 0,
  entityMediaKey: null,
  entityMediaPreview: null,
  entityMediaStatus: 'idle',
  entityMediaMessage: null,
  entityMediaToken: 0,
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
const $entitySearch = $<HTMLInputElement>('entity-search');
const $entitySearchResults = $<HTMLElement>('entity-search-results');
const $entityLoadBtn = $<HTMLButtonElement>('entity-load-btn');
const $entityNewBtn = $<HTMLButtonElement>('entity-new-btn');
const $entitySaveBtn = $<HTMLButtonElement>('entity-save-btn');
const $entityDeleteBtn = $<HTMLButtonElement>('entity-delete-btn');
const $entityEditorContent = $<HTMLElement>('entity-editor-content');
const $entitySqlCode = $<HTMLElement>('entity-sql-code');
const $entityCopySqlBtn = $<HTMLButtonElement>('entity-copy-sql-btn');
const $entityApplySqlBtn = $<HTMLButtonElement>('entity-apply-sql-btn');
const $entityPreviewContent = $<HTMLElement>('entity-preview-content');
const $entityRelationsContent = $<HTMLElement>('entity-relations-content');
const $tableRefreshBtn = $<HTMLButtonElement>('table-refresh-btn');
const $flagsOverlay = $<HTMLElement>('flags-overlay');
const $flagsGrid = $<HTMLElement>('flags-grid');
const $flagsApplyBtn = $<HTMLButtonElement>('flags-apply-btn');
const $flagsCancelBtn = $<HTMLButtonElement>('flags-cancel-btn');
const $selectorOverlay = $<HTMLElement>('selector-overlay');
const $selectorDialogTitle = $<HTMLElement>('selector-dialog-title');
const $selectorDialogSubtitle = $<HTMLElement>('selector-dialog-subtitle');
const $selectorSearchInput = $<HTMLInputElement>('selector-search-input');
const $selectorResults = $<HTMLElement>('selector-results');
const $selectorCloseBtn = $<HTMLButtonElement>('selector-close-btn');

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
    username: $dbUser?.value.trim() || 'acore',
    password: $dbPassword?.value || '',
    database: $dbName?.value.trim() || 'acore_world',
  };
  
  try {
    $dbConnectBtn.disabled = true;
    $dbStatusText!.textContent = 'Connecting...';
    $dbStatusText!.className = 'text-status-accent';
    
    const result = await window.electronAPI.db.connect(config);
    
    if (result.connected) {
      dbState.connected = true;
      dbState.database = result.database;
      $dbStatusText!.textContent = `Connected to ${result.database}`;
      $dbStatusText!.className = 'text-status-success db-status-connected';
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
      $dbStatusText!.className = 'text-status-danger db-status-error';
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    $dbStatusText!.textContent = `Error: ${errorMsg}`;
    $dbStatusText!.className = 'text-status-danger db-status-error';
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
    $dbStatusText!.className = 'text-status-danger db-status-disconnected';
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
    $dbTableList!.innerHTML = '<p class="text-app-danger text-sm p-2">Error loading tables</p>';
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

  if (!filtered.length) {
    $dbTableList!.innerHTML = '<p class="text-dark-text-muted text-sm p-2">No matching tables</p>';
    return;
  }
  
  $dbTableList!.innerHTML = filtered.map(table => 
    `<button type="button" class="db-table-item${dbState.currentTable === table ? ' active' : ''}" data-table="${table}" title="Open ${escapeHtml(table)}">${escapeHtml(table)}</button>`
  ).join('');
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

$dbTableList?.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('.db-table-item[data-table]');
  if (!target) return;

  const tableName = target.dataset.table;
  if (tableName) {
    void selectTable(tableName);
  }
});

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
      $sqlResults!.innerHTML = `<p class="text-app-success text-sm p-4">Query executed successfully. ${result.affectedRows} rows affected.</p>`;
      $sqlExportBtn!.disabled = true;
    } else {
      $sqlResultInfo!.textContent = `Empty result set (${duration}ms)`;
      $sqlResults!.innerHTML = '<p class="text-dark-text-muted text-sm p-4">No results</p>';
      $sqlExportBtn!.disabled = true;
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    $sqlResultInfo!.textContent = 'Error';
    $sqlResults!.innerHTML = `<p class="text-app-danger text-sm p-4">Error: ${escapeHtml(errorMsg)}</p>`;
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
  document.querySelectorAll<HTMLButtonElement>('.db-subtabs [role="tab"]').forEach((btn) => {
    const match = btn.getAttribute('data-subtab') === subtabId;
    btn.classList.toggle('active', match);
    btn.setAttribute('aria-selected', match ? 'true' : 'false');
    btn.tabIndex = match ? 0 : -1;
  });

  document.querySelectorAll<HTMLElement>('.db-subtab-content').forEach((panel) => {
    const isSel = panel.id === subtabId;
    panel.classList.toggle('hidden', !isSel);
    panel.setAttribute('aria-hidden', isSel ? 'false' : 'true');
  });
}

const DB_SUBTAB_ORDER = ['db-sql-editor', 'db-table-editor', 'db-entity-editor'] as const;

// Add click handlers for subtabs
document.querySelectorAll<HTMLButtonElement>('.db-subtabs [role="tab"]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const subtabId = btn.getAttribute('data-subtab');
    if (subtabId) {
      switchDbSubtab(subtabId);
    }
  });
});

document.querySelector('.db-subtabs')?.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const bar = e.currentTarget;
  if (!(bar instanceof HTMLElement) || !(e.target instanceof Node) || !bar.contains(e.target)) return;
  const current = bar.querySelector<HTMLButtonElement>('[role="tab"].active')?.getAttribute('data-subtab');
  let idx = current ? DB_SUBTAB_ORDER.indexOf(current as (typeof DB_SUBTAB_ORDER)[number]) : 0;
  if (idx < 0) idx = 0;
  if (e.key === 'ArrowRight') idx = (idx + 1) % DB_SUBTAB_ORDER.length;
  else idx = (idx - 1 + DB_SUBTAB_ORDER.length) % DB_SUBTAB_ORDER.length;
  e.preventDefault();
  const nextId = DB_SUBTAB_ORDER[idx];
  switchDbSubtab(nextId);
  bar.querySelector<HTMLButtonElement>(`[data-subtab="${nextId}"]`)?.focus();
});

// ═══════════════════════════════════════════════════════════════════════════
// ENTITY EDITOR — Keira3-inspired with search, SQL gen, flags, field groups
// ═══════════════════════════════════════════════════════════════════════════

const ENTITY_TABLES: Record<string, { table: string; primaryKey: string; nameField: string }> = {
  creature:   { table: 'creature_template',       primaryKey: 'entry',       nameField: 'name' },
  item:       { table: 'item_template',            primaryKey: 'entry',       nameField: 'name' },
  quest:      { table: 'quest_template',           primaryKey: 'ID',          nameField: 'LogTitle' },
  spell:      { table: 'spell_dbc',               primaryKey: 'ID',          nameField: 'SpellName' },
  gameobject: { table: 'gameobject_template',      primaryKey: 'entry',       nameField: 'name' },
  npc:        { table: 'npc_vendor',              primaryKey: 'entry',       nameField: 'item' },
  loot:       { table: 'creature_loot_template',   primaryKey: 'Entry',       nameField: 'Item' },
  smartai:    { table: 'smart_scripts',            primaryKey: 'entryorguid', nameField: 'action_type' },
};

// ── Field group definitions ────────────────────────────────────────────────
interface FieldGroup { label: string; fields: string[]; }

const CREATURE_GROUPS: FieldGroup[] = [
  { label: 'Basic Info',   fields: ['entry','name','subname','gossip_menu_id','minlevel','maxlevel','faction','type','family','rank','AIName','ScriptName'] },
  { label: 'NPC Flags',    fields: ['npcflag'] },
  { label: 'Unit Flags',   fields: ['unit_flags','unit_flags2','dynamicflags'] },
  { label: 'Extra Flags',  fields: ['flags_extra','type_flags','mechanic_immune_mask','school_immune_mask'] },
  { label: 'Display',      fields: ['modelid1','modelid2','modelid3','modelid4','scale'] },
  { label: 'Combat',       fields: ['unit_class','baseattacktime','rangeattacktime','BaseVariance','RangeVariance','dmgschool','BaseAttackDmgMin','BaseAttackDmgMax'] },
  { label: 'Movement',     fields: ['speed_walk','speed_run','hover_height','InhabitType','MovementType'] },
  { label: 'Loot & Gold',  fields: ['lootid','pickpocketloot','skinloot','mingold','maxgold','RegenHealth'] },
  { label: 'Kill Credit',  fields: ['KillCredit1','KillCredit2','PetSpellDataId','VehicleId'] },
];

const ITEM_GROUPS: FieldGroup[] = [
  { label: 'Basic Info',   fields: ['entry','name','class','subclass','displayid','Quality','BuyPrice','SellPrice','BuyCount'] },
  { label: 'Flags',        fields: ['Flags','FlagsExtra','AllowableClass','AllowableRace'] },
  { label: 'Requirements', fields: ['ItemLevel','RequiredLevel','RequiredSkill','RequiredSkillRank','requiredspell','requiredhonorrank','RequiredCityRank','RequiredReputationFaction','RequiredReputationRank'] },
  { label: 'Stats',        fields: ['stat_type1','stat_value1','stat_type2','stat_value2','stat_type3','stat_value3','stat_type4','stat_value4','stat_type5','stat_value5'] },
  { label: 'Damage',       fields: ['dmg_min1','dmg_max1','dmg_type1','dmg_min2','dmg_max2','dmg_type2','delay','RangedModRange'] },
  { label: 'Armor',        fields: ['armor','holy_res','fire_res','nature_res','frost_res','shadow_res','arcane_res'] },
  { label: 'Sockets',      fields: ['socketColor_1','socketContent_1','socketColor_2','socketContent_2','socketColor_3','socketContent_3','socketBonus','GemProperties'] },
  { label: 'Spells',       fields: ['spellid_1','spelltrigger_1','spellcharges_1','spellcooldown_1','spellid_2','spelltrigger_2','spellcharges_2','spellcooldown_2'] },
  { label: 'Container',    fields: ['ContainerSlots','stackable','maxcount','bonding','Material'] },
];

const QUEST_GROUPS: FieldGroup[] = [
  { label: 'Basic Info',   fields: ['ID','LogTitle','LogDescription','QuestDescription','AreaDescription','QuestCompletionLog'] },
  { label: 'Level & Type', fields: ['QuestLevel','MinLevel','MaxLevel','QuestType','QuestSortID','QuestInfoID','SuggestedGroupNum','AllowableRaces'] },
  { label: 'Flags',        fields: ['Flags','SpecialFlags','QuestFlags'] },
  { label: 'Rewards',      fields: ['RewardXPDifficulty','RewardMoney','RewardBonusMoney','RewardSpell','RewardSpellCast','RewardHonor','RewardHonorMultiplier','RewardMailDelay'] },
  { label: 'Req. Kills/GO',fields: ['RequiredNpcOrGo1','RequiredNpcOrGoCount1','RequiredNpcOrGo2','RequiredNpcOrGoCount2','RequiredNpcOrGo3','RequiredNpcOrGoCount3','RequiredNpcOrGo4','RequiredNpcOrGoCount4'] },
  { label: 'Req. Items',   fields: ['RequiredItemId1','RequiredItemCount1','RequiredItemId2','RequiredItemCount2','RequiredItemId3','RequiredItemCount3','RequiredItemId4','RequiredItemCount4','RequiredItemId5','RequiredItemCount5','RequiredItemId6','RequiredItemCount6'] },
  { label: 'Reward Items', fields: ['RewardItem1','RewardAmount1','RewardItem2','RewardAmount2','RewardItem3','RewardAmount3','RewardItem4','RewardAmount4'] },
  { label: 'Choice Items', fields: ['RewardChoiceItemId1','RewardChoiceItemQuantity1','RewardChoiceItemId2','RewardChoiceItemQuantity2','RewardChoiceItemId3','RewardChoiceItemQuantity3','RewardChoiceItemId4','RewardChoiceItemQuantity4','RewardChoiceItemId5','RewardChoiceItemQuantity5','RewardChoiceItemId6','RewardChoiceItemQuantity6'] },
  { label: 'Start & End',  fields: ['StartItem','SourceItemIdCount','QuestGiverTextWindow','QuestTurnTextWindow','QuestGiverTargetName','QuestTurnTargetName'] },
];

// ── Flag bit definitions ───────────────────────────────────────────────────
interface FlagDef { bit: number; label: string; desc?: string; }

const FLAG_DEFS: Record<string, FlagDef[]> = {
  npcflag: [
    { bit:0x1,       label:'GOSSIP',          desc:'Has gossip menu' },
    { bit:0x2,       label:'QUEST_GIVER',     desc:'Gives quests' },
    { bit:0x10,      label:'TRAINER',         desc:'Is a trainer' },
    { bit:0x20,      label:'TRAINER_CLASS',   desc:'Class trainer' },
    { bit:0x40,      label:'TRAINER_PROF',    desc:'Profession trainer' },
    { bit:0x80,      label:'VENDOR',          desc:'Is a vendor' },
    { bit:0x100,     label:'VENDOR_AMMO',     desc:'Sells ammo' },
    { bit:0x200,     label:'VENDOR_FOOD',     desc:'Sells food/water' },
    { bit:0x400,     label:'VENDOR_POISON',   desc:'Sells poisons' },
    { bit:0x800,     label:'VENDOR_REAGENT',  desc:'Sells reagents' },
    { bit:0x1000,    label:'REPAIR',          desc:'Repairs items' },
    { bit:0x2000,    label:'FLIGHTMASTER',    desc:'Flight master' },
    { bit:0x4000,    label:'SPIRITHEALER',    desc:'Spirit healer' },
    { bit:0x10000,   label:'INNKEEPER',       desc:'Innkeeper' },
    { bit:0x20000,   label:'BANKER',          desc:'Banker' },
    { bit:0x80000,   label:'TABARDDESIGNER',  desc:'Tabard designer' },
    { bit:0x100000,  label:'BATTLEMASTER',    desc:'PvP queue master' },
    { bit:0x200000,  label:'AUCTIONEER',      desc:'Auctioneer' },
    { bit:0x400000,  label:'STABLE_MASTER',   desc:'Pet stable master' },
    { bit:0x800000,  label:'GUILD_BANKER',    desc:'Guild bank' },
    { bit:0x1000000, label:'SPELLCLICK',      desc:'Has spellclick' },
    { bit:0x4000000, label:'MAILBOX',         desc:'Mailbox NPC' },
  ],
  unit_flags: [
    { bit:0x2,       label:'NON_ATTACKABLE',  desc:'Not attackable' },
    { bit:0x4,       label:'DISABLE_MOVE',    desc:'Movement disabled' },
    { bit:0x8,       label:'PVP_ATTACKABLE',  desc:'PvP attackable' },
    { bit:0x100,     label:'IMMUNE_TO_PC',    desc:'Immune to players' },
    { bit:0x200,     label:'IMMUNE_TO_NPC',   desc:'Immune to NPCs' },
    { bit:0x1000,    label:'PVP',             desc:'PvP flagged' },
    { bit:0x2000,    label:'SILENCED',        desc:'Silenced' },
    { bit:0x20000,   label:'PACIFIED',        desc:'Pacified' },
    { bit:0x40000,   label:'STUNNED',         desc:'Stunned' },
    { bit:0x2000000, label:'NOT_SELECTABLE',  desc:'Not selectable' },
    { bit:0x4000000, label:'SKINNABLE',       desc:'Skinnable' },
    { bit:0x8000000, label:'MOUNT',           desc:'Is a mount' },
  ],
  unit_flags2: [
    { bit:0x1,    label:'FEIGN_DEATH',         desc:'Feign death' },
    { bit:0x8,    label:'IGNORE_REPUTATION',   desc:'Ignore reputation' },
    { bit:0x10,   label:'COMPREHEND_LANG',     desc:'Comprehend language' },
    { bit:0x20,   label:'MIRROR_IMAGE',        desc:'Mirror image' },
    { bit:0x800,  label:'REGENERATE_POWER',    desc:'Regenerates power' },
    { bit:0x4000, label:'ALLOW_CHEAT_SPELLS',  desc:'Allow cheat spells' },
  ],
  flags_extra: [
    { bit:0x1,    label:'INSTANCE_BIND',       desc:'Bind instance (raid boss)' },
    { bit:0x2,    label:'CIVILIAN',            desc:'Civilian — no rep loss' },
    { bit:0x4,    label:'NO_PARRY',            desc:'Cannot parry' },
    { bit:0x8,    label:'NO_PARRY_HASTEN',     desc:'No parry haste' },
    { bit:0x10,   label:'NO_BLOCK',            desc:'Cannot block' },
    { bit:0x20,   label:'NO_CRUSH',            desc:'No crushing blows' },
    { bit:0x40,   label:'NO_XP_AT_KILL',       desc:'No XP when killed' },
    { bit:0x80,   label:'TRIGGER',             desc:'Trigger creature (invisible)' },
    { bit:0x100,  label:'NO_TAUNT',            desc:'Cannot be taunted' },
    { bit:0x800,  label:'USE_OFFHAND_ATTACK',  desc:'Uses offhand attack' },
    { bit:0x2000, label:'CANNOT_ENTER_COMBAT', desc:'Cannot enter combat' },
    { bit:0x8000, label:'GUARD',               desc:'In-game guard' },
    { bit:0x20000,label:'NO_CRIT',             desc:'Cannot critically strike' },
  ],
  type_flags: [
    { bit:0x1,    label:'TAMEABLE',            desc:'Can be tamed' },
    { bit:0x2,    label:'GHOST_VISIBLE',        desc:'Visible to ghosts' },
    { bit:0x4,    label:'BOSS_MOB',            desc:'Boss mob' },
    { bit:0x8,    label:'DO_NOT_PLAY_WOUND',   desc:'No wound anim' },
    { bit:0x20,   label:'INTERACT_WHILE_DEAD', desc:'Can be interacted dead' },
    { bit:0x40,   label:'COLLIDE_WITH_MISSILES',desc:'Missiles collide' },
    { bit:0x80,   label:'NO_NAME_PLATE',       desc:'No nameplate' },
    { bit:0x100,  label:'DO_NOT_PLAY_MOUNTED', desc:'No mounted sound' },
    { bit:0x200,  label:'CAN_ASSIST',          desc:'Can assist' },
    { bit:0x1000, label:'TAMEABLE_EXOTIC',     desc:'Exotic tameable' },
  ],
  dynamicflags: [
    { bit:0x1,  label:'LOOTABLE',          desc:'Has loot' },
    { bit:0x2,  label:'TRACK_UNIT',        desc:'Trackable on minimap' },
    { bit:0x4,  label:'TAPPED',            desc:'Already tapped' },
    { bit:0x8,  label:'TAPPED_BY_PLAYER',  desc:'Tapped by player' },
    { bit:0x10, label:'SPECIALINFO',       desc:'Show cast info' },
    { bit:0x20, label:'DEAD',             desc:'Dead flag' },
    { bit:0x40, label:'REFER_A_FRIEND',    desc:'Refer-a-friend bonus' },
    { bit:0x80, label:'TAPPED_BY_ALL_THREAT_LIST', desc:'Tapped by all' },
  ],
  Flags: [ // quest_template
    { bit:0x1,    label:'STAY_ALIVE',           desc:'Must stay alive' },
    { bit:0x2,    label:'PARTY_ACCEPT',         desc:'Party can accept' },
    { bit:0x4,    label:'EXPLORATION',          desc:'Exploration quest' },
    { bit:0x8,    label:'SHARABLE',             desc:'Can share with party' },
    { bit:0x20,   label:'EPIC',                 desc:'Epic quest' },
    { bit:0x40,   label:'RAID',                 desc:'Raid quest' },
    { bit:0x100,  label:'HIDDEN_REWARDS',       desc:'Hidden rewards' },
    { bit:0x200,  label:'TRACKING',            desc:'Achievement tracking' },
    { bit:0x800,  label:'DAILY',               desc:'Daily quest' },
    { bit:0x4000, label:'WEEKLY',              desc:'Weekly quest' },
    { bit:0x10000,label:'AUTOCOMPLETE',         desc:'Auto-completes' },
    { bit:0x200000,label:'MONTHLY',            desc:'Monthly quest' },
  ],
};

const ITEM_QUALITY_META: Record<number, { label: string; color: string; cssClass: string }> = {
  0: { label: 'Poor', color: '#9d9d9d', cssClass: 'quality-poor' },
  1: { label: 'Common', color: '#ffffff', cssClass: 'quality-common' },
  2: { label: 'Uncommon', color: '#1eff00', cssClass: 'quality-uncommon' },
  3: { label: 'Rare', color: '#0070dd', cssClass: 'quality-rare' },
  4: { label: 'Epic', color: '#a335ee', cssClass: 'quality-epic' },
  5: { label: 'Legendary', color: '#ff8000', cssClass: 'quality-legendary' },
  6: { label: 'Artifact', color: '#e6cc80', cssClass: 'quality-artifact' },
  7: { label: 'Heirloom', color: '#00ccff', cssClass: 'quality-heirloom' },
};

const CREATURE_RANK_LABELS: Record<number, string> = {
  0: 'Normal',
  1: 'Elite',
  2: 'Rare Elite',
  3: 'World Boss',
  4: 'Rare',
};

const CREATURE_TYPE_LABELS: Record<number, string> = {
  0: 'None',
  1: 'Beast',
  2: 'Dragonkin',
  3: 'Demon',
  4: 'Elemental',
  5: 'Giant',
  6: 'Undead',
  7: 'Humanoid',
  8: 'Critter',
  9: 'Mechanical',
  10: 'Not Specified',
  11: 'Totem',
  12: 'Non-Combat Pet',
  13: 'Gas Cloud',
};

const ITEM_CLASS_LABELS: Record<number, string> = {
  0: 'Consumable',
  1: 'Container',
  2: 'Weapon',
  3: 'Gem',
  4: 'Armor',
  5: 'Reagent',
  6: 'Projectile',
  7: 'Trade Goods',
  9: 'Recipe',
  11: 'Quiver',
  12: 'Quest',
  13: 'Key',
  15: 'Miscellaneous',
  16: 'Glyph',
};

const ITEM_STAT_LABELS: Record<number, string> = {
  3: 'Agility',
  4: 'Strength',
  5: 'Intellect',
  6: 'Spirit',
  7: 'Stamina',
  12: 'Defense Rating',
  13: 'Dodge Rating',
  14: 'Parry Rating',
  15: 'Block Rating',
  16: 'Hit Melee Rating',
  17: 'Hit Ranged Rating',
  18: 'Hit Spell Rating',
  19: 'Crit Melee Rating',
  20: 'Crit Ranged Rating',
  21: 'Crit Spell Rating',
  28: 'Haste Melee Rating',
  29: 'Haste Ranged Rating',
  30: 'Haste Spell Rating',
  31: 'Hit Rating',
  32: 'Crit Rating',
  35: 'Resilience',
  36: 'Haste Rating',
  37: 'Expertise Rating',
  38: 'Attack Power',
  45: 'Spell Power',
};

const ENTITY_FIELD_HINTS: Record<string, string> = {
  entry: 'Primary entry or template ID for this entity.',
  ID: 'Primary identifier for this entity.',
  name: 'Visible name shown in-game.',
  subname: 'Subtitle or title shown beneath the creature nameplate.',
  displayid: 'DisplayInfo / visual display entry used for item appearance references.',
  modelid1: 'Primary creature model display ID.',
  modelid2: 'Alternate creature model display ID.',
  modelid3: 'Additional creature model display ID.',
  modelid4: 'Additional creature model display ID.',
  scale: 'Visual scale multiplier applied to the model.',
  npcflag: 'Bitmask describing gossip, vendor, trainer, banker, and other NPC interactions.',
  unit_flags: 'Bitmask with combat and selection state flags for the unit.',
  unit_flags2: 'Additional unit bitmask flags used for special behaviour.',
  flags_extra: 'Extra server-side flags affecting combat logic and interactions.',
  dynamicflags: 'Runtime flags controlling lootable, tapped, dead, and other live states.',
  type_flags: 'Creature-type feature flags such as tameable or boss mob.',
  Quality: 'Item rarity tier used for colour, drop expectations, and UI presentation.',
  ItemLevel: 'Internal power budget of the item.',
  RequiredLevel: 'Minimum character level needed to equip or use the item.',
  BuyPrice: 'Vendor purchase price stored in copper.',
  SellPrice: 'Vendor sell price stored in copper.',
  QuestLevel: 'Displayed quest level in the quest log.',
  MinLevel: 'Minimum player level required to accept the quest.',
  Flags: 'Quest behaviour flags such as sharable, daily, or auto-complete.',
  SpecialFlags: 'Additional quest flags for repeatability and server-side behaviours.',
  RewardMoney: 'Base quest reward in copper.',
  RewardXPDifficulty: 'Quest XP scalar bucket used by the core.',
  gossip_menu_id: 'Links this creature to a gossip menu.',
  faction: 'Faction template ID controlling hostility and reactions.',
};

interface SelectorSpec {
  entityType: 'item' | 'creature' | 'quest';
  label: string;
  subtitle: string;
}

function getSelectorSpec(fieldName: string): SelectorSpec | null {
  if (/^(RewardItem\d+|RewardChoiceItemId\d+|RequiredItemId\d+|StartItem|item|Item)$/i.test(fieldName)) {
    return {
      entityType: 'item',
      label: 'Select Item',
      subtitle: 'Search item_template by entry or name and apply the selected item ID.',
    };
  }

  if (/^(KillCredit\d+|entry)$/i.test(fieldName)) {
    return {
      entityType: 'creature',
      label: 'Select Creature',
      subtitle: 'Search creature_template by entry or creature name.',
    };
  }

  if (/^(ID|quest)$/i.test(fieldName)) {
    return {
      entityType: 'quest',
      label: 'Select Quest',
      subtitle: 'Search quest_template by quest ID or log title.',
    };
  }

  return null;
}

interface EntityPreviewLink {
  label: string;
  url: string;
  tone?: 'accent' | 'neutral';
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getItemQualityMeta(value: unknown): { label: string; color: string; cssClass: string } {
  return ITEM_QUALITY_META[toNumber(value, 1)] ?? ITEM_QUALITY_META[1];
}

function formatCopper(value: unknown): string {
  const copper = Math.max(0, Math.round(toNumber(value)));
  const gold = Math.floor(copper / 10000);
  const silver = Math.floor((copper % 10000) / 100);
  const remainder = copper % 100;
  const parts = [];
  if (gold) parts.push(`${gold}g`);
  if (silver || gold) parts.push(`${silver}s`);
  parts.push(`${remainder}c`);
  return parts.join(' ');
}

function summarizeFlags(fieldName: string, value: unknown, max = 4): string[] {
  const defs = FLAG_DEFS[fieldName];
  if (!defs) return [];

  const numericValue = toNumber(value);
  return defs.filter((flag) => (numericValue & flag.bit) === flag.bit).slice(0, max).map((flag) => flag.label);
}

function getEntityPrimaryId(): string | null {
  const current = dbState.entityCurrentData;
  const entityType = $entityType?.value || 'creature';
  const config = ENTITY_TABLES[entityType];
  if (!current || !config) return null;
  const value = current[config.primaryKey];
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function setEntitySelection(entityType: string, id: string | number): void {
  if ($entityType) $entityType.value = entityType;
  if ($entityId) $entityId.value = String(id);
  if ($entitySearch) $entitySearch.value = '';
  $entitySearchResults?.classList.add('hidden');
  void loadEntityById();
}

function closeSelectorOverlay(): void {
  $selectorOverlay?.classList.add('hidden');
  dbState.selectorFieldName = null;
  dbState.selectorInputEl = null;
  dbState.selectorEntityType = null;
}

function applySelectorValue(id: string): void {
  if (!dbState.selectorInputEl) return;
  dbState.selectorInputEl.value = id;
  dbState.selectorInputEl.dispatchEvent(new Event('input', { bubbles: true }));
  closeSelectorOverlay();
}

function renderSelectorRows(rows: Record<string, unknown>[], spec: SelectorSpec): void {
  if (!$selectorResults) return;

  const config = ENTITY_TABLES[spec.entityType];
  if (!rows.length) {
    $selectorResults.innerHTML = '<p class="text-dark-text-muted text-sm p-4">No matching rows found.</p>';
    return;
  }

  $selectorResults.innerHTML = rows.map((row) => {
    const id = String(row[config.primaryKey] ?? '');
    const name = String(row[config.nameField] ?? `Unnamed ${spec.entityType}`);
    const qualityMeta = spec.entityType === 'item' ? getItemQualityMeta(row.Quality) : null;
    const metaParts = [`#${id}`];

    if (spec.entityType === 'item') {
      metaParts.push(`DisplayID ${row.displayid ?? '—'}`);
      if (qualityMeta) metaParts.push(qualityMeta.label);
    } else if (spec.entityType === 'creature') {
      metaParts.push(`Level ${row.minlevel ?? '—'}-${row.maxlevel ?? '—'}`);
      metaParts.push(CREATURE_RANK_LABELS[toNumber(row.rank)] ?? `Rank ${toNumber(row.rank)}`);
    } else if (spec.entityType === 'quest') {
      metaParts.push(`QuestLevel ${row.QuestLevel ?? '—'}`);
      metaParts.push(`Min ${row.MinLevel ?? '—'}`);
    }

    return `<div class="selector-result-item">
      <div class="selector-result-main">
        <div class="selector-result-title"${qualityMeta ? ` style="color:${qualityMeta.color}"` : ''}>${escapeHtml(name)}</div>
        <div class="selector-result-meta">${metaParts.map((part) => `<span>${escapeHtml(String(part))}</span>`).join('')}</div>
      </div>
      <button type="button" class="selector-result-apply" data-selector-id="${escapeHtml(id)}">Use</button>
    </div>`;
  }).join('');
}

async function runSelectorSearch(term: string): Promise<void> {
  if (!$selectorResults || !dbState.selectorEntityType) return;

  const spec = getSelectorSpec(dbState.selectorFieldName ?? '');
  if (!spec) return;
  const config = ENTITY_TABLES[dbState.selectorEntityType];
  if (!config) return;

  const token = ++dbState.selectorSearchToken;
  const trimmed = term.trim();
  if (!trimmed) {
    $selectorResults.innerHTML = '<p class="text-dark-text-muted text-sm p-4">Start typing to search.</p>';
    return;
  }

  $selectorResults.innerHTML = '<p class="text-dark-text-muted text-sm p-4">Searching…</p>';

  const idLike = `%${trimmed}%`;
  const nameLike = `%${trimmed}%`;

  try {
    const extraColumns = spec.entityType === 'item'
      ? ', `Quality`, `displayid`'
      : spec.entityType === 'creature'
        ? ', `minlevel`, `maxlevel`, `rank`'
        : ', `QuestLevel`, `MinLevel`';

    const result = await window.electronAPI.db.query<Record<string, unknown>>(
      `SELECT \`${config.primaryKey}\`, \`${config.nameField}\`${extraColumns} FROM \`${config.table}\` WHERE CAST(\`${config.primaryKey}\` AS CHAR) LIKE ? OR \`${config.nameField}\` LIKE ? ORDER BY \`${config.primaryKey}\` LIMIT 40`,
      [idLike, nameLike],
    );

    if (token !== dbState.selectorSearchToken) return;
    renderSelectorRows(result.rows || [], spec);
  } catch (error) {
    if (token !== dbState.selectorSearchToken) return;
    const message = error instanceof Error ? error.message : String(error);
    $selectorResults.innerHTML = `<p class="text-app-danger text-sm p-4">Search failed: ${escapeHtml(message)}</p>`;
  }
}

const debouncedSelectorSearch = debounce((term: string) => {
  void runSelectorSearch(term);
}, 220);

function openSelectorOverlay(fieldName: string, inputEl: HTMLInputElement): void {
  const spec = getSelectorSpec(fieldName);
  if (!spec || !$selectorOverlay || !$selectorSearchInput || !$selectorResults) return;

  dbState.selectorFieldName = fieldName;
  dbState.selectorInputEl = inputEl;
  dbState.selectorEntityType = spec.entityType;
  dbState.selectorSearchToken += 1;

  if ($selectorDialogTitle) $selectorDialogTitle.textContent = spec.label;
  if ($selectorDialogSubtitle) $selectorDialogSubtitle.textContent = spec.subtitle;
  $selectorSearchInput.value = inputEl.value.trim();
  $selectorResults.innerHTML = '<p class="text-dark-text-muted text-sm p-4">Start typing to search.</p>';

  $selectorOverlay.classList.remove('hidden');
  $selectorSearchInput.focus();
  if ($selectorSearchInput.value.trim()) {
    void runSelectorSearch($selectorSearchInput.value);
  }
}

function getEntityPreviewLinks(entityType: string, entity: Record<string, unknown>): EntityPreviewLink[] {
  const id = getEntityPrimaryId();
  if (!id) return [];

  const links: EntityPreviewLink[] = [];
  switch (entityType) {
    case 'creature':
      links.push(
        { label: 'Wowhead NPC', url: `https://www.wowhead.com/wotlk/npc=${encodeURIComponent(id)}`, tone: 'accent' },
        { label: 'Search Model IDs', url: `https://www.google.com/search?q=${encodeURIComponent(`wow ${entity.modelid1 ?? ''} ${entity.modelid2 ?? ''} creature display`)}` },
      );
      break;
    case 'item':
      links.push(
        { label: 'Wowhead Item', url: `https://www.wowhead.com/wotlk/item=${encodeURIComponent(id)}`, tone: 'accent' },
        { label: 'Search Display ID', url: `https://www.google.com/search?q=${encodeURIComponent(`wow item displayid ${entity.displayid ?? ''}`)}` },
      );
      break;
    case 'quest':
      links.push({ label: 'Wowhead Quest', url: `https://www.wowhead.com/wotlk/quest=${encodeURIComponent(id)}`, tone: 'accent' });
      break;
    case 'gameobject':
      links.push({ label: 'Wowhead GameObject', url: `https://www.wowhead.com/wotlk/object=${encodeURIComponent(id)}`, tone: 'accent' });
      break;
    default:
      links.push({ label: 'Search Entity', url: `https://www.google.com/search?q=${encodeURIComponent(`azerothcore ${entityType} ${id}`)}`, tone: 'accent' });
      break;
  }
  return links;
}

function renderPreviewLinks(entityType: string, entity: Record<string, unknown>): string {
  const links = getEntityPreviewLinks(entityType, entity);
  if (!links.length) return '';

  return `<div class="entity-preview-actions">${links.map((link) => `
    <button type="button" class="entity-preview-link ${link.tone === 'accent' ? 'accent' : ''}" data-preview-url="${escapeHtml(link.url)}">
      ${escapeHtml(link.label)}
    </button>`).join('')}</div>`;
}

function buildPreviewStat(label: string, value: string, tone = ''): string {
  return `<div class="entity-preview-stat ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function buildPreviewChip(label: string, tone = ''): string {
  return `<span class="entity-preview-chip ${tone}">${escapeHtml(label)}</span>`;
}

function buildPreviewList(title: string, entries: string[], emptyText: string): string {
  if (!entries.length) {
    return `<div class="entity-preview-empty">${escapeHtml(emptyText)}</div>`;
  }

  return `<div class="entity-preview-list"><h5>${escapeHtml(title)}</h5><ul>${entries.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul></div>`;
}

function resetEntityMediaPreview(message = 'Load an entity to fetch a live visual reference.'): void {
  dbState.entityMediaKey = null;
  dbState.entityMediaPreview = null;
  dbState.entityMediaStatus = 'idle';
  dbState.entityMediaMessage = message;
}

function getEntityMediaKey(entityType: string): string | null {
  const primaryId = getEntityPrimaryId();
  if (!primaryId) return null;
  if (!['item', 'creature', 'quest', 'gameobject'].includes(entityType)) return null;
  return `${entityType}:${primaryId}`;
}

function getEntityMediaDisplayIds(entityType: string, entity: Record<string, unknown>): number[] {
  if (entityType === 'item') {
    const displayId = toNumber(entity.displayid);
    return displayId > 0 ? [displayId] : [];
  }

  if (entityType === 'creature') {
    return ['modelid1', 'modelid2', 'modelid3', 'modelid4']
      .map((field) => toNumber(entity[field]))
      .filter((value) => value > 0);
  }

  return [];
}

function buildEntityMediaCard(): string {
  const preview = dbState.entityMediaPreview;

  if (dbState.entityMediaStatus === 'loading') {
    return `<div class="entity-preview-media-card is-loading"><div class="entity-preview-media-copy"><h5>Visual Reference</h5><p>${escapeHtml(dbState.entityMediaMessage || 'Fetching live reference media…')}</p></div></div>`;
  }

  if (dbState.entityMediaStatus === 'ready' && preview?.imageUrl) {
    return `
      <div class="entity-preview-media-card">
        <div class="entity-preview-media-frame">
          <img src="${escapeHtml(preview.imageUrl)}" alt="${escapeHtml(preview.title || 'Entity visual reference')}" loading="lazy" referrerpolicy="no-referrer" />
        </div>
        <div class="entity-preview-media-copy">
          <h5>${escapeHtml(preview.sourceLabel)}</h5>
          ${preview.title ? `<strong>${escapeHtml(preview.title)}</strong>` : ''}
          ${preview.summary ? `<p>${escapeHtml(preview.summary)}</p>` : ''}
        </div>
      </div>`;
  }

  if (dbState.entityMediaStatus === 'error' || dbState.entityMediaStatus === 'unsupported') {
    const toneClass = dbState.entityMediaStatus === 'error' ? 'is-error' : '';
    return `<div class="entity-preview-media-card ${toneClass}"><div class="entity-preview-media-copy"><h5>Visual Reference</h5><p>${escapeHtml(dbState.entityMediaMessage || 'No live visual reference is available for this entity yet.')}</p></div></div>`;
  }

  return '';
}

function requestEntityMediaPreview(entityType: string, entity: Record<string, unknown>): void {
  const key = getEntityMediaKey(entityType);
  if (!key) {
    resetEntityMediaPreview('Save or load an existing entity to fetch a live visual reference.');
    return;
  }

  if (dbState.entityMediaKey === key && ['loading', 'ready', 'unsupported', 'error'].includes(dbState.entityMediaStatus)) {
    return;
  }

  const entityId = getEntityPrimaryId();
  if (!entityId) {
    resetEntityMediaPreview('Save or load an existing entity to fetch a live visual reference.');
    return;
  }

  dbState.entityMediaKey = key;
  dbState.entityMediaPreview = null;
  dbState.entityMediaStatus = 'loading';
  dbState.entityMediaMessage = 'Fetching live reference media…';
  const token = ++dbState.entityMediaToken;

  void window.electronAPI.app.getEntityMediaPreview({
    entityType,
    id: entityId,
    displayIds: getEntityMediaDisplayIds(entityType, entity),
  }).then((result) => {
    if (token !== dbState.entityMediaToken || dbState.entityMediaKey !== key) return;
    dbState.entityMediaPreview = result;
    dbState.entityMediaStatus = result.status;
    dbState.entityMediaMessage = result.message;
    updateEntityPreview();
  }).catch((error) => {
    if (token !== dbState.entityMediaToken || dbState.entityMediaKey !== key) return;
    dbState.entityMediaPreview = null;
    dbState.entityMediaStatus = 'error';
    dbState.entityMediaMessage = error instanceof Error ? error.message : String(error);
    updateEntityPreview();
  });
}

function buildItemPreview(entity: Record<string, unknown>): string {
  const quality = getItemQualityMeta(entity.Quality);
  const name = String(entity.name || 'Unnamed Item');
  const itemLevel = toNumber(entity.ItemLevel);
  const requiredLevel = toNumber(entity.RequiredLevel);
  const itemClass = ITEM_CLASS_LABELS[toNumber(entity.class)] ?? `Class ${toNumber(entity.class)}`;
  const subclass = toNumber(entity.subclass);
  const displayId = String(entity.displayid ?? '—');
  const buyCount = toNumber(entity.BuyCount, 1);
  const stackable = toNumber(entity.stackable);
  const maxCount = toNumber(entity.maxcount);
  const containerSlots = toNumber(entity.ContainerSlots);
  const bonding = toNumber(entity.bonding);
  const stats = Array.from({ length: 10 }, (_, index) => index + 1)
    .map((slot) => {
      const type = toNumber(entity[`stat_type${slot}`]);
      const value = toNumber(entity[`stat_value${slot}`]);
      if (!type || !value) return null;
      return `${value > 0 ? '+' : ''}${value} ${ITEM_STAT_LABELS[type] ?? `Stat ${type}`}`;
    })
    .filter((line): line is string => Boolean(line));
  const damageMin = toNumber(entity.dmg_min1);
  const damageMax = toNumber(entity.dmg_max1);
  const armor = toNumber(entity.armor);
  const resistances = [
    ['Holy', entity.holy_res],
    ['Fire', entity.fire_res],
    ['Nature', entity.nature_res],
    ['Frost', entity.frost_res],
    ['Shadow', entity.shadow_res],
    ['Arcane', entity.arcane_res],
  ]
    .map(([label, value]) => ({ label, value: toNumber(value) }))
    .filter((entry) => entry.value !== 0)
    .map((entry) => `${entry.value > 0 ? '+' : ''}${entry.value} ${entry.label} Resistance`);
  const sockets = [1, 2, 3]
    .map((slot) => {
      const color = toNumber(entity[`socketColor_${slot}`]);
      const content = toNumber(entity[`socketContent_${slot}`]);
      if (!color && !content) return null;
      return `Socket ${slot}: Color ${color || '—'} · Content ${content || 'empty'}`;
    })
    .filter((entry): entry is string => Boolean(entry));
  const spells = [1, 2, 3, 4, 5]
    .map((slot) => {
      const spellId = toNumber(entity[`spellid_${slot}`]);
      if (!spellId) return null;
      const trigger = toNumber(entity[`spelltrigger_${slot}`]);
      const charges = toNumber(entity[`spellcharges_${slot}`]);
      const cooldown = toNumber(entity[`spellcooldown_${slot}`]);
      return `Spell ${spellId} · Trigger ${trigger}${charges ? ` · Charges ${charges}` : ''}${cooldown > 0 ? ` · Cooldown ${cooldown}ms` : ''}`;
    })
    .filter((entry): entry is string => Boolean(entry));
  const usageNotes = [
    `Buy Count ${buyCount || 1}`,
    stackable ? `Stackable ${stackable}` : null,
    maxCount > 0 ? `Unique Max ${maxCount}` : null,
    containerSlots > 0 ? `${containerSlots} container slots` : null,
    bonding > 0 ? `Bonding ${bonding}` : null,
  ].filter((entry): entry is string => Boolean(entry));

  return `
    <div class="entity-preview-stage ${quality.cssClass}">
      <div class="entity-preview-eyebrow">Item Template • #${escapeHtml(String(entity.entry ?? 'new'))}</div>
      <div class="entity-preview-title" style="color:${quality.color}">${escapeHtml(name)}</div>
      <div class="entity-preview-subtitle">${escapeHtml(quality.label)} · ${escapeHtml(itemClass)} · Subclass ${subclass}</div>
      ${buildEntityMediaCard()}
      <div class="entity-preview-stat-grid">
        ${buildPreviewStat('Item Level', String(itemLevel || '—'), 'accent')}
        ${buildPreviewStat('Required Level', String(requiredLevel || '—'))}
        ${buildPreviewStat('Buy', formatCopper(entity.BuyPrice))}
        ${buildPreviewStat('Sell', formatCopper(entity.SellPrice))}
      </div>
      <div class="entity-preview-chip-row">
        ${buildPreviewChip(`DisplayID ${displayId}`, 'accent')}
        ${armor ? buildPreviewChip(`${armor} Armor`) : ''}
        ${damageMin || damageMax ? buildPreviewChip(`${damageMin.toFixed(0)}-${damageMax.toFixed(0)} Damage`) : ''}
        ${usageNotes.map((note) => buildPreviewChip(note)).join('')}
      </div>
      <div class="entity-preview-list-grid">
        ${buildPreviewList('Primary Stats', stats.slice(0, 10), 'No primary stats configured yet.')}
        ${buildPreviewList('Resistances', resistances, 'No resistances configured.')}
        ${buildPreviewList('Sockets', sockets, 'No sockets configured.')}
        ${buildPreviewList('Embedded Spells', spells, 'No embedded spells configured.')}
      </div>
      <div class="entity-preview-model-note">Visual / model note: the full in-app 3D item model viewer is not embedded yet, but the item row, DisplayID, and all editable fields are loaded into the editor below.</div>
      ${renderPreviewLinks('item', entity)}
    </div>`;
}

function buildCreaturePreview(entity: Record<string, unknown>): string {
  const entry = String(entity.entry ?? 'new');
  const name = String(entity.name || 'Unnamed Creature');
  const subname = String(entity.subname || '').trim();
  const levelRange = `${toNumber(entity.minlevel) || 0}-${toNumber(entity.maxlevel) || 0}`;
  const rank = CREATURE_RANK_LABELS[toNumber(entity.rank)] ?? `Rank ${toNumber(entity.rank)}`;
  const type = CREATURE_TYPE_LABELS[toNumber(entity.type)] ?? `Type ${toNumber(entity.type)}`;
  const modelIds = ['modelid1', 'modelid2', 'modelid3', 'modelid4']
    .map((field) => toNumber(entity[field]))
    .filter((value) => value > 0);
  const interactionFlags = summarizeFlags('npcflag', entity.npcflag, 4);
  const combatFlags = summarizeFlags('unit_flags', entity.unit_flags, 3);

  return `
    <div class="entity-preview-stage creature-preview">
      <div class="entity-preview-eyebrow">Creature Template • #${escapeHtml(entry)}</div>
      <div class="entity-preview-title">${escapeHtml(name)}</div>
      <div class="entity-preview-subtitle">${escapeHtml(subname || 'No subname')} · ${escapeHtml(type)} · ${escapeHtml(rank)}</div>
      ${buildEntityMediaCard()}
      <div class="entity-preview-stat-grid">
        ${buildPreviewStat('Level Range', levelRange, 'accent')}
        ${buildPreviewStat('Faction', String(entity.faction ?? '—'))}
        ${buildPreviewStat('Scale', String(entity.scale ?? '1'))}
        ${buildPreviewStat('AI', String(entity.AIName || 'Default'))}
      </div>
      <div class="entity-preview-chip-row">
        ${modelIds.length ? modelIds.map((modelId) => buildPreviewChip(`Model ${modelId}`, 'accent')).join('') : buildPreviewChip('No model IDs set')}
      </div>
      ${(interactionFlags.length || combatFlags.length)
        ? `<div class="entity-preview-list"><h5>Flags</h5><div class="entity-preview-chip-row">${interactionFlags.map((flag) => buildPreviewChip(flag, 'good')).join('')}${combatFlags.map((flag) => buildPreviewChip(flag)).join('')}</div></div>`
        : '<div class="entity-preview-empty">No notable flags detected.</div>'}
      ${renderPreviewLinks('creature', entity)}
    </div>`;
}

function buildQuestPreview(entity: Record<string, unknown>): string {
  const flags = summarizeFlags('Flags', entity.Flags, 5);
  const rewardMoney = formatCopper(entity.RewardMoney);
  const title = String(entity.LogTitle || 'Untitled Quest');
  const desc = String(entity.QuestDescription || entity.LogDescription || '').trim();

  return `
    <div class="entity-preview-stage quest-preview">
      <div class="entity-preview-eyebrow">Quest • #${escapeHtml(String(entity.ID ?? 'new'))}</div>
      <div class="entity-preview-title">${escapeHtml(title)}</div>
      <div class="entity-preview-subtitle">Level ${escapeHtml(String(entity.QuestLevel ?? '—'))} · Min ${escapeHtml(String(entity.MinLevel ?? '—'))}</div>
      ${buildEntityMediaCard()}
      <div class="entity-preview-stat-grid">
        ${buildPreviewStat('XP Tier', String(entity.RewardXPDifficulty ?? '—'), 'accent')}
        ${buildPreviewStat('Money', rewardMoney)}
        ${buildPreviewStat('Quest Type', String(entity.QuestType ?? '—'))}
        ${buildPreviewStat('Suggested Group', String(entity.SuggestedGroupNum ?? '—'))}
      </div>
      ${flags.length ? `<div class="entity-preview-chip-row">${flags.map((flag) => buildPreviewChip(flag, 'accent')).join('')}</div>` : ''}
      ${desc ? `<div class="entity-preview-description">${escapeHtml(desc.slice(0, 260))}${desc.length > 260 ? '…' : ''}</div>` : '<div class="entity-preview-empty">No quest description text yet.</div>'}
      ${renderPreviewLinks('quest', entity)}
    </div>`;
}

function buildGenericPreview(entityType: string, entity: Record<string, unknown>): string {
  const title = String(entity.name || entity.LogTitle || entity.SpellName || `New ${entityType}`);
  const id = getEntityPrimaryId() ?? 'new';
  const filledFields = Object.values(entity).filter((value) => value !== null && value !== undefined && value !== '').length;

  return `
    <div class="entity-preview-stage generic-preview">
      <div class="entity-preview-eyebrow">${escapeHtml(entityType)} • #${escapeHtml(id)}</div>
      <div class="entity-preview-title">${escapeHtml(title)}</div>
      ${buildEntityMediaCard()}
      <div class="entity-preview-stat-grid">
        ${buildPreviewStat('Fields Set', String(filledFields), 'accent')}
        ${buildPreviewStat('Pending Changes', String(Object.keys(dbState.entityCurrentData ?? {}).filter((key) => String(dbState.entityCurrentData?.[key] ?? '') !== String(dbState.entityOriginalData?.[key] ?? '')).length))}
      </div>
      ${renderPreviewLinks(entityType, entity)}
    </div>`;
}

function updateEntityPreview(): void {
  if (!$entityPreviewContent) return;

  const entity = dbState.entityCurrentData;
  const entityType = $entityType?.value || 'creature';
  if (!entity) {
    resetEntityMediaPreview();
    $entityPreviewContent.innerHTML = '<p class="text-dark-text-muted text-sm p-4">Load an entity to see a live preview, quality colors, and quick lookup links.</p>';
    return;
  }

  requestEntityMediaPreview(entityType, entity);

  switch (entityType) {
    case 'item':
      $entityPreviewContent.innerHTML = buildItemPreview(entity);
      break;
    case 'creature':
      $entityPreviewContent.innerHTML = buildCreaturePreview(entity);
      break;
    case 'quest':
      $entityPreviewContent.innerHTML = buildQuestPreview(entity);
      break;
    default:
      $entityPreviewContent.innerHTML = buildGenericPreview(entityType, entity);
      break;
  }
}

function renderRelatedSection(title: string, rows: Record<string, unknown>[], emptyText: string, variant = ''): string {
  if (!rows.length) {
    return `<section class="entity-related-section"><div class="entity-related-header"><h5>${escapeHtml(title)}</h5></div><div class="entity-related-empty">${escapeHtml(emptyText)}</div></section>`;
  }

  const columns = Object.keys(rows[0]).filter((column) => !/^_load[A-Z]/.test(column));
  return `
    <section class="entity-related-section ${variant}">
      <div class="entity-related-header"><h5>${escapeHtml(title)}</h5><span>${rows.length} row${rows.length === 1 ? '' : 's'}</span></div>
      <div class="entity-related-table-wrap">
        <table class="entity-related-table">
          <thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}<th>Action</th></tr></thead>
          <tbody>
            ${rows.map((row) => {
              const groupId = toNumber(row.GroupId ?? row.groupid ?? 0);
              const isReference = toNumber(row.Reference ?? row.reference ?? 0) > 0;
              const loadType = row._loadEntityType ? String(row._loadEntityType) : '';
              const loadId = row._loadEntityId ? String(row._loadEntityId) : '';
              return `<tr class="${groupId ? 'loot-group' : ''} ${isReference ? 'loot-reference' : ''}">${columns.map((column) => {
                const value = row[column];
                const display = value === null || value === undefined || value === '' ? '—' : String(value);
                const isNameColumn = /name|title/i.test(column);
                const qualityMeta = /quality/i.test(column) ? getItemQualityMeta(value) : row.Quality !== undefined && /ItemName/i.test(column) ? getItemQualityMeta(row.Quality) : null;
                const style = qualityMeta ? ` style="color:${qualityMeta.color}"` : '';
                return `<td class="${isNameColumn ? 'entity-related-name' : ''}"${style}>${escapeHtml(display)}</td>`;
              }).join('')}<td>${loadType && loadId ? `<div class="entity-related-actions"><button type="button" class="entity-related-load" data-load-entity-type="${escapeHtml(loadType)}" data-load-entity-id="${escapeHtml(loadId)}">Load</button></div>` : '—'}</td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </section>`;
}

async function loadEntityRelations(): Promise<void> {
  if (!$entityRelationsContent) return;

  const entity = dbState.entityCurrentData;
  const entityType = $entityType?.value || 'creature';
  const entityId = getEntityPrimaryId();
  const renderVersion = ++dbState.entityRenderVersion;

  if (!dbState.connected || !entity || !entityId || dbState.entityIsNew) {
    $entityRelationsContent.innerHTML = '<p class="text-dark-text-muted text-sm p-4">Linked vendors, loot, scripts, and rewards will show up here when available.</p>';
    return;
  }

  $entityRelationsContent.innerHTML = '<p class="text-dark-text-muted text-sm p-4">Loading related data…</p>';

  const sections: string[] = [];

  try {
    if (entityType === 'creature') {
      const [vendorRows, lootRows, saiRows] = await Promise.all([
        window.electronAPI.db.query<Record<string, unknown>>("SELECT nv.item, it.name AS ItemName, it.Quality, nv.maxcount, nv.incrtime, nv.ExtendedCost, 'item' AS _loadEntityType, nv.item AS _loadEntityId FROM `npc_vendor` nv LEFT JOIN `item_template` it ON it.entry = nv.item WHERE nv.`entry` = ? ORDER BY nv.`item` LIMIT 25", [entityId]),
        window.electronAPI.db.query<Record<string, unknown>>("SELECT clt.Item, it.name AS ItemName, it.Quality, clt.ChanceOrQuestChance, clt.GroupId, clt.MinCount, clt.MaxCount, clt.Reference, 'item' AS _loadEntityType, clt.Item AS _loadEntityId FROM `creature_loot_template` clt LEFT JOIN `item_template` it ON it.entry = clt.Item WHERE clt.`Entry` = ? ORDER BY clt.`GroupId`, clt.`Item` LIMIT 25", [entityId]),
        window.electronAPI.db.query<Record<string, unknown>>('SELECT id, event_type, action_type, target_type, comment FROM `smart_scripts` WHERE `entryorguid` = ? ORDER BY `id` LIMIT 20', [entityId]),
      ]);

      sections.push(
        renderRelatedSection('Vendor Items', vendorRows.rows || [], 'This creature is not selling anything yet.'),
        renderRelatedSection('Creature Loot', lootRows.rows || [], 'No creature loot rows found for this entry.', 'loot'),
        renderRelatedSection('SmartAI Rows', saiRows.rows || [], 'No SmartAI rows found for this creature.'),
      );
    } else if (entityType === 'item') {
      const [vendorRows, lootRows, rewardRows] = await Promise.all([
        window.electronAPI.db.query<Record<string, unknown>>("SELECT nv.entry, ct.name AS CreatureName, nv.maxcount, nv.incrtime, nv.ExtendedCost, 'creature' AS _loadEntityType, nv.entry AS _loadEntityId FROM `npc_vendor` nv LEFT JOIN `creature_template` ct ON ct.entry = nv.entry WHERE nv.`item` = ? ORDER BY nv.`entry` LIMIT 25", [entityId]),
        window.electronAPI.db.query<Record<string, unknown>>("SELECT clt.`Entry`, ct.name AS CreatureName, clt.ChanceOrQuestChance, clt.GroupId, clt.MinCount, clt.MaxCount, clt.Reference, 'creature' AS _loadEntityType, clt.`Entry` AS _loadEntityId FROM `creature_loot_template` clt LEFT JOIN `creature_template` ct ON ct.entry = clt.`Entry` WHERE clt.`Item` = ? ORDER BY clt.`Entry` LIMIT 25", [entityId]),
        window.electronAPI.db.query<Record<string, unknown>>("SELECT ID, LogTitle, QuestLevel, 'quest' AS _loadEntityType, ID AS _loadEntityId FROM `quest_template` WHERE RewardItem1 = ? OR RewardItem2 = ? OR RewardItem3 = ? OR RewardItem4 = ? OR RewardChoiceItemId1 = ? OR RewardChoiceItemId2 = ? OR RewardChoiceItemId3 = ? OR RewardChoiceItemId4 = ? OR RewardChoiceItemId5 = ? OR RewardChoiceItemId6 = ? LIMIT 25", [entityId, entityId, entityId, entityId, entityId, entityId, entityId, entityId, entityId, entityId]),
      ]);

      sections.push(
        renderRelatedSection('Sold By Vendors', vendorRows.rows || [], 'No vendor rows are using this item.'),
        renderRelatedSection('Dropped By Creatures', lootRows.rows || [], 'No creature loot rows are using this item.', 'loot'),
        renderRelatedSection('Quest Rewards', rewardRows.rows || [], 'No quests reward this item.'),
      );
    } else if (entityType === 'quest') {
      const [starterRows, enderRows] = await Promise.all([
        window.electronAPI.db.query<Record<string, unknown>>("SELECT cqs.id, ct.name AS CreatureName, 'creature' AS _loadEntityType, cqs.id AS _loadEntityId FROM `creature_queststarter` cqs LEFT JOIN `creature_template` ct ON ct.entry = cqs.id WHERE cqs.`quest` = ? LIMIT 25", [entityId]),
        window.electronAPI.db.query<Record<string, unknown>>("SELECT cqe.id, ct.name AS CreatureName, 'creature' AS _loadEntityType, cqe.id AS _loadEntityId FROM `creature_questender` cqe LEFT JOIN `creature_template` ct ON ct.entry = cqe.id WHERE cqe.`quest` = ? LIMIT 25", [entityId]),
      ]);

      sections.push(
        renderRelatedSection('Quest Starters', starterRows.rows || [], 'No creature quest starters found.'),
        renderRelatedSection('Quest Enders', enderRows.rows || [], 'No creature quest enders found.'),
      );
    } else {
      sections.push(renderRelatedSection('Entity Context', [], 'No related-data presets yet for this editor.'));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sections.length = 0;
    sections.push(`<section class="entity-related-section"><div class="entity-related-empty">Unable to load related data: ${escapeHtml(message)}</div></section>`);
  }

  if (renderVersion !== dbState.entityRenderVersion) return;
  $entityRelationsContent.innerHTML = sections.join('');
}
$entityPreviewContent?.addEventListener('click', async (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-preview-url]');
  if (!target) return;

  const url = target.dataset.previewUrl;
  if (!url) return;

  target.disabled = true;
  const originalLabel = target.textContent;
  const result = await window.electronAPI.app.openExternal(url);
  target.textContent = result.success ? 'Opened ✓' : 'Open failed';
  setTimeout(() => {
    target.textContent = originalLabel;
    target.disabled = false;
  }, 1400);
});

$entityRelationsContent?.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-load-entity-type][data-load-entity-id]');
  if (!button) return;
  const entityType = button.dataset.loadEntityType;
  const entityId = button.dataset.loadEntityId;
  if (!entityType || !entityId) return;
  setEntitySelection(entityType, entityId);
});

// ── SmartAI type lookup maps ───────────────────────────────────────────────
const SAI_EVENT: Record<number, string> = {
  0:'UPDATE_IC',1:'UPDATE_OOC',2:'HEALTH_PCT',3:'MANA_PCT',4:'AGGRO',
  5:'KILL',6:'DEATH',7:'EVADE',8:'SPELLHIT',9:'RANGE',10:'OOC_LOS',
  11:'RESPAWN',12:'TARGET_HEALTH_PCT',13:'VICTIM_CASTING',14:'FRIENDLY_HEALTH',
  15:'FRIENDLY_IS_CC',16:'FRIENDLY_MISSING_BUFF',17:'SUMMONED_UNIT',
  18:'TARGET_MANA_PCT',19:'ACCEPTED_QUEST',20:'REWARD_QUEST',21:'REACHED_HOME',
  22:'RECEIVE_EMOTE',23:'HAS_AURA',24:'TARGET_BUFFED',25:'RESET',26:'IC_LOS',
  27:'PASSENGER_BOARDED',28:'PASSENGER_REMOVED',29:'CHARMED',30:'CHARMED_TARGET',
  31:'SPELLHIT_TARGET',32:'DAMAGED',33:'DAMAGED_TARGET',34:'MOVEMENTINFORM',
  35:'SUMMON_DESPAWNED',36:'CORPSE_REMOVED',37:'AI_INIT',38:'DATA_SET',
  39:'WAYPOINT_START',40:'WAYPOINT_REACHED',41:'TRANSPORT_ADDPLAYER',
  42:'TRANSPORT_REMOVEPLAYER',44:'TEXT_OVER',45:'TIMER_IN_COMBAT',
  46:'TIMER_OUT_OF_COMBAT',47:'TIMER_RANDOM',48:'TIMER_RANDOM_OOC',
  49:'LINK',50:'GOSSIP_SELECT',51:'JUST_CREATED',52:'GOSSIP_HELLO',
  53:'FOLLOW_COMPLETED',54:'EVENT_PHASE_CHANGE',55:'IS_BEHIND_TARGET',
  56:'GAME_EVENT_START',57:'GAME_EVENT_END',58:'GO_STATE_CHANGED',
  59:'GO_EVENT_INFORM',60:'ACTION_DONE',61:'ON_SPELLCLICK',
  62:'FRIENDLY_HEALTH_PCT',63:'DISTANCE_CREATURE',64:'DISTANCE_GAMEOBJECT',
  65:'COUNTER_SET',73:'ON_DESPAWN',74:'NEW_TARGET',75:'PATH_ENDED',
};
const SAI_ACTION: Record<number, string> = {
  0:'NONE',1:'TALK',2:'SET_FACTION',3:'MORPH_TO_ENTRY',4:'SOUND',5:'EMOTE',
  6:'FAIL_QUEST',7:'OFFER_QUEST',8:'SET_REACT_STATE',9:'ACTIVATE_GOBJECT',
  10:'RANDOM_EMOTE',11:'CAST',12:'SUMMON_CREATURE',13:'THREAT_SINGLE_PCT',
  14:'THREAT_ALL_PCT',15:'CALL_AREA_EXPLORED',16:'SET_INGAME_PHASE',
  17:'SET_EMOTE_STATE',18:'SET_UNIT_FLAG',19:'REMOVE_UNIT_FLAG',
  20:'AUTO_ATTACK',21:'ALLOW_COMBAT_MOVEMENT',22:'SET_EVENT_PHASE',
  23:'INC_EVENT_PHASE',24:'EVADE',25:'FLEE_FOR_ASSIST',26:'CALL_GROUPEVENT',
  27:'COMBAT_STOP',28:'REMOVE_AURAS',29:'FOLLOW',30:'RANDOM_PHASE',
  31:'RANDOM_PHASE_RANGE',32:'RESET_GOBJECT',33:'CALL_KILLEDMONSTER',
  34:'SET_INST_DATA',35:'SET_INST_DATA64',36:'UPDATE_TEMPLATE',37:'DIE',
  38:'IN_COMBAT_WITH_ZONE',39:'CALL_FOR_HELP',40:'SET_SHEATH',41:'FORCE_DESPAWN',
  42:'SET_INVINCIBILITY_HP',43:'MOUNT',44:'TRACK_UNITFIELD',45:'LEASH',
  46:'CALL_TIMEEVENTID',47:'WEATHER',48:'SET_HOVER',49:'DESPAWN_TARGET',
  50:'SET_EQUIPMENT_SLOTS',53:'EXIT_VEHICLE',54:'SET_MOVEMENT_FLAGS',
  55:'MOVE_TO_POS',56:'RESPAWN_TARGET',57:'CLOSE_GOSSIP',58:'TRIGGER_TIMED_EVENT',
  60:'ACTIVATE_TAXI',61:'RANDOM_MOVE',64:'SEND_GO_CUSTOM_ANIM',
  65:'SET_DYNAMIC_FLAG',66:'ADD_DYNAMIC_FLAG',67:'REMOVE_DYNAMIC_FLAG',
  68:'JUMP_TO_POS',69:'SEND_GOSSIP_MENU',70:'GO_STATE',72:'SET_HOME_POS',
  73:'SET_HEALTH_REGEN',74:'SET_ROOT',75:'SET_GO_FLAG',76:'ADD_GO_FLAG',
  77:'REMOVE_GO_FLAG',79:'SET_POWER',82:'START_CLOSEST_WAYPOINT',
  88:'REMOVE_ALL_GAMEOBJECTS',89:'PAUSE_MOVEMENT',96:'INVOKER_CAST',
  97:'CHASE_TARGET',99:'PLAYER_TALK',
};
const SAI_TARGET: Record<number, string> = {
  0:'NONE',1:'SELF',2:'VICTIM',3:'HOSTILE_SECOND_AGGRO',4:'HOSTILE_LAST_AGGRO',
  5:'HOSTILE_RANDOM',6:'HOSTILE_RANDOM_NOT_TOP',7:'ACTION_INVOKER',
  8:'POSITION',9:'CREATURE_RANGE',10:'CREATURE_GUID',11:'CREATURE_DISTANCE',
  12:'STORED',13:'GAMEOBJECT_RANGE',14:'GAMEOBJECT_GUID',15:'GAMEOBJECT_DISTANCE',
  16:'INVOKER_PARTY',17:'PLAYER_RANGE',18:'PLAYER_DISTANCE',
  19:'CLOSEST_CREATURE',20:'CLOSEST_GAMEOBJECT',21:'CLOSEST_PLAYER',
  22:'INVOKER_VEHICLE',23:'OWNER_OR_SUMMONER',24:'THREAT_LIST',
  25:'CLOSEST_FRIENDLY',26:'CLOSEST_ENEMY',27:'SUMMONED_CREATURES',
  28:'FARTHEST',29:'VEHICLE_PASSENGER',
};

// ── Entity Search ───────────────────────────────────────────────────────────
const debouncedEntitySearch = debounce(async () => {
  const term = $entitySearch?.value.trim();
  if (!term || !dbState.connected) {
    $entitySearchResults?.classList.add('hidden');
    return;
  }
  const entityType = $entityType?.value || 'creature';
  const config = ENTITY_TABLES[entityType];
  if (!config) return;

  try {
    const result = await window.electronAPI.db.query(
      `SELECT \`${config.primaryKey}\`, \`${config.nameField}\` FROM \`${config.table}\` WHERE \`${config.nameField}\` LIKE ? ORDER BY \`${config.nameField}\` LIMIT 25`,
      [`%${term}%`]
    );
    const rows = result.rows || [];
    if (!rows.length) {
      $entitySearchResults!.innerHTML = '<div class="entity-search-item"><span class="esi-name" style="color:var(--text-muted)">No results found</span></div>';
    } else {
      $entitySearchResults!.innerHTML = rows.map(row => {
        const r = row as Record<string, unknown>;
        const id = r[config.primaryKey];
        const name = r[config.nameField];
        return `<div class="entity-search-item" data-id="${escapeHtml(String(id))}"><span class="esi-id">[${id}]</span><span class="esi-name">${escapeHtml(String(name ?? ''))}</span></div>`;
      }).join('');
      $entitySearchResults!.querySelectorAll<HTMLElement>('.entity-search-item[data-id]').forEach(item => {
        item.addEventListener('click', () => {
          const id = item.dataset.id;
          if ($entityId && id) $entityId.value = id;
          if ($entitySearch) $entitySearch.value = '';
          $entitySearchResults?.classList.add('hidden');
          loadEntityById();
        });
      });
    }
    $entitySearchResults?.classList.remove('hidden');
  } catch (err) {
    console.error('Entity search error:', err);
  }
}, 300);

$entitySearch?.addEventListener('input', debouncedEntitySearch);
$entitySearch?.addEventListener('focus', () => { if ($entitySearch!.value.trim()) debouncedEntitySearch(); });
document.addEventListener('click', (e: MouseEvent) => {
  if (!$entitySearch?.contains(e.target as Node) && !$entitySearchResults?.contains(e.target as Node)) {
    $entitySearchResults?.classList.add('hidden');
  }
});

// ── SQL Generation ──────────────────────────────────────────────────────────
function generateEntitySQL(mode: 'diff' | 'full'): string {
  const current = dbState.entityCurrentData;
  const original = dbState.entityOriginalData;
  const entityType = $entityType?.value || 'creature';
  const cfg = ENTITY_TABLES[entityType];
  if (!current || !cfg) return '-- No entity loaded';

  const table = cfg.table;
  const pk = cfg.primaryKey;

  const sqlVal = (v: unknown): string => {
    if (v === null || v === undefined || String(v) === '') return 'NULL';
    const s = String(v);
    if (/^-?\d+(\.\d+)?$/.test(s)) return s;
    return `'${s.replace(/\\/g,'\\\\').replace(/'/g,"''")}'`;
  };

  if (dbState.entityIsNew || mode === 'full') {
    const cols = Object.keys(current).map(k => `\`${k}\``).join(', ');
    const vals = Object.values(current).map(sqlVal).join(',\n  ');
    return `INSERT INTO \`${table}\` (\n  ${cols.replace(/, /g,',\n  ')}\n) VALUES (\n  ${vals}\n);`;
  }

  // Diff UPDATE
  if (!original) return '-- No original data for diff';
  const changed = Object.keys(current).filter(k => k !== pk && String(current[k]) !== String(original[k]));
  if (!changed.length) return '-- No changes detected';

  const sets = changed.map(k => `  \`${k}\` = ${sqlVal(current[k])}`).join(',\n');
  const pkVal = sqlVal(original[pk]);
  return `UPDATE \`${table}\`\nSET\n${sets}\nWHERE \`${pk}\` = ${pkVal};`;
}

function updateSQLPanel(): void {
  if (!$entitySqlCode) return;
  $entitySqlCode.textContent = generateEntitySQL(dbState.entitySqlMode);
}

// SQL tab switching
document.querySelectorAll<HTMLButtonElement>('.entity-sql-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.entity-sql-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    dbState.entitySqlMode = (btn.dataset.sqltab || 'diff') as 'diff' | 'full';
    updateSQLPanel();
  });
});

// Copy SQL
$entityCopySqlBtn?.addEventListener('click', () => {
  const sql = generateEntitySQL(dbState.entitySqlMode);
  navigator.clipboard.writeText(sql).then(() => {
    const orig = $entityCopySqlBtn.textContent;
    $entityCopySqlBtn.textContent = '✓ Copied!';
    setTimeout(() => { $entityCopySqlBtn.textContent = orig; }, 1800);
  });
});

// Execute SQL
$entityApplySqlBtn?.addEventListener('click', async () => {
  const sql = generateEntitySQL(dbState.entitySqlMode);
  if (!sql || sql.startsWith('--') || !dbState.connected) return;
  try {
    $entityApplySqlBtn!.disabled = true;
    await window.electronAPI.db.execute(sql);
    const orig = $entityApplySqlBtn!.textContent;
    $entityApplySqlBtn!.textContent = '✓ Applied!';
    setTimeout(() => {
      $entityApplySqlBtn!.textContent = orig;
      $entityApplySqlBtn!.disabled = false;
    }, 2000);
    // Refresh original data
    if (dbState.entityCurrentData) {
      dbState.entityOriginalData = { ...dbState.entityCurrentData };
      updateSQLPanel();
      $entityEditorContent?.querySelectorAll('.entity-field-dirty').forEach((el) => el.classList.remove('entity-field-dirty'));
      $entityEditorContent?.querySelectorAll('.is-dirty').forEach((el) => el.classList.remove('is-dirty'));
      updateEntityPreview();
      void loadEntityRelations();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    alert(`SQL Error: ${msg}`);
    $entityApplySqlBtn!.disabled = false;
  }
});

// ── Flags Selector ──────────────────────────────────────────────────────────
function openFlagsSelector(fieldName: string, inputEl: HTMLInputElement): void {
  const defs = FLAG_DEFS[fieldName];
  if (!defs || !$flagsOverlay || !$flagsGrid) return;

  dbState.flagsFieldName = fieldName;
  dbState.flagsInputEl = inputEl;

  const currentVal = parseInt(inputEl.value || '0', 10) || 0;

  const titleEl = document.getElementById('flags-dialog-title-text');
  const valEl = document.getElementById('flags-current-val');
  if (titleEl) titleEl.textContent = `Flags: ${fieldName}`;
  if (valEl) valEl.textContent = String(currentVal);

  $flagsGrid.innerHTML = defs.map(f => `
    <div class="flag-item">
      <input type="checkbox" id="flag_${f.bit}" ${(currentVal & f.bit) ? 'checked' : ''} data-bit="${f.bit}" />
      <label class="flag-item-label" for="flag_${f.bit}">
        <strong>${escapeHtml(f.label)}</strong>
        ${f.desc ? `<span>${escapeHtml(f.desc)}</span>` : ''}
      </label>
    </div>
  `).join('');

  // Live update displayed value
  $flagsGrid.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      let v = 0;
      $flagsGrid!.querySelectorAll<HTMLInputElement>('input:checked').forEach(c => { v |= parseInt(c.dataset.bit!); });
      if (valEl) valEl.textContent = String(v);
    });
  });

  $flagsOverlay.classList.remove('hidden');
}

$flagsApplyBtn?.addEventListener('click', () => {
  if (!$flagsGrid || !dbState.flagsInputEl) return;
  let val = 0;
  $flagsGrid.querySelectorAll<HTMLInputElement>('input:checked').forEach(cb => { val |= parseInt(cb.dataset.bit!); });
  dbState.flagsInputEl.value = String(val);
  // Trigger change tracking
  dbState.flagsInputEl.dispatchEvent(new Event('input', { bubbles: true }));
  $flagsOverlay?.classList.add('hidden');
  dbState.flagsFieldName = null;
  dbState.flagsInputEl = null;
});
$flagsCancelBtn?.addEventListener('click', () => {
  $flagsOverlay?.classList.add('hidden');
  dbState.flagsFieldName = null;
  dbState.flagsInputEl = null;
});

$selectorCloseBtn?.addEventListener('click', closeSelectorOverlay);
$selectorOverlay?.addEventListener('click', (event) => {
  if (event.target === $selectorOverlay) {
    closeSelectorOverlay();
  }
});
$selectorSearchInput?.addEventListener('input', () => {
  debouncedSelectorSearch($selectorSearchInput.value);
});
$selectorSearchInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeSelectorOverlay();
  }
});
$selectorResults?.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-selector-id]');
  if (!button) return;
  const id = button.dataset.selectorId;
  if (!id) return;
  applySelectorValue(id);
});

// ── Entity Form Rendering ───────────────────────────────────────────────────
function renderEntityEditor(entity: Record<string, unknown>, config: { table: string; primaryKey: string; nameField: string }): void {
  const entityType = $entityType?.value || '';
  dbState.entityOriginalData = { ...entity };
  dbState.entityCurrentData = { ...entity };

  const allFields = Object.keys(entity);

  // Get group config if available
  let groups: FieldGroup[] | null = null;
  if (entityType === 'creature') groups = CREATURE_GROUPS;
  else if (entityType === 'item') groups = ITEM_GROUPS;
  else if (entityType === 'quest') groups = QUEST_GROUPS;

  // SmartAI gets special handling
  if (entityType === 'smartai') {
    renderSAIEditor(entity, config);
    updateSQLPanel();
    updateEntityPreview();
    void loadEntityRelations();
    return;
  }

  // Build grouped sections or flat fallback
  let html = '';

  if (groups) {
    const handledFields = new Set<string>();

    for (const grp of groups) {
      const present = grp.fields.filter(f => allFields.includes(f));
      if (!present.length) continue;
      html += `<div class="entity-form-section"><div class="entity-group-header">${escapeHtml(grp.label)}</div><div class="entity-form-grid">`;
      for (const field of present) {
        handledFields.add(field);
        html += buildFieldHtml(field, entity[field], config);
      }
      html += `</div></div>`;
    }

    // Remaining fields
    const remaining = allFields.filter(f => !handledFields.has(f));
    if (remaining.length) {
      html += `<div class="entity-form-section"><div class="entity-group-header">Other Fields</div><div class="entity-form-grid">`;
      remaining.forEach(f => { html += buildFieldHtml(f, entity[f], config); });
      html += `</div></div>`;
    }
  } else {
    // Flat grid — split into groups of 10
    html += `<div class="entity-form-section"><div class="entity-group-header">All Fields</div><div class="entity-form-grid">`;
    allFields.forEach((field, idx) => {
      html += buildFieldHtml(field, entity[field], config);
      if (idx === 9 && allFields.length > 15) {
        html += `</div></div><div class="entity-form-section"><div class="entity-group-header">Additional Fields</div><div class="entity-form-grid">`;
      }
    });
    html += `</div></div>`;
  }

  $entityEditorContent!.innerHTML = html;

  const wireFieldChange = (field: string, rawValue: string, element: HTMLElement): void => {
    if (!dbState.entityCurrentData) return;

    const nextValue = rawValue === '' ? null : rawValue;
    const originalValue = dbState.entityOriginalData?.[field] ?? null;
    dbState.entityCurrentData[field] = nextValue;

    const isDirty = String(nextValue ?? '') !== String(originalValue ?? '');
    element.classList.toggle('is-dirty', isDirty);
    element.closest('.entity-field')?.classList.toggle('entity-field-dirty', isDirty);

    updateSQLPanel();
    updateEntityPreview();
  };

  // Wire up field change tracking + SQL update
  $entityEditorContent!.querySelectorAll<HTMLInputElement>('input[data-field]').forEach((inp) => {
    inp.addEventListener('input', () => {
      wireFieldChange(inp.dataset.field!, inp.value, inp);
    });
  });

  $entityEditorContent!.querySelectorAll<HTMLTextAreaElement>('textarea[data-field]').forEach((textarea) => {
    textarea.addEventListener('input', () => {
      wireFieldChange(textarea.dataset.field!, textarea.value, textarea);
    });
  });

  // Wire up flags buttons
  $entityEditorContent!.querySelectorAll<HTMLButtonElement>('.flags-btn[data-flags-field]').forEach(btn => {
    btn.addEventListener('click', () => {
      const fieldName = btn.dataset.flagsField!;
      const input = $entityEditorContent!.querySelector<HTMLInputElement>(`input[data-field="${fieldName}"]`);
      if (input) openFlagsSelector(fieldName, input);
    });
  });

  $entityEditorContent!.querySelectorAll<HTMLButtonElement>('.selector-btn[data-selector-field]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const fieldName = btn.dataset.selectorField!;
      const input = $entityEditorContent!.querySelector<HTMLInputElement>(`input[data-field="${fieldName}"]`);
      if (input) openSelectorOverlay(fieldName, input);
    });
  });

  updateSQLPanel();
  updateEntityPreview();
  void loadEntityRelations();
}

function buildFieldHtml(field: string, value: unknown, config: { primaryKey: string; nameField: string }): string {
  const isPK = field === config.primaryKey;
  const displayValue = value === null || value === undefined ? '' : String(value);
  const hasFlagDef = field in FLAG_DEFS;
  const selectorSpec = !isPK ? getSelectorSpec(field) : null;
  const isMultiline = typeof displayValue === 'string' && displayValue.length > 120;
  const label = field.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
  const hint = ENTITY_FIELD_HINTS[field];

  let inputHtml: string;
  if (isMultiline) {
    inputHtml = `<textarea data-field="${escapeHtml(field)}" rows="3" ${isPK ? 'readonly' : ''}>${escapeHtml(displayValue)}</textarea>`;
  } else if (hasFlagDef) {
    inputHtml = `<div class="entity-field-row">
      <input type="number" data-field="${escapeHtml(field)}" value="${escapeHtml(displayValue)}" ${isPK ? 'readonly' : ''} />
      <button type="button" class="flags-btn" data-flags-field="${escapeHtml(field)}" title="Open flags selector">Flags ⚑</button>
    </div>`;
  } else {
    inputHtml = selectorSpec
      ? `<div class="entity-field-row">
          <input type="text" data-field="${escapeHtml(field)}" value="${escapeHtml(displayValue)}" ${isPK ? 'readonly' : ''} placeholder="${value === null ? 'NULL' : ''}" />
          <button type="button" class="selector-btn" data-selector-field="${escapeHtml(field)}" title="${escapeHtml(selectorSpec.label)}">…</button>
        </div>`
      : `<input type="text" data-field="${escapeHtml(field)}" value="${escapeHtml(displayValue)}" ${isPK ? 'readonly' : ''} placeholder="${value === null ? 'NULL' : ''}" />`;
  }

  return `<div class="entity-field${isMultiline ? ' entity-field-full' : ''}">
    <label${(isPK || hint) ? ` title="${escapeHtml(isPK ? `Primary Key — read only${hint ? ` • ${hint}` : ''}` : hint || '')}"` : ''}>${escapeHtml(label)}${isPK ? ' <small style="color:var(--accent);opacity:.7">(PK)</small>' : ''}</label>
    ${inputHtml}
  </div>`;
}

// ── SmartAI Table Editor ────────────────────────────────────────────────────
function renderSAIEditor(entity: Record<string, unknown>, _config: { primaryKey: string; nameField: string }): void {
  // entity is a single row; we actually need to load all rows for this entryorguid
  // We'll show the single row first, and provide a "load all rows" embedded query
  const entryorguid = entity['entryorguid'];
  const sourceType  = entity['source_type'] ?? 0;

  const makeTypeOptions = (map: Record<number, string>, current: number): string => {
    return Object.entries(map)
      .sort((a, b) => +a[0] - +b[0])
      .map(([id, name]) => `<option value="${id}" ${+id === current ? 'selected' : ''}>${id}: ${name}</option>`)
      .join('');
  };

  const makeRow = (row: Record<string, unknown>, rowIdx: number): string => {
    const et = Number(row['event_type'] ?? 0);
    const at = Number(row['action_type'] ?? 0);
    const tt = Number(row['target_type'] ?? 0);
    const id2 = Number(row['id'] ?? 0);
    return `<tr data-row="${rowIdx}">
      <td style="min-width:30px;text-align:center;">
        <button class="sai-del-btn" data-del-row="${rowIdx}" title="Remove row">✕</button>
      </td>
      <td style="min-width:40px;"><input type="number" class="sai-id" data-row="${rowIdx}" data-col="id" value="${id2}" /></td>
      <td style="min-width:180px;">
        <select class="sai-et" data-row="${rowIdx}" data-col="event_type">${makeTypeOptions(SAI_EVENT, et)}</select>
        <div class="sai-type-badge">${SAI_EVENT[et] || `ID:${et}`}</div>
      </td>
      <td><input type="number" data-row="${rowIdx}" data-col="event_param1" value="${Number(row['event_param1']??0)}" /></td>
      <td><input type="number" data-row="${rowIdx}" data-col="event_param2" value="${Number(row['event_param2']??0)}" /></td>
      <td><input type="number" data-row="${rowIdx}" data-col="event_param3" value="${Number(row['event_param3']??0)}" /></td>
      <td><input type="number" data-row="${rowIdx}" data-col="event_param4" value="${Number(row['event_param4']??0)}" /></td>
      <td style="min-width:200px;">
        <select class="sai-at" data-row="${rowIdx}" data-col="action_type">${makeTypeOptions(SAI_ACTION, at)}</select>
        <div class="sai-type-badge">${SAI_ACTION[at] || `ID:${at}`}</div>
      </td>
      <td><input type="number" data-row="${rowIdx}" data-col="action_param1" value="${Number(row['action_param1']??0)}" /></td>
      <td><input type="number" data-row="${rowIdx}" data-col="action_param2" value="${Number(row['action_param2']??0)}" /></td>
      <td><input type="number" data-row="${rowIdx}" data-col="action_param3" value="${Number(row['action_param3']??0)}" /></td>
      <td><input type="number" data-row="${rowIdx}" data-col="action_param4" value="${Number(row['action_param4']??0)}" /></td>
      <td><input type="number" data-row="${rowIdx}" data-col="action_param5" value="${Number(row['action_param5']??0)}" /></td>
      <td><input type="number" data-row="${rowIdx}" data-col="action_param6" value="${Number(row['action_param6']??0)}" /></td>
      <td style="min-width:160px;">
        <select class="sai-tt" data-row="${rowIdx}" data-col="target_type">${makeTypeOptions(SAI_TARGET, tt)}</select>
        <div class="sai-type-badge">${SAI_TARGET[tt] || `ID:${tt}`}</div>
      </td>
      <td><input type="number" data-row="${rowIdx}" data-col="target_param1" value="${Number(row['target_param1']??0)}" /></td>
      <td><input type="number" data-row="${rowIdx}" data-col="target_param2" value="${Number(row['target_param2']??0)}" /></td>
      <td><input type="number" data-row="${rowIdx}" data-col="target_param3" value="${Number(row['target_param3']??0)}" /></td>
      <td><input type="number" data-row="${rowIdx}" data-col="event_phase_mask" value="${Number(row['event_phase_mask']??0)}" /></td>
      <td><input type="number" data-row="${rowIdx}" data-col="event_flags" value="${Number(row['event_flags']??0)}" /></td>
      <td class="sai-comment-cell">${escapeHtml(String(row['comment'] ?? ''))}</td>
    </tr>`;
  };

  const entryRows: Record<string, unknown>[] = [entity];

  const buildTable = (): string => `
    <div class="sai-toolbar">
      <button id="sai-load-all-btn" class="btn-wow">Load All Rows for EntryOrGUID ${entryorguid}</button>
      <button id="sai-add-row-btn" class="btn-wow">+ Add Row</button>
      <button id="sai-save-all-btn" class="btn-wow-success" disabled>Save All</button>
    </div>
    <div class="sai-wrapper">
      <table class="sai-table">
        <thead><tr>
          <th></th><th>ID</th>
          <th>Event Type</th><th>EP1</th><th>EP2</th><th>EP3</th><th>EP4</th>
          <th>Action Type</th><th>AP1</th><th>AP2</th><th>AP3</th><th>AP4</th><th>AP5</th><th>AP6</th>
          <th>Target Type</th><th>TP1</th><th>TP2</th><th>TP3</th>
          <th>Phase</th><th>Flags</th><th>Comment</th>
        </tr></thead>
        <tbody id="sai-tbody">
          ${entryRows.map((r, i) => makeRow(r as Record<string, unknown>, i)).join('')}
        </tbody>
      </table>
    </div>`;

  $entityEditorContent!.innerHTML = buildTable();

  const tbody = document.getElementById('sai-tbody') as HTMLElement;

  // Reload all rows
  document.getElementById('sai-load-all-btn')?.addEventListener('click', async () => {
    try {
      const res = await window.electronAPI.db.query(
        `SELECT * FROM \`smart_scripts\` WHERE \`entryorguid\` = ? AND \`source_type\` = ? ORDER BY \`id\``,
        [entryorguid, sourceType]
      );
      const rows = res.rows as Record<string, unknown>[];
      dbState.entityCurrentData = { entryorguid, source_type: sourceType, _sai_rows: rows } as unknown as Record<string, unknown>;
      dbState.entityOriginalData = JSON.parse(JSON.stringify(dbState.entityCurrentData));
      tbody.innerHTML = rows.map((r, i) => makeRow(r, i)).join('');
      wireSAIHandlers(tbody, rows);
      updateSQLPanel();
    } catch (err) {
      console.error('SAI load error:', err);
    }
  });

  // Add row
  document.getElementById('sai-add-row-btn')?.addEventListener('click', () => {
    const emptyRow: Record<string, unknown> = {
      entryorguid, source_type: sourceType, id: 0, link: 0,
      event_type: 0, event_flags: 0, event_phase_mask: 0,
      event_param1: 0, event_param2: 0, event_param3: 0, event_param4: 0,
      action_type: 0, action_param1: 0, action_param2: 0, action_param3: 0,
      action_param4: 0, action_param5: 0, action_param6: 0,
      target_type: 0, target_param1: 0, target_param2: 0, target_param3: 0,
      target_x: 0, target_y: 0, target_z: 0, target_o: 0,
      comment: '',
    };
    const idx = tbody.querySelectorAll('tr').length;
    tbody.insertAdjacentHTML('beforeend', makeRow(emptyRow, idx));
    const saveBtn = document.getElementById('sai-save-all-btn') as HTMLButtonElement;
    if (saveBtn) saveBtn.disabled = false;
  });

  wireSAIHandlers(tbody, entryRows);
}

function wireSAIHandlers(tbody: HTMLElement, _rows: Record<string, unknown>[]): void {
  const saveBtn = document.getElementById('sai-save-all-btn') as HTMLButtonElement;

  // Delete row
  tbody.querySelectorAll<HTMLButtonElement>('.sai-del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('tr')?.remove();
      if (saveBtn) saveBtn.disabled = false;
    });
  });

  // Track changes — update badge on type selects
  tbody.querySelectorAll<HTMLSelectElement>('.sai-et, .sai-at, .sai-tt').forEach(sel => {
    sel.addEventListener('change', () => {
      const badge = sel.nextElementSibling as HTMLElement;
      const val = parseInt(sel.value);
      const isEvent = sel.classList.contains('sai-et');
      const isAction = sel.classList.contains('sai-at');
      const map = isEvent ? SAI_EVENT : isAction ? SAI_ACTION : SAI_TARGET;
      if (badge) badge.textContent = map[val] || `ID:${val}`;
      if (saveBtn) saveBtn.disabled = false;
    });
  });

  tbody.querySelectorAll<HTMLInputElement>('input').forEach(inp => {
    inp.addEventListener('input', () => { if (saveBtn) saveBtn.disabled = false; });
  });

  // Save all SAI rows
  saveBtn?.addEventListener('click', async () => {
    if (!dbState.connected) return;
    try {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      const rows: Record<string, unknown>[] = [];
      tbody.querySelectorAll<HTMLTableRowElement>('tr').forEach(tr => {
        const row: Record<string, unknown> = {};
        tr.querySelectorAll<HTMLInputElement>('input[data-col]').forEach(inp => {
          row[inp.dataset.col!] = inp.value === '' ? null : inp.value;
        });
        tr.querySelectorAll<HTMLSelectElement>('select[data-col]').forEach(sel => {
          row[sel.dataset.col!] = sel.value;
        });
        if (Object.keys(row).length) rows.push(row);
      });

      // Replace all rows: DELETE + INSERT
      const sampleRow = rows[0];
      const entryorguid = sampleRow?.['entryorguid'];
      const sourceType  = sampleRow?.['source_type'] ?? 0;
      await window.electronAPI.db.execute(`DELETE FROM \`smart_scripts\` WHERE \`entryorguid\` = ? AND \`source_type\` = ?`, [entryorguid, sourceType]);

      for (const r of rows) {
        const cols = Object.keys(r).map(k => `\`${k}\``).join(', ');
        const vals = Object.keys(r).map(() => '?').join(', ');
        await window.electronAPI.db.execute(`INSERT INTO \`smart_scripts\` (${cols}) VALUES (${vals})`, Object.values(r));
      }

      saveBtn.textContent = '✓ Saved';
      setTimeout(() => { saveBtn.textContent = 'Save All'; saveBtn.disabled = false; }, 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`SAI Save Error: ${msg}`);
      saveBtn.textContent = 'Save All';
      saveBtn.disabled = false;
    }
  });
}

// ── Load entity ─────────────────────────────────────────────────────────────
async function loadEntityById(): Promise<void> {
  const entityType = $entityType?.value;
  const entityId = $entityId?.value;
  if (!entityType || !entityId || !dbState.connected) return;

  const cfg = ENTITY_TABLES[entityType];
  if (!cfg) return;

  dbState.entityIsNew = false;
  try {
    const result = await window.electronAPI.db.query(`SELECT * FROM \`${cfg.table}\` WHERE \`${cfg.primaryKey}\` = ?`, [entityId]);
    if (result.rows && result.rows.length > 0) {
      renderEntityEditor(result.rows[0] as Record<string, unknown>, cfg);
      $entitySaveBtn!.disabled = false;
      $entityDeleteBtn!.disabled = false;
      if ($entityApplySqlBtn) $entityApplySqlBtn.disabled = false;
    } else {
      $entityEditorContent!.innerHTML = `<p class="text-app-danger text-sm p-4">No ${entityType} found with ID ${entityId}</p>`;
      $entitySaveBtn!.disabled = true;
      $entityDeleteBtn!.disabled = true;
      $entitySqlCode!.textContent = '-- No entity found';
      dbState.entityCurrentData = null;
      dbState.entityOriginalData = null;
      updateEntityPreview();
      void loadEntityRelations();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    $entityEditorContent!.innerHTML = `<p class="text-app-danger text-sm p-4">Error: ${escapeHtml(msg)}</p>`;
    dbState.entityCurrentData = null;
    dbState.entityOriginalData = null;
    updateEntityPreview();
    void loadEntityRelations();
  }
}

$entityLoadBtn?.addEventListener('click', loadEntityById);

$entityType?.addEventListener('change', () => {
  dbState.entityCurrentData = null;
  dbState.entityOriginalData = null;
  dbState.entityIsNew = false;
  if ($entityId) $entityId.value = '';
  if ($entitySearch) $entitySearch.value = '';
  if ($entitySearchResults) {
    $entitySearchResults.innerHTML = '';
    $entitySearchResults.classList.add('hidden');
  }
  if ($entityEditorContent) {
    $entityEditorContent.innerHTML = '<p class="text-dark-text-muted text-sm p-4">Select an entity type and enter an ID to edit</p>';
  }
  if ($entitySqlCode) {
    $entitySqlCode.textContent = '-- Load an entity to generate SQL';
  }
  if ($entitySaveBtn) $entitySaveBtn.disabled = true;
  if ($entityDeleteBtn) $entityDeleteBtn.disabled = true;
  if ($entityApplySqlBtn) $entityApplySqlBtn.disabled = true;
  updateEntityPreview();
  void loadEntityRelations();
});

// New entity
$entityNewBtn?.addEventListener('click', async () => {
  const entityType = $entityType?.value;
  if (!entityType || !dbState.connected) return;
  const cfg = ENTITY_TABLES[entityType];
  if (!cfg) return;
  try {
    const schema = await window.electronAPI.db.getSchema(cfg.table);
    const emptyEntity: Record<string, unknown> = {};
    schema.forEach(f => { emptyEntity[f.name] = null; });
    dbState.entityIsNew = true;
    renderEntityEditor(emptyEntity, cfg);
    $entitySaveBtn!.disabled = false;
    $entityDeleteBtn!.disabled = true;
    if ($entityApplySqlBtn) $entityApplySqlBtn.disabled = false;
  } catch (err) {
    console.error('Error creating new entity:', err);
  }
});

// Save entity (uses SQL panel's apply logic or manual save)
$entitySaveBtn?.addEventListener('click', async () => {
  const entityType = $entityType?.value;
  const entityId   = $entityId?.value;
  if (!entityType || !dbState.connected) return;
  const cfg = ENTITY_TABLES[entityType];
  if (!cfg) return;

  // Collect latest field values
  const fields: Record<string, unknown> = {};
  $entityEditorContent?.querySelectorAll<HTMLInputElement>('input[data-field]').forEach(inp => {
    const field = inp.dataset.field!;
    fields[field] = inp.value.trim() === '' ? null : inp.value.trim();
  });
  $entityEditorContent?.querySelectorAll<HTMLTextAreaElement>('textarea[data-field]').forEach(ta => {
    const field = ta.dataset.field!;
    fields[field] = ta.value.trim() === '' ? null : ta.value.trim();
  });

  try {
    const isUpdate = !dbState.entityIsNew && entityId && entityId !== '0';
    if (isUpdate) {
      const setClauses = Object.keys(fields).filter(f => f !== cfg.primaryKey).map(f => `\`${f}\` = ?`).join(', ');
      const vals = Object.keys(fields).filter(f => f !== cfg.primaryKey).map(f => fields[f]);
      vals.push(entityId);
      await window.electronAPI.db.execute(`UPDATE \`${cfg.table}\` SET ${setClauses} WHERE \`${cfg.primaryKey}\` = ?`, vals);
      dbState.entityCurrentData = { ...fields, [cfg.primaryKey]: entityId };
      dbState.entityOriginalData = { ...fields, [cfg.primaryKey]: entityId };
      updateSQLPanel();
      $entityEditorContent?.querySelectorAll('.entity-field-dirty').forEach((el) => el.classList.remove('entity-field-dirty'));
      $entityEditorContent?.querySelectorAll('.is-dirty').forEach((el) => el.classList.remove('is-dirty'));
      updateEntityPreview();
      void loadEntityRelations();
      const banner = document.createElement('div');
      banner.className = 'save-notification';
      banner.textContent = `✓ ${entityType} #${entityId} updated successfully`;
      $entityEditorContent!.prepend(banner);
      setTimeout(() => banner.remove(), 3500);
    } else {
      const cols = Object.keys(fields).map(f => `\`${f}\``).join(', ');
      const placeholders = Object.keys(fields).map(() => '?').join(', ');
      const res = await window.electronAPI.db.execute(`INSERT INTO \`${cfg.table}\` (${cols}) VALUES (${placeholders})`, Object.values(fields));
      if (res.insertId && $entityId) $entityId.value = String(res.insertId);
      if (res.insertId && !fields[cfg.primaryKey]) fields[cfg.primaryKey] = res.insertId;
      dbState.entityCurrentData = { ...fields };
      dbState.entityIsNew = false;
      dbState.entityOriginalData = { ...fields };
      updateSQLPanel();
      updateEntityPreview();
      void loadEntityRelations();
      const banner = document.createElement('div');
      banner.className = 'save-notification';
      banner.textContent = `✓ New ${entityType} created (ID: ${res.insertId ?? '?'})`;
      $entityEditorContent!.prepend(banner);
      setTimeout(() => banner.remove(), 3500);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    $entityEditorContent!.innerHTML = `<p class="text-app-danger text-sm p-4 mb-3">Error: ${escapeHtml(msg)}</p>` + $entityEditorContent!.innerHTML;
  }
});

// Delete entity
$entityDeleteBtn?.addEventListener('click', async () => {
  const entityType = $entityType?.value;
  const entityId   = $entityId?.value;
  if (!entityType || !entityId || !dbState.connected) return;
  const cfg = ENTITY_TABLES[entityType];
  if (!cfg) return;
  const confirmed = await showModal({ title: 'Delete Entity', message: `Are you sure you want to delete this ${entityType} (ID: ${entityId})?` });
  if (!confirmed) return;
  try {
    await window.electronAPI.db.execute(`DELETE FROM \`${cfg.table}\` WHERE \`${cfg.primaryKey}\` = ?`, [entityId]);
    $entityEditorContent!.innerHTML = `<p class="text-app-success text-sm p-4">✓ Entity deleted successfully.</p>`;
    $entitySqlCode!.textContent = `DELETE FROM \`${cfg.table}\` WHERE \`${cfg.primaryKey}\` = ${entityId};`;
    $entitySaveBtn!.disabled = true;
    $entityDeleteBtn!.disabled = true;
    if ($entityApplySqlBtn) $entityApplySqlBtn.disabled = true;
    dbState.entityOriginalData = null;
    dbState.entityCurrentData = null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    $entityEditorContent!.innerHTML = `<p class="text-app-danger text-sm p-4">Error: ${escapeHtml(msg)}</p>`;
  }
});

// ── Table Editor: Save Changes ───────────────────────────────────────────────
document.getElementById('table-save-btn')?.addEventListener('click', async () => {
  if (!dbState.currentTable || !dbState.connected || !dbState.modifiedRows.size) return;
  const saveBtn = document.getElementById('table-save-btn') as HTMLButtonElement;
  // Determine primary key (first column of schema)
  const pk = dbState.tableSchema[0]?.name || 'id';
  try {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    let saved = 0;
    for (const rowIdx of dbState.modifiedRows) {
      const row = dbState.tableData[rowIdx] as Record<string, unknown>;
      if (!row) continue;
      const pkVal = row[pk];
      const setClauses = Object.keys(row).filter(k => k !== pk).map(k => `\`${k}\` = ?`).join(', ');
      const values: unknown[] = Object.keys(row).filter(k => k !== pk).map(k => row[k]);
      values.push(pkVal);
      await window.electronAPI.db.execute(`UPDATE \`${dbState.currentTable}\` SET ${setClauses} WHERE \`${pk}\` = ?`, values);
      saved++;
    }
    dbState.modifiedRows.clear();
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes';
    // Show notification
    const toolbar = document.querySelector('.db-table-toolbar');
    if (toolbar) {
      const notif = document.createElement('span');
      notif.className = 'save-notification ml-4';
      notif.textContent = `✓ ${saved} row(s) saved`;
      toolbar.appendChild(notif);
      setTimeout(() => notif.remove(), 3000);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    alert(`Save error: ${msg}`);
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes';
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

// ═══════════════════════════════════════════════════════════════════════════
// LIVE MAP TAB
// ═══════════════════════════════════════════════════════════════════════════

interface MapPlayerPosition {
  name: string;
  map: number;
  position_x: number;
  position_y: number;
  position_z: number;
  level: number;
  race: number;
  class: number;
  account: string;
}

// ── DOM references ─────────────────────────────────────────────────────────
const $mapDbConnectBtn    = $<HTMLButtonElement>('map-db-connect-btn');
const $mapDbDisconnectBtn = $<HTMLButtonElement>('map-db-disconnect-btn');
const $mapDbStatus        = $<HTMLElement>('map-db-status');
const $mapCanvas          = $<HTMLCanvasElement>('map-canvas');
const $mapTooltip         = $<HTMLElement>('map-tooltip');
const $mapStatusText      = $<HTMLElement>('map-status-text');
const $mapPlayerCount     = $<HTMLElement>('map-player-count');
const $mapPlayerList      = $<HTMLElement>('map-player-list');
const $mapAutoRefresh     = $<HTMLInputElement>('map-auto-refresh');
const $mapFilterType      = $<HTMLSelectElement>('map-filter-type');
const $mapShowBotWaypoint = $<HTMLInputElement>('map-show-bot-waypoint');
const $mapPlayerbotsDbName = $<HTMLInputElement>('map-playerbots-db-name');
const $mapRefreshBtn      = $<HTMLButtonElement>('map-refresh-btn');
const $mapZoomOutBtn      = $<HTMLButtonElement>('map-zoom-out-btn');
const $mapZoomInBtn       = $<HTMLButtonElement>('map-zoom-in-btn');
const $mapZoomResetBtn    = $<HTMLButtonElement>('map-zoom-reset-btn');
const $mapInteractionHint = $<HTMLElement>('map-interaction-hint');

let mapAllPlayers: MapPlayerPosition[] = [];
const mapImageCache = new Map<number, HTMLImageElement | 'failed'>();
let mapSelectedPlayerName: string | null = null;
let mapSelectedBotWaypoint: MapBotWaypoint | null = null;
let mapSelectedBotWaypointLoading = false;
let mapSelectedBotWaypointRequestToken = 0;
const MAP_MIN_ZOOM = 1;
const MAP_MAX_ZOOM = 5;
const MAP_ZOOM_STEP = 1.2;
let mapDragState: { startX: number; startY: number; startPanX: number; startPanY: number } | null = null;
let mapSuppressClick = false;

interface MapViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MapRenderLayout {
  frame: MapViewport;
  content: MapViewport;
}

function derivePlayerbotsDatabaseName(charactersDatabaseName: string): string {
  const normalized = charactersDatabaseName.trim();
  if (!normalized) return 'acore_playerbots';
  if (/characters$/i.test(normalized)) {
    return normalized.replace(/characters$/i, 'playerbots');
  }
  if (/_char$/i.test(normalized)) {
    return normalized.replace(/_char$/i, '_playerbots');
  }
  return 'acore_playerbots';
}

function isMapBot(player: Pick<MapPlayerPosition, 'account'> | null | undefined): boolean {
  return Boolean(player && /^RNDBOT/i.test(player.account));
}

function getSelectedMapPlayer(): MapPlayerPosition | null {
  if (!mapSelectedPlayerName) return null;
  return mapAllPlayers.find((player) => player.name === mapSelectedPlayerName) ?? null;
}

function clearSelectedBotWaypoint(): void {
  mapSelectedBotWaypoint = null;
  mapSelectedBotWaypointLoading = false;
}

async function refreshSelectedBotWaypoint(): Promise<void> {
  const requestToken = ++mapSelectedBotWaypointRequestToken;
  const player = getSelectedMapPlayer();
  const shouldLoad = Boolean(state.mapDbConnected && $mapShowBotWaypoint?.checked && isMapBot(player));

  if (!shouldLoad || !player) {
    clearSelectedBotWaypoint();
    renderMapCanvas();
    renderMapSelectedPanel();
    return;
  }

  mapSelectedBotWaypointLoading = true;
  renderMapSelectedPanel();

  try {
    mapSelectedBotWaypoint = await window.electronAPI.map.getBotWaypoint({
      charName: player.name,
      map: player.map,
      position_x: player.position_x,
      position_y: player.position_y,
      position_z: player.position_z,
      playerbotsDatabase: $mapPlayerbotsDbName?.value.trim() || undefined,
    });
  } catch {
    mapSelectedBotWaypoint = null;
  }

  if (requestToken !== mapSelectedBotWaypointRequestToken) {
    return;
  }

  mapSelectedBotWaypointLoading = false;
  renderMapCanvas();
  renderMapSelectedPanel();
}

// ── Image preloading ───────────────────────────────────────────────────────
function preloadMapImage(mapId: number): void {
  if (mapImageCache.has(mapId)) return;
  const img = new Image();
  img.onload  = () => { mapImageCache.set(mapId, img); if (state.mapSelectedContinent === mapId) renderMapCanvas(); };
  img.onerror = () => { mapImageCache.set(mapId, 'failed'); };
  // Relative to renderer/index.html  →  wow-admin/assets/maps/<id>.jpg
  img.src = `../assets/maps/${mapId}.jpg`;
}

function getMapAspectRatio(bounds: (typeof CONTINENT_BOUNDS)[number], mapId: number): number {
  const cachedImg = mapImageCache.get(mapId);
  if (cachedImg && cachedImg !== 'failed') {
    const img = cachedImg as HTMLImageElement;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      return img.naturalWidth / img.naturalHeight;
    }
  }

  if (bounds.tileProjection) {
    const { minTileX, maxTileX, minTileY, maxTileY } = bounds.tileProjection;
    const cropWidthTiles = maxTileX - minTileX + 1;
    const cropHeightTiles = maxTileY - minTileY + 1;
    if (cropWidthTiles > 0 && cropHeightTiles > 0) {
      return cropWidthTiles / cropHeightTiles;
    }
  }

  const worldWidth = Math.abs(bounds.locLeft - bounds.locRight);
  const worldHeight = Math.abs(bounds.locTop - bounds.locBottom);
  if (worldWidth > 0 && worldHeight > 0) {
    return worldWidth / worldHeight;
  }

  return 1;
}

function getMapViewport(canvasWidth: number, canvasHeight: number, bounds: (typeof CONTINENT_BOUNDS)[number], mapId: number): MapViewport {
  const aspectRatio = getMapAspectRatio(bounds, mapId);
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0 || canvasWidth <= 0 || canvasHeight <= 0) {
    return { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
  }

  const canvasAspectRatio = canvasWidth / canvasHeight;
  if (canvasAspectRatio > aspectRatio) {
    const height = canvasHeight;
    const width = Math.max(1, Math.round(height * aspectRatio));
    return {
      x: Math.floor((canvasWidth - width) / 2),
      y: 0,
      width,
      height,
    };
  }
      updateEntityPreview();
      void loadEntityRelations();

  const width = canvasWidth;
  const height = Math.max(1, Math.round(width / aspectRatio));
  return {
    x: 0,
    y: Math.floor((canvasHeight - height) / 2),
    width,
    height,
  };
}

function projectWorldToViewport(
  player: Pick<MapPlayerPosition, 'position_x' | 'position_y'>,
  bounds: (typeof CONTINENT_BOUNDS)[number],
  viewport: MapViewport,
): { x: number; y: number } {
  const point = worldToCanvas(player.position_x, player.position_y, bounds, viewport.width, viewport.height);
  return {
    x: viewport.x + point.x,
    y: viewport.y + point.y,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isPointInViewport(x: number, y: number, viewport: MapViewport): boolean {
  return x >= viewport.x && x <= viewport.x + viewport.width && y >= viewport.y && y <= viewport.y + viewport.height;
}

function getClampedMapPan(viewport: MapViewport, zoom = state.mapZoom, panX = state.mapPanX, panY = state.mapPanY): { x: number; y: number } {
  if (zoom <= MAP_MIN_ZOOM) {
    return { x: 0, y: 0 };
  }

  const maxPanX = (viewport.width * zoom - viewport.width) / 2;
  const maxPanY = (viewport.height * zoom - viewport.height) / 2;
  return {
    x: clamp(panX, -maxPanX, maxPanX),
    y: clamp(panY, -maxPanY, maxPanY),
  };
}

function getMapRenderLayout(
  canvasWidth: number,
  canvasHeight: number,
  bounds: (typeof CONTINENT_BOUNDS)[number],
  mapId: number,
): MapRenderLayout {
  const frame = getMapViewport(canvasWidth, canvasHeight, bounds, mapId);
  const zoom = clamp(state.mapZoom, MAP_MIN_ZOOM, MAP_MAX_ZOOM);
  const pan = getClampedMapPan(frame, zoom);
  const contentWidth = frame.width * zoom;
  const contentHeight = frame.height * zoom;
  const centeredX = frame.x - (contentWidth - frame.width) / 2;
  const centeredY = frame.y - (contentHeight - frame.height) / 2;

  return {
    frame,
    content: {
      x: centeredX + pan.x,
      y: centeredY + pan.y,
      width: contentWidth,
      height: contentHeight,
    },
  };
}

function syncMapViewState(canvasWidth?: number, canvasHeight?: number): void {
  state.mapZoom = clamp(state.mapZoom, MAP_MIN_ZOOM, MAP_MAX_ZOOM);
  if (state.mapZoom <= MAP_MIN_ZOOM) {
    state.mapZoom = MAP_MIN_ZOOM;
    state.mapPanX = 0;
    state.mapPanY = 0;
  } else if (canvasWidth && canvasHeight) {
    const bounds = CONTINENT_BOUNDS[state.mapSelectedContinent];
    if (bounds) {
      const frame = getMapViewport(canvasWidth, canvasHeight, bounds, state.mapSelectedContinent);
      const pan = getClampedMapPan(frame);
      state.mapPanX = pan.x;
      state.mapPanY = pan.y;
    }
  }

  if ($mapZoomResetBtn) {
    $mapZoomResetBtn.textContent = `${Math.round(state.mapZoom * 100)}%`;
  }
  if ($mapZoomOutBtn) $mapZoomOutBtn.disabled = state.mapZoom <= MAP_MIN_ZOOM + 0.001;
  if ($mapZoomInBtn) $mapZoomInBtn.disabled = state.mapZoom >= MAP_MAX_ZOOM - 0.001;
  if ($mapInteractionHint) {
    const shouldHideHint = state.mapZoom > MAP_MIN_ZOOM || Boolean(mapDragState);
    $mapInteractionHint.classList.toggle('hidden', shouldHideHint);
  }
}

function resetMapZoom(render = true): void {
  state.mapZoom = MAP_MIN_ZOOM;
  state.mapPanX = 0;
  state.mapPanY = 0;
  syncMapViewState($mapCanvas?.width, $mapCanvas?.height);
  if (render) renderMapCanvas();
}

function zoomMap(nextZoom: number, anchorX?: number, anchorY?: number): void {
  if (!$mapCanvas) return;
  const bounds = CONTINENT_BOUNDS[state.mapSelectedContinent];
  if (!bounds) return;

  const targetZoom = clamp(nextZoom, MAP_MIN_ZOOM, MAP_MAX_ZOOM);
  if (Math.abs(targetZoom - state.mapZoom) < 0.001) return;

  const W = $mapCanvas.width || $mapCanvas.clientWidth;
  const H = $mapCanvas.height || $mapCanvas.clientHeight;
  if (!W || !H) return;

  const currentLayout = getMapRenderLayout(W, H, bounds, state.mapSelectedContinent);
  const frame = currentLayout.frame;
  const fallbackAnchorX = frame.x + frame.width / 2;
  const fallbackAnchorY = frame.y + frame.height / 2;
  const ax = clamp(anchorX ?? fallbackAnchorX, frame.x, frame.x + frame.width);
  const ay = clamp(anchorY ?? fallbackAnchorY, frame.y, frame.y + frame.height);

  const relX = (ax - currentLayout.content.x) / currentLayout.content.width;
  const relY = (ay - currentLayout.content.y) / currentLayout.content.height;

  state.mapZoom = targetZoom;
  if (targetZoom <= MAP_MIN_ZOOM) {
    state.mapPanX = 0;
    state.mapPanY = 0;
  } else {
    const newContentWidth = frame.width * targetZoom;
    const newContentHeight = frame.height * targetZoom;
    const centeredX = frame.x - (newContentWidth - frame.width) / 2;
    const centeredY = frame.y - (newContentHeight - frame.height) / 2;
    const newContentX = ax - relX * newContentWidth;
    const newContentY = ay - relY * newContentHeight;
    const pan = getClampedMapPan(frame, targetZoom, newContentX - centeredX, newContentY - centeredY);
    state.mapPanX = pan.x;
    state.mapPanY = pan.y;
  }

  syncMapViewState(W, H);
  renderMapCanvas();
}

function panMap(nextPanX: number, nextPanY: number): void {
  if (!$mapCanvas) return;
  const bounds = CONTINENT_BOUNDS[state.mapSelectedContinent];
  if (!bounds) return;
  const W = $mapCanvas.width || $mapCanvas.clientWidth;
  const H = $mapCanvas.height || $mapCanvas.clientHeight;
  if (!W || !H) return;

  const frame = getMapViewport(W, H, bounds, state.mapSelectedContinent);
  const pan = getClampedMapPan(frame, state.mapZoom, nextPanX, nextPanY);
  state.mapPanX = pan.x;
  state.mapPanY = pan.y;
  syncMapViewState(W, H);
  renderMapCanvas();
}

// ── Filtering ──────────────────────────────────────────────────────────────
function getMapFilteredPlayers(): MapPlayerPosition[] {
  const filterVal = $mapFilterType?.value || 'real';
  const continent = state.mapSelectedContinent;
  return mapAllPlayers.filter((p) => {
    if (p.map !== continent) return false;
    const isBot = /^RNDBOT/i.test(p.account);
    if (filterVal === 'real' && isBot) return false;
    if (filterVal === 'bots' && !isBot) return false;
    return true;
  });
}

// ── DB connection ──────────────────────────────────────────────────────────
async function connectMapDb(): Promise<void> {
  const host = $<HTMLInputElement>('map-db-host')?.value.trim() || '127.0.0.1';
  const port = Number($<HTMLInputElement>('map-db-port')?.value.trim() || '3306');
  const user = $<HTMLInputElement>('map-db-user')?.value.trim() || 'acore';
  const pass = $<HTMLInputElement>('map-db-pass')?.value.trim() || '';
  const db   = $<HTMLInputElement>('map-db-name')?.value.trim() || 'acore_characters';

  if ($mapPlayerbotsDbName && !$mapPlayerbotsDbName.value.trim()) {
    $mapPlayerbotsDbName.value = derivePlayerbotsDatabaseName(db);
  }

  if ($mapDbStatus) showResult($mapDbStatus, false, 'Connecting…');
  if ($mapDbConnectBtn) $mapDbConnectBtn.disabled = true;

  const result = await window.electronAPI.map.connect({ host, port, username: user, password: pass, database: db });

  if (result.connected) {
    state.mapDbConnected = true;
    showResult($mapDbStatus, true, `Connected to ${db}`);
    if ($mapDbDisconnectBtn) $mapDbDisconnectBtn.disabled = false;
    if ($mapStatusText) $mapStatusText.textContent = 'Connected – polling player positions…';
    await refreshMapPositions();
  } else {
    state.mapDbConnected = false;
    showResult($mapDbStatus, false, result.error || 'Connection failed');
    if ($mapDbConnectBtn) $mapDbConnectBtn.disabled = false;
  }
}

async function disconnectMapDb(): Promise<void> {
  await window.electronAPI.map.disconnect();
  state.mapDbConnected = false;
  stopMapAutoRefresh();
  if ($mapAutoRefresh) $mapAutoRefresh.checked = false;
  mapAllPlayers = [];
  mapSelectedPlayerName = null;
  clearSelectedBotWaypoint();
  renderMapCanvas();
  renderMapPlayerList();
  renderMapSelectedPanel();
  if ($mapDbConnectBtn) $mapDbConnectBtn.disabled = false;
  if ($mapDbDisconnectBtn) $mapDbDisconnectBtn.disabled = true;
  showResult($mapDbStatus, false, 'Disconnected');
  if ($mapStatusText) $mapStatusText.textContent = 'Connect to the characters database to view live positions';
  if ($mapPlayerCount) $mapPlayerCount.textContent = '';
}

// ── Refresh ────────────────────────────────────────────────────────────────
async function refreshMapPositions(): Promise<void> {
  if (!state.mapDbConnected) return;
  try {
    mapAllPlayers = await window.electronAPI.map.getPlayerPositions();
  } catch {
    // transient error – keep last known positions
  }
  const shown = getMapFilteredPlayers().length;
  if ($mapStatusText) $mapStatusText.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
  if ($mapPlayerCount) $mapPlayerCount.textContent = `${shown} on this map`;
  renderMapCanvas();
  renderMapPlayerList();
  renderMapSelectedPanel();
  await refreshSelectedBotWaypoint();
}

function startMapAutoRefresh(): void {
  stopMapAutoRefresh();
  state.mapInterval = setInterval(refreshMapPositions, 5000);
}

function stopMapAutoRefresh(): void {
  if (state.mapInterval) { clearInterval(state.mapInterval); state.mapInterval = null; }
}

// ── Canvas rendering ───────────────────────────────────────────────────────
function renderMapCanvas(): void {
  if (!$mapCanvas) return;
  const wrapper = $mapCanvas.parentElement;
  if (!wrapper) return;

  const rect = wrapper.getBoundingClientRect();
  const W = Math.floor(rect.width)  || 800;
  const H = Math.floor(rect.height) || 500;
  $mapCanvas.width  = W;
  $mapCanvas.height = H;

  const ctx = $mapCanvas.getContext('2d');
  if (!ctx) return;

  const bounds = CONTINENT_BOUNDS[state.mapSelectedContinent];
  if (!bounds) return;
  syncMapViewState(W, H);
  const layout = getMapRenderLayout(W, H, bounds, state.mapSelectedContinent);
  const viewport = layout.frame;
  const content = layout.content;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#08111d';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.beginPath();
  ctx.rect(viewport.x, viewport.y, viewport.width, viewport.height);
  ctx.clip();

  // Background – use map image if available, else colour fill + guides
  const cachedImg = mapImageCache.get(state.mapSelectedContinent);
  const hasImage  = cachedImg && cachedImg !== 'failed';
  if (hasImage) {
    ctx.drawImage(cachedImg as HTMLImageElement, content.x, content.y, content.width, content.height);
    // Slight darkening overlay so dots remain readable
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(content.x, content.y, content.width, content.height);
  } else {
    ctx.fillStyle = bounds.bgColor;
    ctx.fillRect(content.x, content.y, content.width, content.height);
    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      const gx = content.x + (content.width / 10) * i;
      ctx.beginPath(); ctx.moveTo(gx, content.y); ctx.lineTo(gx, content.y + content.height); ctx.stroke();
      const gy = content.y + (content.height / 10) * i;
      ctx.beginPath(); ctx.moveTo(content.x, gy); ctx.lineTo(content.x + content.width, gy); ctx.stroke();
    }
    // Watermark continent name
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.font = `bold ${Math.min(36, content.width / 12)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(bounds.label, content.x + content.width / 2, content.y + content.height / 2 + 14);
    ctx.textAlign = 'left';

    if (!state.mapDbConnected) {
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Connect to the characters database to see live positions', viewport.x + viewport.width / 2, viewport.y + viewport.height / 2 + 52);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.font = '11px sans-serif';
      ctx.fillText('Tip: place map images at assets/maps/0.jpg · 1.jpg · 530.jpg · 571.jpg', viewport.x + viewport.width / 2, viewport.y + viewport.height / 2 + 72);
      ctx.textAlign = 'left';
      return;
    }
  }

  if (!state.mapDbConnected) {
    ctx.restore();
    return;
  }

  const players = getMapFilteredPlayers();
  const showLabels = players.length > 0 && players.length <= 30;
  const selectedPlayer = getSelectedMapPlayer();

  if (selectedPlayer && mapSelectedBotWaypoint && selectedPlayer.map === state.mapSelectedContinent && mapSelectedBotWaypoint.map === state.mapSelectedContinent) {
    const botPoint = projectWorldToViewport(selectedPlayer, bounds, content);
    const waypointPoint = projectWorldToViewport({ position_x: mapSelectedBotWaypoint.x, position_y: mapSelectedBotWaypoint.y }, bounds, content);

    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = 'rgba(241, 196, 15, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(botPoint.x, botPoint.y);
    ctx.lineTo(waypointPoint.x, waypointPoint.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(waypointPoint.x, waypointPoint.y - 10);
    ctx.lineTo(waypointPoint.x + 10, waypointPoint.y);
    ctx.lineTo(waypointPoint.x, waypointPoint.y + 10);
    ctx.lineTo(waypointPoint.x - 10, waypointPoint.y);
    ctx.closePath();
    ctx.fillStyle = '#f1c40f';
    ctx.shadowColor = 'rgba(241, 196, 15, 0.8)';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff7cf';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#f7d96b';
    ctx.font = 'bold 12px sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 3;
    ctx.fillText(`WP: ${mapSelectedBotWaypoint.name}`, waypointPoint.x + 14, waypointPoint.y - 12);
    ctx.restore();
  }

  for (const p of players) {
    const { x, y } = projectWorldToViewport(p, bounds, content);
    const isBot     = /^RNDBOT/i.test(p.account);
    const isSelected = p.name === mapSelectedPlayerName;
    const dotColor  = isBot ? '#888' : (CLASS_COLORS[p.class] || '#4fc3f7');

    // Selection ring (drawn first, behind dot)
    if (isSelected) {
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Glow
    ctx.shadowColor = isSelected ? '#ffffff' : dotColor;
    ctx.shadowBlur  = isSelected ? 18 : 8;

    // Outer coloured dot
    ctx.beginPath();
    ctx.arc(x, y, isSelected ? 9 : 7, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();

    // Inner white highlight
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // Name label
    if (showLabels || isSelected) {
      ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(230,230,230,0.88)';
      ctx.font = isSelected ? 'bold 12px sans-serif' : '11px sans-serif';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur  = isSelected ? 3 : 2;
      ctx.fillText(p.name, x + 12, y + 4);
      ctx.shadowBlur = 0;
    }
  }
  ctx.shadowBlur = 0;
  ctx.restore();

  if (players.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No players on this continent', viewport.x + viewport.width / 2, viewport.y + viewport.height / 2 + 52);
    ctx.textAlign = 'left';
  }
}

// ── Sidebar player list ────────────────────────────────────────────────────
function renderMapPlayerList(): void {
  if (!$mapPlayerList) return;
  const players = getMapFilteredPlayers();
  if (players.length === 0) {
    $mapPlayerList.innerHTML = '<p class="placeholder">No players on this continent</p>';
    return;
  }
  let html = '';
  for (const p of players) {
    const isBot   = /^RNDBOT/i.test(p.account);
    const color   = CLASS_COLORS[p.class] || '#ccc';
    const clsName = CLASS_NAMES[p.class]  || '';
    const isSel   = p.name === mapSelectedPlayerName;
    html += `<div class="map-player-item${isBot ? ' map-player-bot' : ''}${isSel ? ' map-player-selected' : ''}" data-charname="${escapeHtml(p.name)}" title="${escapeHtml(p.name)} – ${escapeHtml(clsName)} lv${p.level}">
      <span class="map-player-dot" style="background:${color}"></span>
      <span class="map-player-name">${escapeHtml(p.name)}</span>
      <span class="map-player-lvl">Lv${p.level}</span>
    </div>`;
  }
  $mapPlayerList.innerHTML = html;
}

// ── Selected player panel ──────────────────────────────────────────────────
function renderMapSelectedPanel(): void {
  const panel = $<HTMLElement>('map-selected-panel');
  if (!panel) return;

  if (!mapSelectedPlayerName) { panel.classList.add('hidden'); return; }

  const player = mapAllPlayers.find((p) => p.name === mapSelectedPlayerName);
  if (!player) { panel.classList.add('hidden'); return; }

  const nameEl    = $<HTMLElement>('map-sel-name');
  const detailsEl = $<HTMLElement>('map-sel-details');
  const coordsEl  = $<HTMLElement>('map-sel-coords');
  const badgeEl   = $<HTMLElement>('map-sel-badge');
  const waypointEl = $<HTMLElement>('map-sel-waypoint');

  const isBot      = /^RNDBOT/i.test(player.account);
  const raceName   = RACE_NAMES[player.race]   || `Race ${player.race}`;
  const clsName    = CLASS_NAMES[player.class]  || `Class ${player.class}`;
  const classColor = CLASS_COLORS[player.class] || 'var(--text)';
  const mapLabel   = CONTINENT_BOUNDS[player.map]?.label || `Map ${player.map}`;

  if (nameEl)    { nameEl.textContent = player.name; nameEl.style.color = classColor; }
  if (badgeEl)   { badgeEl.innerHTML  = isBot ? '<span class="bot-badge">BOT</span>' : ''; }
  if (detailsEl) { detailsEl.textContent = `Lv${player.level} ${raceName} ${clsName}`; }
  if (coordsEl)  { coordsEl.textContent  = `${mapLabel} (${player.position_x.toFixed(0)}, ${player.position_y.toFixed(0)})`; }
  if (waypointEl) {
    if (!isBot) {
      waypointEl.textContent = '';
    } else if (!$mapShowBotWaypoint?.checked) {
      waypointEl.textContent = 'Waypoint overlay disabled';
    } else if (mapSelectedBotWaypointLoading) {
      waypointEl.textContent = 'Waypoint: loading…';
    } else if (mapSelectedBotWaypoint) {
      waypointEl.textContent = `Waypoint: ${mapSelectedBotWaypoint.name} (#${mapSelectedBotWaypoint.nodeId}) • Δ ${mapSelectedBotWaypoint.distance.toFixed(1)}`;
    } else {
      waypointEl.textContent = 'Waypoint: no nearby travel node found';
    }
  }

  panel.classList.remove('hidden');
}

// ── Canvas click → player selection ──────────────────────────────────────
$mapCanvas?.addEventListener('click', (e) => {
  if (mapSuppressClick) {
    mapSuppressClick = false;
    return;
  }
  if (!$mapCanvas) return;
  const bounds = CONTINENT_BOUNDS[state.mapSelectedContinent];
  if (!bounds) return;

  const rect = $mapCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const W = $mapCanvas.width;
  const H = $mapCanvas.height;
  const layout = getMapRenderLayout(W, H, bounds, state.mapSelectedContinent);
  const viewport = layout.frame;
  if (!isPointInViewport(mx, my, viewport)) return;

  let hit: MapPlayerPosition | null = null;
  for (const p of getMapFilteredPlayers()) {
    const { x, y } = projectWorldToViewport(p, bounds, layout.content);
    const dx = mx - x, dy = my - y;
    if (dx * dx + dy * dy < 196) { hit = p; break; } // 14 px radius
  }

  mapSelectedPlayerName = hit ? (mapSelectedPlayerName === hit.name ? null : hit.name) : null;
  const resultEl = $<HTMLElement>('map-action-result');
  if (resultEl) { resultEl.textContent = ''; resultEl.className = 'action-result'; }
  renderMapCanvas();
  renderMapPlayerList();
  renderMapSelectedPanel();
  void refreshSelectedBotWaypoint();
});

// ── Sidebar list click → select ───────────────────────────────────────────
$mapPlayerList?.addEventListener('click', (e) => {
  const item = (e.target as HTMLElement).closest<HTMLElement>('[data-charname]');
  if (!item) return;
  const name = item.dataset.charname ?? null;
  mapSelectedPlayerName = mapSelectedPlayerName === name ? null : name;
  const resultEl = $<HTMLElement>('map-action-result');
  if (resultEl) { resultEl.textContent = ''; resultEl.className = 'action-result'; }
  renderMapCanvas();
  renderMapPlayerList();
  renderMapSelectedPanel();
  void refreshSelectedBotWaypoint();
});

// ── Selection panel SOAP actions ───────────────────────────────────────────
$('map-selected-panel')?.addEventListener('click', async (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-map-action]');
  if (!btn || !mapSelectedPlayerName) return;
  const action = btn.dataset.mapAction ?? '';
  const resultEl = $<HTMLElement>('map-action-result');
  if (!state.connected) {
    if (resultEl) showResult(resultEl, false, 'SOAP not connected');
    return;
  }
  const n = mapSelectedPlayerName;
  const cmdMap: Record<string, string> = {
    'pinfo':       `pinfo ${n}`,
    'freeze':      `freeze ${n}`,
    'unfreeze':    `unfreeze ${n}`,
    'kick':        `kick ${n}`,
    'ban account': `ban account ${n} 0 Admin action`,
    'summon':      `summon ${n}`,
  };
  const cmd = cmdMap[action];
  if (!cmd) return;
  btn.disabled = true;
  const r = await exec(cmd);
  btn.disabled = false;
  if (resultEl) showResult(resultEl, r.success, r.message.substring(0, 100) || '(done)');
  logActivity(cmd, r.message || '(done)', r.success);
});

// ── Deselect button ────────────────────────────────────────────────────────
$('map-deselect-btn')?.addEventListener('click', () => {
  mapSelectedPlayerName = null;
  clearSelectedBotWaypoint();
  renderMapCanvas();
  renderMapPlayerList();
  renderMapSelectedPanel();
});

// ── Tooltip on hover ───────────────────────────────────────────────────────
$mapCanvas?.addEventListener('mousemove', (e) => {
  if (!$mapTooltip || !$mapCanvas) return;
  const bounds = CONTINENT_BOUNDS[state.mapSelectedContinent];
  if (!bounds) return;

  const rect = $mapCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const W = $mapCanvas.width;
  const H = $mapCanvas.height;
  const layout = getMapRenderLayout(W, H, bounds, state.mapSelectedContinent);
  const viewport = layout.frame;

  if (mapDragState) {
    $mapTooltip.classList.add('hidden');
    $mapCanvas.style.cursor = 'grabbing';
    return;
  }

  if (!isPointInViewport(mx, my, viewport)) {
    $mapTooltip.classList.add('hidden');
    $mapCanvas.style.cursor = 'default';
    return;
  }

  let hit: MapPlayerPosition | null = null;
  for (const p of getMapFilteredPlayers()) {
    const { x, y } = projectWorldToViewport(p, bounds, layout.content);
    const dx = mx - x, dy = my - y;
    if (dx * dx + dy * dy < 100) { hit = p; break; }
  }

  if (hit) {
    const isBot     = /^RNDBOT/i.test(hit.account);
    const raceName  = RACE_NAMES[hit.race]  || `Race ${hit.race}`;
    const clsName   = CLASS_NAMES[hit.class] || `Class ${hit.class}`;
    $mapTooltip.innerHTML =
      `<div class="map-tooltip-name">${escapeHtml(hit.name)}</div>` +
      `<div>Level ${hit.level} ${escapeHtml(raceName)} ${escapeHtml(clsName)}</div>` +
      `<div style="color:var(--text-muted);font-size:11px">(${hit.position_x.toFixed(0)}, ${hit.position_y.toFixed(0)})</div>` +
      (isBot ? '<div class="map-tooltip-bot">BOT</div>' : '');
    // Keep tooltip inside canvas bounds
    const tw = 160, th = 72;
    const tx = mx + 14 + tw > W ? mx - tw - 6 : mx + 14;
    const ty = my - 10 < 0 ? my + 10 : my - 10;
    $mapTooltip.style.left = `${tx}px`;
    $mapTooltip.style.top  = `${ty}px`;
    $mapTooltip.classList.remove('hidden');
    $mapCanvas.style.cursor = 'pointer';
  } else {
    $mapTooltip.classList.add('hidden');
    $mapCanvas.style.cursor = state.mapZoom > MAP_MIN_ZOOM ? 'grab' : 'default';
  }
});

$mapCanvas?.addEventListener('mouseleave', () => {
  $mapTooltip?.classList.add('hidden');
  if ($mapCanvas && !mapDragState) $mapCanvas.style.cursor = 'default';
});

$mapCanvas?.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || !$mapCanvas || state.mapZoom <= MAP_MIN_ZOOM) return;
  const bounds = CONTINENT_BOUNDS[state.mapSelectedContinent];
  if (!bounds) return;

  const rect = $mapCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const layout = getMapRenderLayout($mapCanvas.width, $mapCanvas.height, bounds, state.mapSelectedContinent);
  if (!isPointInViewport(mx, my, layout.frame)) return;

  mapDragState = {
    startX: e.clientX,
    startY: e.clientY,
    startPanX: state.mapPanX,
    startPanY: state.mapPanY,
  };
  $mapTooltip?.classList.add('hidden');
  $mapCanvas.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', (e) => {
  if (!mapDragState) return;
  const dx = e.clientX - mapDragState.startX;
  const dy = e.clientY - mapDragState.startY;
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
    mapSuppressClick = true;
  }
  panMap(mapDragState.startPanX + dx, mapDragState.startPanY + dy);
  if ($mapTooltip) $mapTooltip.classList.add('hidden');
  if ($mapCanvas) $mapCanvas.style.cursor = 'grabbing';
});

window.addEventListener('mouseup', () => {
  if (!mapDragState) return;
  mapDragState = null;
  if ($mapCanvas) $mapCanvas.style.cursor = state.mapZoom > MAP_MIN_ZOOM ? 'grab' : 'default';
});

$mapCanvas?.addEventListener('wheel', (e) => {
  if (!$mapCanvas) return;
  const bounds = CONTINENT_BOUNDS[state.mapSelectedContinent];
  if (!bounds) return;
  const rect = $mapCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const layout = getMapRenderLayout($mapCanvas.width, $mapCanvas.height, bounds, state.mapSelectedContinent);
  if (!isPointInViewport(mx, my, layout.frame)) return;

  e.preventDefault();
  const factor = e.deltaY < 0 ? MAP_ZOOM_STEP : 1 / MAP_ZOOM_STEP;
  zoomMap(state.mapZoom * factor, mx, my);
}, { passive: false });

$mapCanvas?.addEventListener('dblclick', (e) => {
  if (!$mapCanvas) return;
  const bounds = CONTINENT_BOUNDS[state.mapSelectedContinent];
  if (!bounds) return;

  const rect = $mapCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const layout = getMapRenderLayout($mapCanvas.width, $mapCanvas.height, bounds, state.mapSelectedContinent);
  if (!isPointInViewport(mx, my, layout.frame)) return;

  e.preventDefault();
  zoomMap(state.mapZoom * MAP_ZOOM_STEP, mx, my);
});

// ── Continent selector ─────────────────────────────────────────────────────
$$<HTMLButtonElement>('.map-continent-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$<HTMLButtonElement>('.map-continent-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.mapSelectedContinent = Number(btn.dataset.continent ?? '0');
    preloadMapImage(state.mapSelectedContinent);
    resetMapZoom(false);
    mapSelectedPlayerName = null;
    clearSelectedBotWaypoint();
    if ($mapPlayerCount) $mapPlayerCount.textContent = `${getMapFilteredPlayers().length} on this map`;
    renderMapCanvas();
    renderMapPlayerList();
    renderMapSelectedPanel();
  });
});

// ── Control handlers ───────────────────────────────────────────────────────
$mapDbConnectBtn?.addEventListener('click', connectMapDb);
$mapDbDisconnectBtn?.addEventListener('click', disconnectMapDb);
$mapRefreshBtn?.addEventListener('click', refreshMapPositions);
$mapZoomOutBtn?.addEventListener('click', () => zoomMap(state.mapZoom / MAP_ZOOM_STEP));
$mapZoomInBtn?.addEventListener('click', () => zoomMap(state.mapZoom * MAP_ZOOM_STEP));
$mapZoomResetBtn?.addEventListener('click', () => resetMapZoom());

$mapAutoRefresh?.addEventListener('change', () => {
  if ($mapAutoRefresh.checked) startMapAutoRefresh(); else stopMapAutoRefresh();
});

$mapShowBotWaypoint?.addEventListener('change', () => {
  void refreshSelectedBotWaypoint();
});

$mapPlayerbotsDbName?.addEventListener('change', () => {
  void refreshSelectedBotWaypoint();
});

$mapFilterType?.addEventListener('change', () => {
  if ($mapPlayerCount) $mapPlayerCount.textContent = `${getMapFilteredPlayers().length} on this map`;
  renderMapCanvas();
  renderMapPlayerList();
  renderMapSelectedPanel();
});

// ResizeObserver keeps canvas sized correctly while the tab is visible
const _mapResizeObserver = new ResizeObserver(() => {
  if (document.getElementById('tab-map')?.classList.contains('active')) renderMapCanvas();
});
const _mapWrapper = document.querySelector('.map-canvas-wrapper');
if (_mapWrapper) _mapResizeObserver.observe(_mapWrapper);

// Initial blank render
syncMapViewState();
renderMapCanvas();

