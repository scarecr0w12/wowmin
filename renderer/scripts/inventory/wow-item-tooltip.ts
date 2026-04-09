import type { CharacterInventoryItemRow } from '../../../src/types/electron';
import { escapeHtml } from '../utils/helpers';

/** WoW item quality → hex (WotLK / Wowhead-style). */
export const ITEM_QUALITY_COLOR: Record<number, string> = {
  0: '#889d9d',
  1: '#ffffff',
  2: '#1eff00',
  3: '#0070dd',
  4: '#a335ee',
  5: '#ff8000',
  6: '#e6cc80',
  7: '#0cf',
};

const EQUIP_SLOT_LABELS: Record<number, string> = {
  0: 'Head',
  1: 'Neck',
  2: 'Shoulders',
  3: 'Shirt',
  4: 'Chest',
  5: 'Waist',
  6: 'Legs',
  7: 'Feet',
  8: 'Wrist',
  9: 'Hands',
  10: 'Finger 1',
  11: 'Finger 2',
  12: 'Trinket 1',
  13: 'Trinket 2',
  14: 'Back',
  15: 'Main Hand',
  16: 'Off Hand',
  17: 'Ranged',
  18: 'Tabard',
  19: 'Bag 1',
  20: 'Bag 2',
  21: 'Bag 3',
  22: 'Bag 4',
};

/** ItemModType (subset) — WotLK item_template.stat_typeN */
const STAT_TYPE_LABEL: Record<number, string> = {
  0: 'Mana',
  1: 'Health',
  3: 'Agility',
  4: 'Strength',
  5: 'Intellect',
  6: 'Spirit',
  7: 'Stamina',
  12: 'Defense',
  13: 'Dodge',
  14: 'Parry',
  15: 'Block',
  16: 'Hit Melee',
  17: 'Hit Ranged',
  18: 'Hit Spell',
  19: 'Crit Melee',
  20: 'Crit Ranged',
  21: 'Crit Spell',
  31: 'Hit',
  32: 'Crit',
  35: 'Resilience',
  36: 'Haste',
  37: 'Expertise',
  38: 'Attack Power',
  39: 'Ranged Attack Power',
  41: 'Spell Healing',
  42: 'Spell Damage',
  43: 'Mana Regen',
  44: 'Armor Penetration',
  45: 'Spell Power',
  46: 'Health Regen',
  47: 'Spell Penetration',
  48: 'Block Value',
};

const BONDING_LABEL: Record<number, string> = {
  0: '',
  1: 'Binds when picked up',
  2: 'Binds when equipped',
  3: 'Binds when used',
  4: 'Quest item',
  5: 'Quest item',
};

const SOCKET_LABEL: Record<number, string> = {
  1: 'Meta Socket',
  2: 'Red Socket',
  4: 'Yellow Socket',
  8: 'Blue Socket',
  14: 'Prismatic Socket',
};

function stripWowColorCodes(text: string): string {
  return text
    .replace(/\|c[0-9a-fA-F]{8}/gi, '')
    .replace(/\|r/gi, '')
    .replace(/\|T[^|]+\|t/gi, '')
    .replace(/\|H[^|]+\|h([^|]*)\|h\|r/gi, '$1')
    .trim();
}

function firstEnchantmentId(enchantments: string): number {
  const tok = enchantments.trim().split(/\s+/)[0];
  const n = parseInt(tok ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function formatInventoryLocation(item: CharacterInventoryItemRow, bagLabels: Record<string, string>): string {
  if (item.bag === 0) {
    if (item.slot <= 18) {
      const label = EQUIP_SLOT_LABELS[item.slot] ?? `Slot ${item.slot}`;
      return `Equipped (${label})`;
    }
    if (item.slot >= 19 && item.slot <= 22) {
      return 'Equipped (container slot)';
    }
    if (item.slot >= 23 && item.slot <= 38) {
      return 'Backpack';
    }
    return `Inventory (slot ${item.slot})`;
  }
  const bagName = bagLabels[String(item.bag)] ?? `Bag ${item.bag}`;
  return `${bagName} · slot ${item.slot}`;
}

export function buildWowItemTooltipHtml(item: CharacterInventoryItemRow): string {
  const q = Math.min(7, Math.max(0, item.Quality));
  const color = ITEM_QUALITY_COLOR[q] ?? ITEM_QUALITY_COLOR[1];
  const parts: string[] = [];

  const title = item.count > 1 ? `${item.name} (${item.count})` : item.name;
  parts.push(`<div class="wow-tt-name" style="color:${color}">${escapeHtml(title)}</div>`);

  const bond = BONDING_LABEL[item.bonding];
  if (bond) {
    parts.push(`<div class="wow-tt-bond">${escapeHtml(bond)}</div>`);
  }

  if (item.ItemLevel > 0) {
    parts.push(`<div class="wow-tt-ilvl">Item Level <span class="wow-tt-num">${item.ItemLevel}</span></div>`);
  }

  const enchId = firstEnchantmentId(item.enchantments);
  if (enchId) {
    parts.push(`<div class="wow-tt-ench">Enchantment <span class="wow-tt-dim">#${enchId}</span></div>`);
  }

  if (item.armor > 0) {
    parts.push(`<div class="wow-tt-stat">${item.armor} Armor</div>`);
  }

  const delaySec = item.delay > 0 ? item.delay / 1000 : 0;
  const hasDmg1 = item.dmg_min1 > 0 || item.dmg_max1 > 0;
  if (hasDmg1) {
    const min = Math.round(item.dmg_min1);
    const max = Math.round(item.dmg_max1);
    let line = `${min} - ${max} Damage`;
    if (delaySec > 0) {
      line += ` <span class="wow-tt-dim">(${delaySec.toFixed(2)} Speed)</span>`;
      const dps = ((item.dmg_min1 + item.dmg_max1) / 2 / delaySec).toFixed(1);
      line += `<br/><span class="wow-tt-dim">(${dps} damage per second)</span>`;
    }
    parts.push(`<div class="wow-tt-stat">${line}</div>`);
  }

  const hasDmg2 = item.dmg_min2 > 0 || item.dmg_max2 > 0;
  if (hasDmg2) {
    const min = Math.round(item.dmg_min2);
    const max = Math.round(item.dmg_max2);
    parts.push(`<div class="wow-tt-stat">+ ${min} - ${max} Damage</div>`);
  }

  for (let i = 1; i <= 10; i += 1) {
    const type = item[`stat_type${i}` as keyof CharacterInventoryItemRow] as number;
    const value = item[`stat_value${i}` as keyof CharacterInventoryItemRow] as number;
    if (!type || !value) continue;
    const label = STAT_TYPE_LABEL[type] ?? `Stat ${type}`;
    parts.push(`<div class="wow-tt-stat-plus">+${value} ${escapeHtml(label)}</div>`);
  }

  const resists: string[] = [];
  if (item.holy_res) resists.push(`${item.holy_res} Holy Resist`);
  if (item.fire_res) resists.push(`${item.fire_res} Fire Resist`);
  if (item.nature_res) resists.push(`${item.nature_res} Nature Resist`);
  if (item.frost_res) resists.push(`${item.frost_res} Frost Resist`);
  if (item.shadow_res) resists.push(`${item.shadow_res} Shadow Resist`);
  if (item.arcane_res) resists.push(`${item.arcane_res} Arcane Resist`);
  if (resists.length) {
    parts.push(`<div class="wow-tt-res">${resists.map((r) => escapeHtml(r)).join('<br/>')}</div>`);
  }

  for (let s = 1; s <= 3; s += 1) {
    const sc = item[`socketColor_${s}` as keyof CharacterInventoryItemRow] as number;
    if (!sc) continue;
    const lab = SOCKET_LABEL[sc] ?? `Socket (${sc})`;
    parts.push(`<div class="wow-tt-socket">${escapeHtml(lab)}</div>`);
  }

  if (item.maxDurability > 0) {
    parts.push(
      `<div class="wow-tt-dur">Durability <span class="wow-tt-num">${item.currentDurability}</span> / <span class="wow-tt-num">${item.maxDurability}</span></div>`,
    );
  }

  const desc = stripWowColorCodes(item.description);
  if (desc) {
    parts.push(`<div class="wow-tt-desc">${escapeHtml(desc)}</div>`);
  }

  const wh = `https://www.wowhead.com/wotlk/item=${item.itemEntry}`;
  parts.push(
    `<a class="wow-tt-link" href="#" data-external-url="${escapeHtml(wh)}">Wowhead</a>`,
  );

  return `<div class="wow-tt">${parts.join('')}</div>`;
}

function positionTooltip(tooltipEl: HTMLElement, e: MouseEvent): void {
  const pad = 14;
  tooltipEl.classList.remove('hidden');
  const tw = tooltipEl.offsetWidth;
  const th = tooltipEl.offsetHeight;
  let x = e.clientX + pad;
  let y = e.clientY + pad;
  if (x + tw > window.innerWidth - 10) x = e.clientX - tw - pad;
  if (y + th > window.innerHeight - 10) y = e.clientY - th - pad;
  tooltipEl.style.left = `${Math.max(6, x)}px`;
  tooltipEl.style.top = `${Math.max(6, y)}px`;
}

/** Bind mouse tooltips for rows with `data-inv-idx`. Returns cleanup. */
export function bindInventoryTableTooltips(
  tbody: HTMLElement,
  tooltipEl: HTMLElement,
  rows: CharacterInventoryItemRow[],
): () => void {
  const disposers: Array<() => void> = [];

  tbody.querySelectorAll<HTMLElement>('[data-inv-idx]').forEach((el) => {
    let onDocMove: ((ev: MouseEvent) => void) | null = null;

    const leave = (): void => {
      tooltipEl.classList.add('hidden');
      if (onDocMove) {
        document.removeEventListener('mousemove', onDocMove);
        onDocMove = null;
      }
    };

    const enter = (e: MouseEvent): void => {
      const idx = Number(el.dataset.invIdx);
      const item = rows[idx];
      if (!item) {
        leave();
        return;
      }
      tooltipEl.innerHTML = buildWowItemTooltipHtml(item);
      positionTooltip(tooltipEl, e);
      onDocMove = (ev: MouseEvent) => {
        positionTooltip(tooltipEl, ev);
      };
      document.addEventListener('mousemove', onDocMove);
    };

    const move = (e: MouseEvent): void => {
      if (!tooltipEl.classList.contains('hidden')) positionTooltip(tooltipEl, e);
    };

    el.addEventListener('mouseenter', enter);
    el.addEventListener('mousemove', move);
    el.addEventListener('mouseleave', leave);

    disposers.push(() => {
      el.removeEventListener('mouseenter', enter);
      el.removeEventListener('mousemove', move);
      el.removeEventListener('mouseleave', leave);
      leave();
    });
  });

  return () => {
    disposers.forEach((d) => d());
    tooltipEl.classList.add('hidden');
  };
}
