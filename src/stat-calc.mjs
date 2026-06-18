/**
 * Level-50 stat formula and nature/modifier lookup.
 */

// [+stat, -stat] for each nature; neutral natures have empty entry.
const NATURES = {
  hardy: [], docile: [], serious: [], bashful: [], quirky: [],
  lonely:  ['atk', 'def'],  brave:  ['atk', 'spe'],  adamant: ['atk', 'spa'],  naughty: ['atk', 'spd'],
  bold:    ['def', 'atk'],  relaxed: ['def', 'spe'], impish:  ['def', 'spa'],  lax:     ['def', 'spd'],
  timid:   ['spe', 'atk'],  hasty:  ['spe', 'def'],  jolly:  ['spe', 'spa'],  naive:   ['spe', 'spd'],
  modest:  ['spa', 'atk'],  mild:   ['spa', 'def'],  quiet:  ['spa', 'spe'],  rash:    ['spa', 'spd'],
  calm:    ['spd', 'atk'],  gentle: ['spd', 'def'],  sassy:  ['spd', 'spe'],  careful: ['spd', 'spa'],
};

export function natureModifier(nature, stat) {
  const mods = NATURES[nature?.toLowerCase()] ?? [];
  if (mods[0] === stat) return 1.1;
  if (mods[1] === stat) return 0.9;
  return 1.0;
}

/**
 * Compute the level-50 stat value.
 * @param {'hp'|'atk'|'def'|'spa'|'spd'|'spe'} stat
 */
export function calcStat(stat, base, ev = 0, iv = 31, nature = 'hardy', level = 50) {
  const inner = Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100);
  if (stat === 'hp') return inner + level + 10;
  return Math.floor((inner + 5) * natureModifier(nature, stat));
}

// Multipliers applied on top of the computed stat value.
const MODS = {
  scarf:              {stat: 'spe', mult: 1.5},
  tailwind:           {stat: 'spe', mult: 2},
  paralysis:          {stat: 'spe', mult: 0.5},
  swift_swim:         {stat: 'spe', mult: 2},
  chlorophyll:        {stat: 'spe', mult: 2},
  sand_rush:          {stat: 'spe', mult: 2},
  slush_rush:         {stat: 'spe', mult: 2},
  surge_surfer:       {stat: 'spe', mult: 2},
  unburden:           {stat: 'spe', mult: 2},
  quark_drive_spe:    {stat: 'spe', mult: 1.5},
  protosynthesis_spe: {stat: 'spe', mult: 1.5},
  choice_band:        {stat: 'atk', mult: 1.5},
  choice_specs:       {stat: 'spa', mult: 1.5},
  iron_ball:          {stat: 'spe', mult: 0.5},
  grass_pelt:         {stat: 'def', mult: 1.5},
};

export function applyMods(value, stat, mods) {
  let v = value;
  for (const mod of (mods ?? [])) {
    const def = MODS[mod];
    if (def?.stat === stat) v = Math.floor(v * def.mult);
  }
  return v;
}
