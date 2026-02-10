// ── Platform class (for macOS titlebar padding etc.) ─────────
if (window.appInfo?.platform) {
  document.body.classList.add(`platform-${window.appInfo.platform}`);
}

// ── DOM refs ─────────────────────────────────────────────────
const $host = document.getElementById("host");
const $port = document.getElementById("port");
const $username = document.getElementById("username");
const $password = document.getElementById("password");
const $btnConnect = document.getElementById("btn-connect");
const $btnDisconnect = document.getElementById("btn-disconnect");
const $status = document.getElementById("status-indicator");
const $output = document.getElementById("output");
const $form = document.getElementById("command-form");
const $cmdInput = document.getElementById("command-input");
const $btnSend = document.querySelector(".btn-send");

// Profile refs
const $profileSelect = document.getElementById("profile-select");
const $btnSaveProfile = document.getElementById("btn-save-profile");
const $btnUpdateProfile = document.getElementById("btn-update-profile");
const $btnDeleteProfile = document.getElementById("btn-delete-profile");

// Modal refs
const $modalOverlay = document.getElementById("modal-overlay");
const $modalTitle   = document.getElementById("modal-title");
const $modalMessage = document.getElementById("modal-message");
const $modalInput   = document.getElementById("modal-input");
const $modalOk      = document.getElementById("modal-ok");
const $modalCancel  = document.getElementById("modal-cancel");

/** Show a modal prompt (with input) or confirm (without input). Returns a Promise. */
function showModal({ title, message = "", defaultValue, showInput = false }) {
  return new Promise((resolve) => {
    $modalTitle.textContent = title;
    $modalMessage.textContent = message;
    if (showInput) {
      $modalInput.classList.remove("hidden");
      $modalInput.value = defaultValue || "";
    } else {
      $modalInput.classList.add("hidden");
    }
    $modalOverlay.classList.remove("hidden");
    if (showInput) $modalInput.focus();

    function cleanup(result) {
      $modalOverlay.classList.add("hidden");
      $modalOk.removeEventListener("click", onOk);
      $modalCancel.removeEventListener("click", onCancel);
      $modalInput.removeEventListener("keydown", onKey);
      resolve(result);
    }
    function onOk()     { cleanup(showInput ? $modalInput.value : true); }
    function onCancel() { cleanup(null); }
    function onKey(e)   { if (e.key === "Enter") onOk(); else if (e.key === "Escape") onCancel(); }

    $modalOk.addEventListener("click", onOk);
    $modalCancel.addEventListener("click", onCancel);
    if (showInput) $modalInput.addEventListener("keydown", onKey);
  });
}

// Dashboard refs
const $dashServerInfo = document.getElementById("dash-server-info");
const $uptimeValue = document.getElementById("uptime-value");
const $playersCount = document.getElementById("players-count");
const $peakCount = document.getElementById("peak-count");
const $dashMotd = document.getElementById("dash-motd");
const $activityLog = document.getElementById("activity-log");
const $btnClearLog = document.getElementById("btn-clear-log");

// Players refs
const $playersTbody = document.getElementById("players-tbody");
const $autoRefreshPlayers = document.getElementById("auto-refresh-players");
const $playersSearch = document.getElementById("players-search");
const $playersFilterType = document.getElementById("players-filter-type");
const $playersFilterMap = document.getElementById("players-filter-map");
const $playersPerPage = document.getElementById("players-per-page");

// Player action refs
const $paCharname = document.getElementById("pa-charname");
const $paAction = document.getElementById("pa-action");
const $paExtra = document.getElementById("pa-extra");
const $paExtraLabel = document.getElementById("pa-extra-label");
const $playerActionResult = document.getElementById("player-action-result");

let connected = false;
const commandHistory = [];
let historyIdx = -1;
let profiles = [];
let dashboardInterval = null;
let playersInterval = null;

// ── Helpers ──────────────────────────────────────────────────

function ts() {
  return new Date().toLocaleTimeString();
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function appendOutput(html) {
  $output.insertAdjacentHTML("beforeend", html);
  $output.scrollTop = $output.scrollHeight;
}

function setConnected(state) {
  connected = state;
  $btnConnect.disabled = state;
  $btnDisconnect.disabled = !state;
  $cmdInput.disabled = !state;
  $btnSend.disabled = !state;
  $status.textContent = state ? "Connected" : "Disconnected";
  $status.className = `status ${state ? "connected" : "disconnected"}`;
  if (state) $cmdInput.focus();
}

/** Execute a SOAP command and return { success, message }. */
async function exec(cmd) {
  if (!connected) return { success: false, message: "Not connected." };
  try {
    return await window.soapAPI.command(cmd);
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/** Show a result inside a .action-result div. */
function showResult(el, ok, text) {
  el.textContent = text;
  el.className = `action-result visible ${ok ? "ok" : "err"}`;
}

/** Add an entry to the dashboard activity log. */
function logActivity(cmd, msg, ok) {
  const cls = ok ? "log-ok" : "log-err";
  const entry = document.createElement("div");
  entry.className = "log-entry";
  entry.innerHTML =
    `<span class="log-ts">[${ts()}]</span>` +
    `<span class="log-cmd">&gt; ${escapeHtml(cmd)}</span> ` +
    `<span class="${cls}">${escapeHtml(msg.substring(0, 200))}</span>`;
  $activityLog.prepend(entry);
  // Keep max 100 entries
  while ($activityLog.children.length > 100) $activityLog.lastChild.remove();
}

// ══════════════════════════════════════════════════════════════
// TAB SWITCHING
// ══════════════════════════════════════════════════════════════

document.querySelectorAll("#tab-bar .tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#tab-bar .tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

// ══════════════════════════════════════════════════════════════
// CONNECTION
// ══════════════════════════════════════════════════════════════

$btnConnect.addEventListener("click", async () => {
  const config = {
    host: $host.value.trim() || "127.0.0.1",
    port: $port.value.trim() || "7878",
    username: $username.value.trim(),
    password: $password.value.trim(),
  };

  if (!config.username || !config.password) {
    appendOutput(`<div class="entry"><span class="response error">⚠ Username and password are required.</span></div>`);
    return;
  }

  $status.textContent = "Connecting…";
  $status.className = "status connecting";
  $btnConnect.disabled = true;

  const result = await window.soapAPI.connect(config);

  if (result.success) {
    setConnected(true);
    appendOutput(
      `<div class="entry"><span class="response success">✔ Connected to ${escapeHtml(config.host)}:${escapeHtml(config.port)}</span><br/>` +
        `<span class="response">${escapeHtml(result.message)}</span></div>`
    );
    logActivity("server info", result.message, true);
    // Kick off initial dashboard refresh
    refreshDashboard();
    startDashboardAutoRefresh();
  } else {
    setConnected(false);
    appendOutput(
      `<div class="entry"><span class="response error">✘ Connection failed: ${escapeHtml(result.message)}</span></div>`
    );
  }
});

$btnDisconnect.addEventListener("click", async () => {
  await window.soapAPI.disconnect();
  setConnected(false);
  stopDashboardAutoRefresh();
  stopPlayersAutoRefresh();
  appendOutput(`<div class="entry"><span class="response">Disconnected.</span></div>`);
  resetDashboard();
});

// ══════════════════════════════════════════════════════════════
// CONSOLE TAB
// ══════════════════════════════════════════════════════════════

async function sendCommand(cmd) {
  if (!connected || !cmd) return;

  commandHistory.unshift(cmd);
  if (commandHistory.length > 200) commandHistory.pop();
  historyIdx = -1;

  appendOutput(
    `<div class="entry sending">` +
      `<span class="timestamp">[${ts()}]</span>` +
      `<span class="cmd-line">&gt; ${escapeHtml(cmd)}</span><br/>` +
      `<span class="response" style="color:var(--text-muted)">…</span>` +
      `</div>`
  );
  $output.scrollTop = $output.scrollHeight;

  const result = await exec(cmd);

  const sending = $output.querySelector(".sending");
  if (sending) {
    const cls = result.success ? "success" : "error";
    sending.classList.remove("sending");
    sending.querySelector(".response").className = `response ${cls}`;
    sending.querySelector(".response").textContent = result.message || "(no output)";
    $output.scrollTop = $output.scrollHeight;
  }
  logActivity(cmd, result.message || "(no output)", result.success);
}

$form.addEventListener("submit", (e) => {
  e.preventDefault();
  const cmd = $cmdInput.value.trim();
  if (!cmd) return;
  $cmdInput.value = "";
  sendCommand(cmd);
});

document.querySelectorAll(".quick-cmd").forEach((btn) => {
  btn.addEventListener("click", () => {
    const cmd = btn.dataset.cmd;
    if (cmd) sendCommand(cmd);
  });
});

$cmdInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp") {
    e.preventDefault();
    if (historyIdx < commandHistory.length - 1) {
      historyIdx++;
      $cmdInput.value = commandHistory[historyIdx];
    }
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    if (historyIdx > 0) {
      historyIdx--;
      $cmdInput.value = commandHistory[historyIdx];
    } else {
      historyIdx = -1;
      $cmdInput.value = "";
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

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════

function resetDashboard() {
  $dashServerInfo.innerHTML = '<p class="placeholder">Connect to view server information</p>';
  $uptimeValue.textContent = "--";
  $playersCount.textContent = "--";
  $peakCount.textContent = "--";
  $dashMotd.innerHTML = '<p class="placeholder">--</p>';
}

async function refreshDashboard() {
  if (!connected) return;

  // Fetch server info
  const info = await exec("server info");
  if (info.success) {
    parseServerInfo(info.message);
  }

  // Fetch uptime
  const up = await exec("server uptime");
  if (up.success) {
    $uptimeValue.textContent = up.message.replace(/^Server uptime:\s*/i, "").trim() || up.message;
  }

  // Fetch MOTD
  const motd = await exec("server motd");
  if (motd.success) {
    $dashMotd.innerHTML = `<p>${escapeHtml(motd.message)}</p>`;
  }
}

function parseServerInfo(msg) {
  // AzerothCore server info typically contains:
  // version, connected players, characters, peak, etc.
  const lines = msg.split("\n").map((l) => l.trim()).filter(Boolean);

  // Try to extract player count & peak from the text
  const playersMatch = msg.match(/Connected players:\s*(\d+)/i);
  const charsMatch = msg.match(/Characters in world:\s*(\d+)/i);
  const peakMatch = msg.match(/Connection peak:\s*(\d+)/i);

  if (playersMatch) $playersCount.textContent = playersMatch[1];
  if (peakMatch) $peakCount.textContent = peakMatch[1];

  // Build detail view
  let html = "";
  // Show version line
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

  // Show any remaining lines
  for (let i = 1; i < lines.length; i++) {
    if (
      !lines[i].match(/Connected players/i) &&
      !lines[i].match(/Characters in world/i) &&
      !lines[i].match(/Connection peak/i)
    ) {
      html += `<div class="info-line"><span class="info-value">${escapeHtml(lines[i])}</span></div>`;
    }
  }

  $dashServerInfo.innerHTML = html || `<p>${escapeHtml(msg)}</p>`;
}

function startDashboardAutoRefresh() {
  stopDashboardAutoRefresh();
  dashboardInterval = setInterval(refreshDashboard, 30000); // every 30s
}

function stopDashboardAutoRefresh() {
  if (dashboardInterval) {
    clearInterval(dashboardInterval);
    dashboardInterval = null;
  }
}

// Dashboard refresh button
document.querySelector('[data-action="refresh-dashboard"]')?.addEventListener("click", refreshDashboard);

// Dashboard quick action buttons
document.querySelectorAll(".quick-actions .btn-action").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const cmd = btn.dataset.cmd;
    if (!cmd || !connected) return;
    const r = await exec(cmd);
    logActivity(cmd, r.message || "(done)", r.success);
  });
});

// Announcement form
document.getElementById("announce-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("announce-msg").value.trim();
  if (!msg || !connected) return;
  const r = await exec(`announce ${msg}`);
  logActivity(`announce ${msg}`, r.message || "Announced", r.success);
  document.getElementById("announce-msg").value = "";
});

// Set MOTD form
document.getElementById("set-motd-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("set-motd-msg").value.trim();
  if (!msg || !connected) return;
  const r = await exec(`server set motd ${msg}`);
  logActivity(`server set motd`, r.message || "MOTD updated", r.success);
  if (r.success) {
    document.getElementById("set-motd-msg").value = "";
    refreshDashboard();
  }
});

// Clear log
$btnClearLog?.addEventListener("click", () => {
  $activityLog.innerHTML = "";
});

// ══════════════════════════════════════════════════════════════
// PLAYERS TAB – Enhanced with search, pagination, detail view
// ══════════════════════════════════════════════════════════════

// ── WoW Map & Zone Name Lookups ──────────────────────────────
const MAP_NAMES = {
  0:"Eastern Kingdoms",1:"Kalimdor",13:"Test",25:"Scott Test",29:"CashTest",30:"Alterac Valley",33:"Shadowfang Keep",34:"Stormwind Stockade",36:"Deadmines",43:"Wailing Caverns",44:"Monastery",47:"Razorfen Kraul",48:"Blackfathom Deeps",70:"Uldaman",90:"Gnomeregan",109:"Sunken Temple",129:"Razorfen Downs",189:"Scarlet Monastery",209:"Zul'Farrak",229:"Blackrock Spire",230:"Blackrock Depths",249:"Onyxia's Lair",269:"Opening of the Dark Portal",289:"Scholomance",309:"Zul'Gurub",329:"Stratholme",349:"Maraudon",369:"Deeprun Tram",389:"Ragefire Chasm",409:"Molten Core",429:"Dire Maul",469:"Blackwing Lair",489:"Warsong Gulch",509:"Ruins of Ahn'Qiraj",529:"Arathi Basin",530:"Outland",531:"Ahn'Qiraj Temple",532:"Karazhan",533:"Naxxramas",534:"Battle for Mount Hyjal",540:"Shattered Halls",542:"Blood Furnace",543:"Hellfire Ramparts",544:"Magtheridon's Lair",545:"The Steamvault",546:"The Underbog",547:"The Slave Pens",548:"Serpentshrine Cavern",550:"Tempest Keep",552:"The Arcatraz",553:"The Botanica",554:"The Mechanar",555:"Shadow Labyrinth",556:"Sethekk Halls",557:"Mana-Tombs",558:"Auchenai Crypts",559:"Nagrand Arena",560:"Escape From Durnholde",562:"Blade's Edge Arena",564:"Black Temple",565:"Gruul's Lair",566:"Eye of the Storm",568:"Zul'Aman",571:"Northrend",572:"Ruins of Lordaeron",574:"Utgarde Keep",575:"Utgarde Pinnacle",576:"The Nexus",578:"The Oculus",580:"Sunwell Plateau",585:"Magisters' Terrace",595:"Culling of Stratholme",599:"Halls of Stone",600:"Drak'Tharon Keep",601:"Azjol-Nerub",602:"Halls of Lightning",603:"Ulduar",604:"Gundrak",607:"Strand of the Ancients",608:"Violet Hold",609:"Acherus: The Ebon Hold",615:"Obsidian Sanctum",616:"Eye of Eternity",617:"Dalaran Sewers",618:"Ring of Valor",619:"Ahn'kahet: The Old Kingdom",624:"Vault of Archavon",631:"Icecrown Citadel",632:"Forge of Souls",649:"Trial of the Crusader",650:"Trial of the Champion",658:"Pit of Saron",668:"Halls of Reflection",724:"The Ruby Sanctum"
};

const ZONE_NAMES = {
  1:"Dun Morogh",3:"Badlands",4:"Blasted Lands",8:"Swamp of Sorrows",10:"Duskwood",11:"Wetlands",12:"Elwynn Forest",14:"Durotar",15:"Dustwallow Marsh",16:"Azshara",17:"The Barrens",25:"Blackrock Mountain",28:"Western Plaguelands",33:"Stranglethorn Vale",36:"Alterac Mountains",38:"Loch Modan",40:"Westfall",44:"Redridge Mountains",45:"Arathi Highlands",46:"Burning Steppes",47:"The Hinterlands",51:"Searing Gorge",65:"Dragonblight",66:"Zul'Drak",67:"The Storm Peaks",85:"Tirisfal Glades",130:"Silverpine Forest",139:"Eastern Plaguelands",141:"Teldrassil",148:"Darkshore",210:"Icecrown",215:"Mulgore",267:"Hillsbrad Foothills",331:"Ashenvale",357:"Feralas",361:"Felwood",394:"Grizzly Hills",400:"Thousand Needles",405:"Desolace",406:"Stonetalon Mountains",440:"Tanaris",490:"Un'Goro Crater",491:"Razorfen Kraul",493:"Moonglade",495:"Howling Fjord",618:"Winterspring",1377:"Silithus",1497:"Undercity",1519:"Stormwind City",1537:"Ironforge",1637:"Orgrimmar",1638:"Thunder Bluff",1657:"Darnassus",2100:"Maraudon",2159:"Onyxia's Lair",2817:"Crystalsong Forest",3277:"Warsong Gulch",3358:"Arathi Basin",3430:"Eversong Woods",3433:"Ghostlands",3483:"Hellfire Peninsula",3487:"Silvermoon City",3518:"Nagrand",3519:"Terokkar Forest",3520:"Shadowmoon Valley",3521:"Zangarmarsh",3522:"Blade's Edge Mountains",3523:"Netherstorm",3524:"Azuremyst Isle",3525:"Bloodmyst Isle",3537:"Borean Tundra",3540:"Twisting Nether",3557:"The Exodar",3703:"Shattrath City",3711:"Sholazar Basin",3805:"Zul'Aman",3820:"Eye of the Storm",3836:"Magtheridon's Lair",3840:"Tempest Keep",4080:"Isle of Quel'Danas",4197:"Wintergrasp",4264:"Halls of Stone",4265:"The Nexus",4272:"Halls of Lightning",4273:"Ulduar",4277:"Azjol-Nerub",4298:"Acherus: The Ebon Hold",4384:"Strand of the Ancients",4395:"Dalaran",4415:"The Violet Hold",4416:"Gundrak",4493:"Obsidian Sanctum",4494:"Ahn'kahet",4500:"Eye of Eternity",4603:"Vault of Archavon",4710:"Isle of Conquest",4722:"Trial of the Crusader",4723:"Trial of the Champion",4809:"Forge of Souls",4812:"Icecrown Citadel",4813:"Pit of Saron",4820:"Halls of Reflection",4987:"The Ruby Sanctum"
};

const RACE_NAMES = {1:"Human",2:"Orc",3:"Dwarf",4:"Night Elf",5:"Undead",6:"Tauren",7:"Gnome",8:"Troll",10:"Blood Elf",11:"Draenei"};
const CLASS_NAMES = {1:"Warrior",2:"Paladin",3:"Hunter",4:"Rogue",5:"Priest",6:"Death Knight",7:"Shaman",8:"Mage",9:"Warlock",11:"Druid"};
const CLASS_COLORS = {1:"#C79C6E",2:"#F58CBA",3:"#ABD473",4:"#FFF569",5:"#FFFFFF",6:"#C41F3B",7:"#0070DE",8:"#69CCF0",9:"#9482C9",11:"#FF7D0A"};
const RACE_ICONS = {1:"\u{1F9D1}",2:"\u{1F9DF}",3:"\u2692\uFE0F",4:"\u{1F33F}",5:"\u{1F480}",6:"\u{1F402}",7:"\u2699\uFE0F",8:"\u{1F3F9}",10:"\u2728",11:"\u{1F52E}"};

function getMapName(id) { return MAP_NAMES[id] || `Map ${id}`; }
function getZoneName(id) { return ZONE_NAMES[id] || `Zone ${id}`; }

// ── Players state ────────────────────────────────────────────
let allPlayers = [];
let filteredPlayers = [];
let playersPage = 1;
let playersSortCol = "name";
let playersSortAsc = true;

async function refreshPlayers() {
  if (!connected) return;

  const r = await exec("account onlinelist");
  if (!r.success) {
    $playersTbody.innerHTML = `<tr><td colspan="9" class="placeholder">${escapeHtml(r.message)}</td></tr>`;
    return;
  }

  allPlayers = parseOnlineList(r.message);
  if (allPlayers.length === 0) {
    $playersTbody.innerHTML = `<tr><td colspan="9" class="placeholder">No players online</td></tr>`;
    updatePlayerStats();
    return;
  }

  populateMapFilter(allPlayers);
  applyPlayersFilter();
}

function parseOnlineList(msg) {
  const players = [];
  const lines = msg.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Format: -[Account][Character][IP][Map][Zone][Exp][GMLev]-
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
      account, name, ip, mapId, zoneId, expansion, gmLevel, isBot,
      mapName: getMapName(mapId),
      zoneName: getZoneName(zoneId),
      level: "", race: "", className: "", raceId: 0, classId: 0,
    });
  }
  return players;
}

function populateMapFilter(players) {
  const maps = new Set();
  players.forEach(p => maps.add(p.mapId));
  const sorted = [...maps].sort((a, b) => a - b);
  const current = $playersFilterMap.value;
  $playersFilterMap.innerHTML = '<option value="">All Maps</option>';
  sorted.forEach(id => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = getMapName(id);
    if (String(id) === current) opt.selected = true;
    $playersFilterMap.appendChild(opt);
  });
}

function updatePlayerStats() {
  const real = allPlayers.filter(p => !p.isBot);
  const bots = allPlayers.filter(p => p.isBot);
  const accounts = new Set(allPlayers.map(p => p.account));
  document.getElementById("stat-total").textContent = allPlayers.length;
  document.getElementById("stat-real").textContent = real.length;
  document.getElementById("stat-bots").textContent = bots.length;
  document.getElementById("stat-accounts").textContent = accounts.size;
}

function applyPlayersFilter() {
  const search = ($playersSearch?.value || "").toLowerCase();
  const filterType = $playersFilterType?.value || "all";
  const filterMap = $playersFilterMap?.value || "";

  filteredPlayers = allPlayers.filter(p => {
    if (filterType === "real" && p.isBot) return false;
    if (filterType === "bots" && !p.isBot) return false;
    if (filterType === "gm" && p.gmLevel < 1) return false;
    if (filterMap && String(p.mapId) !== filterMap) return false;
    if (search) {
      const hay = [p.name, p.account, p.ip, p.mapName, p.zoneName, p.level, p.race, p.className].join(" ").toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  sortPlayers();
  updatePlayerStats();
  playersPage = 1;
  renderPlayersTable();
}

function sortPlayers() {
  const col = playersSortCol;
  const dir = playersSortAsc ? 1 : -1;
  filteredPlayers.sort((a, b) => {
    let va, vb;
    switch (col) {
      case "name":    va = a.name.toLowerCase(); vb = b.name.toLowerCase(); break;
      case "level":   va = parseInt(a.level) || 0; vb = parseInt(b.level) || 0; break;
      case "race":    va = a.race || ""; vb = b.race || ""; break;
      case "class":   va = a.className || ""; vb = b.className || ""; break;
      case "map":     va = a.mapName; vb = b.mapName; break;
      case "zone":    va = a.zoneName; vb = b.zoneName; break;
      case "account": va = a.account.toLowerCase(); vb = b.account.toLowerCase(); break;
      default:        va = a.name.toLowerCase(); vb = b.name.toLowerCase();
    }
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

function renderPlayersTable() {
  const perPage = parseInt($playersPerPage?.value || "25", 10);
  const total = filteredPlayers.length;
  let pageData;

  if (perPage === 0 || perPage >= total) {
    pageData = filteredPlayers;
    playersPage = 1;
  } else {
    const maxPage = Math.ceil(total / perPage);
    if (playersPage > maxPage) playersPage = maxPage;
    if (playersPage < 1) playersPage = 1;
    const start = (playersPage - 1) * perPage;
    pageData = filteredPlayers.slice(start, start + perPage);
  }

  if (pageData.length === 0) {
    $playersTbody.innerHTML = `<tr><td colspan="9" class="placeholder">No matching players</td></tr>`;
  } else {
    let html = "";
    for (const p of pageData) {
      const classColor = CLASS_COLORS[p.classId] || "var(--text)";
      const raceIcon = RACE_ICONS[p.raceId] || "";
      const gmBadge = p.gmLevel > 0 ? `<span class="gm-badge">GM${p.gmLevel}</span>` : "";
      const botBadge = p.isBot ? `<span class="bot-badge">BOT</span>` : "";

      html += `<tr class="${p.isBot ? 'row-bot' : 'row-real'}" data-charname="${escapeHtml(p.name)}">
        <td>
          <span class="char-name">${escapeHtml(p.name)}</span>
          ${gmBadge}${botBadge}
        </td>
        <td class="td-level">${p.level || "\u2014"}</td>
        <td>${raceIcon} ${escapeHtml(p.race || "\u2014")}</td>
        <td><span style="color:${classColor}">${escapeHtml(p.className || "\u2014")}</span></td>
        <td>${escapeHtml(p.mapName)}</td>
        <td>${escapeHtml(p.zoneName)}</td>
        <td>${escapeHtml(p.account)}</td>
        <td class="td-ip">${escapeHtml(p.ip)}</td>
        <td class="td-actions">
          <button class="tbl-action" data-player-action="detail" data-charname="${escapeHtml(p.name)}" title="Detailed Info">\u{1F50D}</button>
          <button class="tbl-action" data-player-action="kick" data-charname="${escapeHtml(p.name)}" title="Kick">\u274C</button>
          <button class="tbl-action" data-player-action="mute" data-charname="${escapeHtml(p.name)}" title="Mute">\u{1F507}</button>
          <button class="tbl-action danger" data-player-action="ban account" data-charname="${escapeHtml(p.name)}" title="Ban">\u{1F6AB}</button>
        </td>
      </tr>`;
    }
    $playersTbody.innerHTML = html;
  }

  updatePagination(total, perPage);
}

function updatePagination(total, perPage) {
  const pgInfo = document.getElementById("pg-info");
  const pgTotal = document.getElementById("pg-total");
  if (perPage === 0 || total === 0) {
    pgInfo.textContent = "Page 1 of 1";
    pgTotal.textContent = `${total} results`;
    return;
  }
  const maxPage = Math.ceil(total / perPage);
  pgInfo.textContent = `Page ${playersPage} of ${maxPage}`;
  pgTotal.textContent = `${total} results`;
  document.getElementById("pg-first").disabled = playersPage <= 1;
  document.getElementById("pg-prev").disabled = playersPage <= 1;
  document.getElementById("pg-next").disabled = playersPage >= maxPage;
  document.getElementById("pg-last").disabled = playersPage >= maxPage;
}

// Pagination button handlers
document.getElementById("pg-first")?.addEventListener("click", () => { playersPage = 1; renderPlayersTable(); });
document.getElementById("pg-prev")?.addEventListener("click", () => { playersPage--; renderPlayersTable(); });
document.getElementById("pg-next")?.addEventListener("click", () => { playersPage++; renderPlayersTable(); });
document.getElementById("pg-last")?.addEventListener("click", () => {
  const perPage = parseInt($playersPerPage?.value || "25", 10);
  playersPage = perPage > 0 ? Math.ceil(filteredPlayers.length / perPage) : 1;
  renderPlayersTable();
});

// Search & filter handlers (debounced search)
let searchTimeout = null;
$playersSearch?.addEventListener("input", () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(applyPlayersFilter, 200);
});
$playersFilterType?.addEventListener("change", applyPlayersFilter);
$playersFilterMap?.addEventListener("change", applyPlayersFilter);
$playersPerPage?.addEventListener("change", () => { playersPage = 1; renderPlayersTable(); });

// Column sort handlers
document.querySelectorAll("#players-table th.sortable").forEach(th => {
  th.addEventListener("click", () => {
    const col = th.dataset.sort;
    if (playersSortCol === col) {
      playersSortAsc = !playersSortAsc;
    } else {
      playersSortCol = col;
      playersSortAsc = true;
    }
    document.querySelectorAll("#players-table th.sortable").forEach(h => h.classList.remove("sort-asc", "sort-desc"));
    th.classList.add(playersSortAsc ? "sort-asc" : "sort-desc");
    sortPlayers();
    renderPlayersTable();
  });
});

// ── Player Detail Panel (pinfo) ──────────────────────────────
window.showPlayerDetail = async function(charname) {
  const panel = document.getElementById("player-detail-panel");
  const body = document.getElementById("detail-body");
  const title = document.getElementById("detail-charname");
  panel.classList.remove("hidden");
  title.textContent = charname;
  body.innerHTML = '<p class="placeholder">Loading player info\u2026</p>';

  const r = await exec(`pinfo ${charname}`);
  if (!r.success) {
    body.innerHTML = `<p class="action-result visible err">${escapeHtml(r.message)}</p>`;
    return;
  }

  body.innerHTML = formatPinfo(r.message);
  enrichPlayerFromPinfo(charname, r.message);
};

function formatPinfo(msg) {
  const lines = msg.split(/[\r\n]+/).map(l => l.replace(/^[\u00a6\u251c\u2500|]+\s*/, "").trim()).filter(Boolean);
  let html = '<div class="pinfo-grid">';
  for (const line of lines) {
    const idx = line.indexOf(":");
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

function enrichPlayerFromPinfo(charname, msg) {
  const levelMatch = msg.match(/Level:\s*(\d+)/i);
  const raceClassMatch = msg.match(/Race:\s*((?:Female|Male)\s+)?(.+?),\s+(\S+)/i);
  if (!levelMatch && !raceClassMatch) return;

  const player = allPlayers.find(p => p.name === charname);
  if (!player) return;

  if (levelMatch) player.level = levelMatch[1];
  if (raceClassMatch) {
    player.race = raceClassMatch[2].trim();
    player.className = raceClassMatch[3].trim();
    for (const [id, name] of Object.entries(RACE_NAMES)) {
      if (player.race.toLowerCase().includes(name.toLowerCase())) { player.raceId = parseInt(id); break; }
    }
    for (const [id, name] of Object.entries(CLASS_NAMES)) {
      if (player.className.toLowerCase() === name.toLowerCase()) { player.classId = parseInt(id); break; }
    }
  }

  renderPlayersTable();
}

document.getElementById("detail-close")?.addEventListener("click", () => {
  document.getElementById("player-detail-panel")?.classList.add("hidden");
});

// ── Event delegation for player table action buttons ─────────
$playersTbody.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-player-action]");
  if (!btn) return;
  const action = btn.dataset.playerAction;
  const charname = btn.dataset.charname;
  if (action === "detail") {
    window.showPlayerDetail(charname);
  } else {
    window.playerAction(action, charname);
  }
});

// Player refresh button
document.querySelector('[data-action="refresh-players"]')?.addEventListener("click", refreshPlayers);

// Auto-refresh toggle
$autoRefreshPlayers?.addEventListener("change", () => {
  if ($autoRefreshPlayers.checked) {
    refreshPlayers();
    playersInterval = setInterval(refreshPlayers, 30000);
  } else {
    stopPlayersAutoRefresh();
  }
});

function stopPlayersAutoRefresh() {
  $autoRefreshPlayers.checked = false;
  if (playersInterval) {
    clearInterval(playersInterval);
    playersInterval = null;
  }
}

// Player action from table button
window.playerAction = async function (action, charname) {
  $paCharname.value = charname;
  $paAction.value = action;
  runPlayerAction(action, charname);
};

// Player action form
document.getElementById("player-action-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const charname = $paCharname.value.trim();
  const action = $paAction.value;
  if (!charname || !connected) return;
  runPlayerAction(action, charname);
});

// Show/hide extra field based on action
$paAction?.addEventListener("change", () => {
  const action = $paAction.value;
  const needsExtra = [
    "send items", "send mail", "send money", "send message",
    "teleport", "ban account", "ban character", "ban ip",
    "character level", "character changeaccount", "mute",
    "lookup player account", "lookup player ip"
  ].includes(action);
  $paExtraLabel.style.display = needsExtra ? "" : "none";
  switch (action) {
    case "send items":      $paExtra.placeholder = 'itemid:count e.g. "49623:1"'; break;
    case "send mail":       $paExtra.placeholder = '"Subject" "Body text"'; break;
    case "send money":      $paExtra.placeholder = '"Subject" "Text" amount (copper)'; break;
    case "send message":    $paExtra.placeholder = "screen message text"; break;
    case "teleport":        $paExtra.placeholder = "location name"; break;
    case "ban account":     $paExtra.placeholder = "duration reason (e.g. 1d Cheating)"; break;
    case "ban character":   $paExtra.placeholder = "duration reason"; break;
    case "ban ip":          $paExtra.placeholder = "duration reason"; break;
    case "character level":  $paExtra.placeholder = "level (1-80)"; break;
    case "character changeaccount": $paExtra.placeholder = "new account name"; break;
    case "mute":            $paExtra.placeholder = "minutes (default 10)"; break;
    case "lookup player account": $paExtra.placeholder = "account name"; break;
    case "lookup player ip":      $paExtra.placeholder = "IP address"; break;
    default:                $paExtra.placeholder = ""; break;
  }
});

async function runPlayerAction(action, charname) {
  let cmd = "";
  const extra = $paExtra.value.trim();

  switch (action) {
    case "pinfo":
      cmd = `pinfo ${charname}`;
      break;
    case "kick":
      cmd = `kick ${charname}`;
      break;
    case "ban account":
      cmd = `ban account ${charname} ${extra || "0 Admin action"}`;
      break;
    case "ban character":
      cmd = `ban character ${charname} ${extra || "0 Admin action"}`;
      break;
    case "ban ip":
      cmd = `ban ip ${charname} ${extra || "0 Admin action"}`;
      break;
    case "unban account":
      cmd = `unban account ${charname}`;
      break;
    case "unban character":
      cmd = `unban character ${charname}`;
      break;
    case "mute":
      cmd = `mute ${charname} ${extra || "10"}`;
      break;
    case "unmute":
      cmd = `unmute ${charname}`;
      break;
    case "freeze":
      cmd = `freeze ${charname}`;
      break;
    case "unfreeze":
      cmd = `unfreeze ${charname}`;
      break;
    case "revive":
      cmd = `revive ${charname}`;
      break;
    case "repairitems":
      cmd = `repairitems ${charname}`;
      break;
    case "combatstop":
      cmd = `combatstop ${charname}`;
      break;
    case "unstuck":
      cmd = `unstuck ${charname}`;
      break;
    case "summon":
      cmd = `summon ${charname}`;
      break;
    case "teleport":
      cmd = `teleport name ${charname} ${extra}`;
      break;
    case "character level":
      cmd = `character level ${charname} ${extra || "80"}`;
      break;
    case "character rename":
      cmd = `character rename ${charname}`;
      break;
    case "character customize":
      cmd = `character customize ${charname}`;
      break;
    case "character changefaction":
      cmd = `character changefaction ${charname}`;
      break;
    case "character changerace":
      cmd = `character changerace ${charname}`;
      break;
    case "character changeaccount":
      cmd = `character changeaccount ${extra} ${charname}`;
      break;
    case "character reputation":
      cmd = `character reputation ${charname}`;
      break;
    case "character titles":
      cmd = `character titles ${charname}`;
      break;
    case "reset talents":
      cmd = `reset talents ${charname}`;
      break;
    case "reset spells":
      cmd = `reset spells ${charname}`;
      break;
    case "reset stats":
      cmd = `reset stats ${charname}`;
      break;
    case "reset level":
      cmd = `reset level ${charname}`;
      break;
    case "reset honor":
      cmd = `reset honor ${charname}`;
      break;
    case "send mail":
      cmd = `send mail ${charname} ${extra || '"Admin" "Message"'}`;
      break;
    case "send items":
      cmd = `send items ${charname} "Admin" "Items" ${extra}`;
      break;
    case "send money":
      cmd = `send money ${charname} ${extra || '"Admin" "Gold" 10000'}`;
      break;
    case "send message":
      cmd = `send message ${charname} ${extra || "Hello from admin"}`;
      break;
    case "lookup player account":
      cmd = `lookup player account ${extra || charname}`;
      break;
    case "lookup player ip":
      cmd = `lookup player ip ${extra || charname}`;
      break;
    default:
      cmd = `${action} ${charname}`;
  }

  const r = await exec(cmd);
  showResult($playerActionResult, r.success, r.message || "(no output)");
  logActivity(cmd, r.message || "(done)", r.success);
}

// ══════════════════════════════════════════════════════════════
// ACCOUNTS TAB
// ══════════════════════════════════════════════════════════════

// Create account
document.getElementById("create-account-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = document.getElementById("ca-username").value.trim();
  const pass = document.getElementById("ca-password").value.trim();
  const exp = document.getElementById("ca-expansion").value;
  if (!user || !pass || !connected) return;

  const r = await exec(`account create ${user} ${pass} ${pass}`);
  const el = document.getElementById("create-account-result");
  showResult(el, r.success, r.message || "(done)");

  // Set expansion if creation succeeded
  if (r.success) {
    await exec(`account set addon ${user} ${exp}`);
  }
  logActivity(`account create ${user}`, r.message || "(done)", r.success);
});

// Change password
document.getElementById("change-password-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = document.getElementById("cp-username").value.trim();
  const pass = document.getElementById("cp-password").value.trim();
  if (!user || !pass || !connected) return;

  const r = await exec(`account set password ${user} ${pass} ${pass}`);
  const el = document.getElementById("change-password-result");
  showResult(el, r.success, r.message || "(done)");
  logActivity(`account set password ${user}`, r.message || "(done)", r.success);
});

// Set GM level
document.getElementById("gm-level-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = document.getElementById("gm-username").value.trim();
  const level = document.getElementById("gm-level").value;
  const realm = document.getElementById("gm-realm").value.trim() || "-1";
  if (!user || !connected) return;

  const r = await exec(`account set gmlevel ${user} ${level} ${realm}`);
  const el = document.getElementById("gm-level-result");
  showResult(el, r.success, r.message || "(done)");
  logActivity(`account set gmlevel ${user} ${level}`, r.message || "(done)", r.success);
});

// Account lookup
document.getElementById("account-lookup-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = document.getElementById("al-username").value.trim();
  if (!user || !connected) return;

  const r = await exec(`lookup account name ${user}`);
  const el = document.getElementById("account-lookup-result");
  showResult(el, r.success, r.message || "No results.");
  logActivity(`lookup account name ${user}`, r.message || "(done)", r.success);
});

// Ban
document.getElementById("ban-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = document.getElementById("ban-username").value.trim();
  const dur = document.getElementById("ban-duration").value.trim() || "0";
  const reason = document.getElementById("ban-reason").value.trim() || "Admin action";
  if (!user || !connected) return;

  const r = await exec(`ban account ${user} ${dur} ${reason}`);
  const el = document.getElementById("ban-result");
  showResult(el, r.success, r.message || "(done)");
  logActivity(`ban account ${user}`, r.message || "(done)", r.success);
});

// Unban
document.getElementById("btn-unban")?.addEventListener("click", async () => {
  const user = document.getElementById("ban-username").value.trim();
  if (!user || !connected) return;

  const r = await exec(`unban account ${user}`);
  const el = document.getElementById("ban-result");
  showResult(el, r.success, r.message || "(done)");
  logActivity(`unban account ${user}`, r.message || "(done)", r.success);
});

// Online accounts
document.getElementById("btn-online-accounts")?.addEventListener("click", async () => {
  if (!connected) return;
  const r = await exec("account onlinelist");
  const el = document.getElementById("online-accounts-result");
  showResult(el, r.success, r.message || "No accounts online.");
  logActivity("account onlinelist", r.message || "(done)", r.success);
});

// Delete account
document.getElementById("delete-account-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = document.getElementById("da-username").value.trim();
  if (!user || !connected) return;
  if (!confirm(`Permanently delete account "${user}" and ALL its characters?`)) return;
  const r = await exec(`account delete ${user}`);
  const el = document.getElementById("delete-account-result");
  showResult(el, r.success, r.message || "(done)");
  logActivity(`account delete ${user}`, r.message || "(done)", r.success);
});

// Ban info
document.getElementById("baninfo-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const type = document.getElementById("bi-type").value;
  const target = document.getElementById("bi-target").value.trim();
  if (!target || !connected) return;
  const r = await exec(`baninfo ${type} ${target}`);
  const el = document.getElementById("baninfo-result");
  showResult(el, r.success, r.message || "No ban info found.");
  logActivity(`baninfo ${type} ${target}`, r.message || "(done)", r.success);
});

// Ban list
document.getElementById("banlist-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const type = document.getElementById("bl-type").value;
  const filter = document.getElementById("bl-filter").value.trim();
  if (!connected) return;
  const cmd = filter ? `banlist ${type} ${filter}` : `banlist ${type}`;
  const r = await exec(cmd);
  const el = document.getElementById("banlist-result");
  showResult(el, r.success, r.message || "No bans found.");
  logActivity(cmd, r.message || "(done)", r.success);
});

// IP Ban
document.getElementById("ip-ban-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const ip = document.getElementById("ipban-ip").value.trim();
  const dur = document.getElementById("ipban-duration").value.trim() || "0";
  const reason = document.getElementById("ipban-reason").value.trim() || "Admin action";
  if (!ip || !connected) return;
  const r = await exec(`ban ip ${ip} ${dur} ${reason}`);
  const el = document.getElementById("ip-ban-result");
  showResult(el, r.success, r.message || "(done)");
  logActivity(`ban ip ${ip}`, r.message || "(done)", r.success);
});

// Unban IP
document.getElementById("btn-unban-ip")?.addEventListener("click", async () => {
  const ip = document.getElementById("ipban-ip").value.trim();
  if (!ip || !connected) return;
  const r = await exec(`unban ip ${ip}`);
  const el = document.getElementById("ip-ban-result");
  showResult(el, r.success, r.message || "(done)");
  logActivity(`unban ip ${ip}`, r.message || "(done)", r.success);
});

// Set Expansion / Addon
document.getElementById("set-addon-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = document.getElementById("sa-username").value.trim();
  const addon = document.getElementById("sa-addon").value;
  if (!user || !connected) return;
  const r = await exec(`account set addon ${user} ${addon}`);
  const el = document.getElementById("set-addon-result");
  showResult(el, r.success, r.message || "(done)");
  logActivity(`account set addon ${user} ${addon}`, r.message || "(done)", r.success);
});

// ══════════════════════════════════════════════════════════════
// TICKETS TAB
// ══════════════════════════════════════════════════════════════

// Ticket list buttons
document.getElementById("btn-ticket-list")?.addEventListener("click", async () => {
  if (!connected) return;
  const r = await exec("ticket list");
  showResult(document.getElementById("ticket-list-result"), r.success, r.message || "No open tickets.");
  logActivity("ticket list", r.message || "(done)", r.success);
});

document.getElementById("btn-ticket-onlinelist")?.addEventListener("click", async () => {
  if (!connected) return;
  const r = await exec("ticket onlinelist");
  showResult(document.getElementById("ticket-online-result"), r.success, r.message || "No online tickets.");
  logActivity("ticket onlinelist", r.message || "(done)", r.success);
});

document.getElementById("btn-ticket-closedlist")?.addEventListener("click", async () => {
  if (!connected) return;
  const r = await exec("ticket closedlist");
  showResult(document.getElementById("ticket-closed-result"), r.success, r.message || "No closed tickets.");
  logActivity("ticket closedlist", r.message || "(done)", r.success);
});

document.getElementById("btn-ticket-escalatedlist")?.addEventListener("click", async () => {
  if (!connected) return;
  const r = await exec("ticket escalatedlist");
  showResult(document.getElementById("ticket-escalated-result"), r.success, r.message || "No escalated tickets.");
  logActivity("ticket escalatedlist", r.message || "(done)", r.success);
});

// Refresh tickets button
document.querySelector('[data-action="refresh-tickets"]')?.addEventListener("click", async () => {
  if (!connected) return;
  document.getElementById("btn-ticket-list")?.click();
});

// View ticket
document.getElementById("ticket-view-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("tv-id").value.trim();
  if (!id || !connected) return;
  const r = await exec(`ticket viewid ${id}`);
  showResult(document.getElementById("ticket-view-result"), r.success, r.message || "Ticket not found.");
  logActivity(`ticket viewid ${id}`, r.message || "(done)", r.success);
});

document.getElementById("btn-ticket-viewname")?.addEventListener("click", async () => {
  const name = document.getElementById("tv-id").value.trim();
  if (!name || !connected) return;
  const r = await exec(`ticket viewname ${name}`);
  showResult(document.getElementById("ticket-view-result"), r.success, r.message || "Ticket not found.");
  logActivity(`ticket viewname ${name}`, r.message || "(done)", r.success);
});

// Ticket action form
document.getElementById("ticket-action-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("ta-id").value.trim();
  const action = document.getElementById("ta-action").value;
  const extra = document.getElementById("ta-extra").value.trim();
  if (!id || !connected) return;

  let cmd = "";
  switch (action) {
    case "close":     cmd = `ticket close ${id}`; break;
    case "delete":    cmd = `ticket delete ${id}`; break;
    case "escalate":  cmd = `ticket escalate ${id}`; break;
    case "assign":    cmd = `ticket assign ${id} ${extra}`; break;
    case "unassign":  cmd = `ticket unassign ${id}`; break;
    case "comment":   cmd = `ticket comment ${id} ${extra}`; break;
    default:          cmd = `ticket ${action} ${id}`; break;
  }

  const r = await exec(cmd);
  showResult(document.getElementById("ticket-action-result"), r.success, r.message || "(done)");
  logActivity(cmd, r.message || "(done)", r.success);
});

// Ticket response form
document.getElementById("ticket-response-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("tr-id").value.trim();
  const action = document.getElementById("tr-action").value;
  const text = document.getElementById("tr-text").value.trim();
  if (!id || !connected) return;

  let cmd = "";
  switch (action) {
    case "append":    cmd = `ticket response append ${id} ${text}`; break;
    case "appendln":  cmd = `ticket response appendln ${id} ${text}`; break;
    case "show":      cmd = `ticket response show ${id}`; break;
    case "delete":    cmd = `ticket response delete ${id}`; break;
    default:          cmd = `ticket response ${action} ${id}`; break;
  }

  const r = await exec(cmd);
  showResult(document.getElementById("ticket-response-result"), r.success, r.message || "(done)");
  logActivity(cmd, r.message || "(done)", r.success);
});

// Ticket system buttons
document.getElementById("btn-ticket-reset")?.addEventListener("click", async () => {
  if (!connected) return;
  const r = await exec("ticket reset");
  showResult(document.getElementById("ticket-system-result"), r.success, r.message || "(done)");
  logActivity("ticket reset", r.message || "(done)", r.success);
});

document.getElementById("btn-ticket-toggle")?.addEventListener("click", async () => {
  if (!connected) return;
  const r = await exec("ticket togglesystem");
  showResult(document.getElementById("ticket-system-result"), r.success, r.message || "(done)");
  logActivity("ticket togglesystem", r.message || "(done)", r.success);
});

// ══════════════════════════════════════════════════════════════
// PROFILE MANAGEMENT
// ══════════════════════════════════════════════════════════════

function getCurrentFields() {
  return {
    host: $host.value.trim() || "127.0.0.1",
    port: $port.value.trim() || "7878",
    username: $username.value.trim(),
    password: $password.value.trim(),
  };
}

function loadFieldsFromProfile(p) {
  $host.value = p.host || "127.0.0.1";
  $port.value = p.port || 7878;
  $username.value = p.username || "";
  $password.value = p.password || "";
}

function updateProfileButtons() {
  const has = $profileSelect.value !== "";
  $btnUpdateProfile.disabled = !has;
  $btnDeleteProfile.disabled = !has;
}

async function refreshProfileList(selectId) {
  profiles = await window.configAPI.getProfiles();
  const activeId = selectId || (await window.configAPI.getActiveProfileId());

  $profileSelect.innerHTML = '<option value="">— Select profile —</option>';
  profiles.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name}  (${p.host}:${p.port})`;
    if (p.id === activeId) opt.selected = true;
    $profileSelect.appendChild(opt);
  });
  updateProfileButtons();
  if (activeId) {
    const active = profiles.find((p) => p.id === activeId);
    if (active) loadFieldsFromProfile(active);
  }
}

$profileSelect.addEventListener("change", async () => {
  const id = $profileSelect.value;
  updateProfileButtons();
  if (!id) return;
  const profile = profiles.find((p) => p.id === id);
  if (profile) {
    loadFieldsFromProfile(profile);
    await window.configAPI.setActiveProfile(id);
  }
});

$btnSaveProfile.addEventListener("click", async () => {
  const fields = getCurrentFields();
  if (!fields.username) {
    appendOutput(`<div class="entry"><span class="response error">⚠ Fill in at least a username before saving a profile.</span></div>`);
    return;
  }
  const name = await showModal({
    title: "Save Profile",
    message: "Enter a name for this connection profile:",
    defaultValue: `${fields.host}:${fields.port}`,
    showInput: true,
  });
  if (!name) return;
  try {
    const newProfile = await window.configAPI.addProfile({ ...fields, name });
    await window.configAPI.setActiveProfile(newProfile.id);
    await refreshProfileList(newProfile.id);
    logActivity("profile", `Profile "${name}" saved.`, true);
  } catch (err) {
    appendOutput(`<div class="entry"><span class="response error">⚠ Failed to save profile: ${err.message}</span></div>`);
  }
});

$btnUpdateProfile.addEventListener("click", async () => {
  const id = $profileSelect.value;
  if (!id) return;
  const fields = getCurrentFields();
  const profile = profiles.find((p) => p.id === id);
  const name = profile ? profile.name : fields.host;
  try {
    await window.configAPI.updateProfile(id, { ...fields, name });
    await refreshProfileList(id);
    logActivity("profile", `Profile "${name}" updated.`, true);
  } catch (err) {
    appendOutput(`<div class="entry"><span class="response error">⚠ Failed to update profile: ${err.message}</span></div>`);
  }
});

$btnDeleteProfile.addEventListener("click", async () => {
  const id = $profileSelect.value;
  if (!id) return;
  const profile = profiles.find((p) => p.id === id);
  const name = profile ? profile.name : id;
  const confirmed = await showModal({
    title: "Delete Profile",
    message: `Are you sure you want to delete profile "${name}"?`,
  });
  if (!confirmed) return;
  try {
    await window.configAPI.deleteProfile(id);
    await refreshProfileList();
    logActivity("profile", `Profile "${name}" deleted.`, true);
  } catch (err) {
    appendOutput(`<div class="entry"><span class="response error">⚠ Failed to delete profile: ${err.message}</span></div>`);
  }
});

// Load saved profiles on startup
refreshProfileList();
