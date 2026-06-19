/**
 * Parse a Showdown/pokepaste text block into an array of team member objects.
 */

export function toID(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const STAT_LABELS = {
  HP: "hp",
  Atk: "atk",
  Def: "def",
  SpA: "spa",
  SpD: "spd",
  Spe: "spe",
};

function parseEvLine(str, target) {
  for (const part of str.split("/")) {
    const m = part.trim().match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    const key = STAT_LABELS[m[2].trim()];
    if (key) target[key] = parseInt(m[1], 10);
  }
}

function parseHeader(line) {
  let rest = line.trim();
  let item = null;

  // Extract " @ Item"
  const atIdx = rest.lastIndexOf(" @ ");
  if (atIdx >= 0) {
    item = toID(rest.slice(atIdx + 3).trim());
    rest = rest.slice(0, atIdx).trim();
  }

  // Extract trailing gender: (M), (F), or (N)
  let gender = null;
  const gm = rest.match(/\s*\(([MFN])\)\s*$/);
  if (gm) {
    gender = gm[1];
    rest = rest.slice(0, rest.length - gm[0].length).trim();
  }

  // Try "Nickname (Species)" pattern — last balanced parens group
  let species,
    nickname = null;
  const nickMatch = rest.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
  if (nickMatch) {
    nickname = nickMatch[1].trim() || null;
    species = toID(nickMatch[2].trim());
  } else {
    species = toID(rest.trim());
  }

  return { species, nickname, item, gender };
}

function defaultEvs() {
  return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
}
function defaultIvs() {
  return { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
}

function parseBlock(lines, slot) {
  if (!lines.length || !lines[0].trim()) return null;

  const { species, nickname, item, gender } = parseHeader(lines[0]);
  if (!species) return null;

  const member = {
    slot,
    nickname,
    species,
    item,
    ability: null,
    level: 50,
    gender,
    shiny: false,
    teraType: null,
    nature: null,
    evs: defaultEvs(),
    ivs: defaultIvs(),
    moves: [],
    // _types and _baseStats enriched by engine after dex lookup
  };

  for (const line of lines.slice(1)) {
    const t = line.trim();
    if (!t) continue;

    if (t.startsWith("- ")) {
      const moveId = toID(t.slice(2));
      if (moveId) member.moves.push(moveId);
    } else if (t.startsWith("Ability: ")) {
      member.ability = toID(t.slice(9));
    } else if (t.startsWith("Level: ")) {
      member.level = parseInt(t.slice(7), 10) || 50;
    } else if (t.startsWith("Tera Type: ")) {
      member.teraType = toID(t.slice(11));
    } else if (t.startsWith("Shiny: ")) {
      member.shiny = t.slice(7).trim().toLowerCase() === "yes";
    } else if (t.startsWith("EVs: ")) {
      parseEvLine(t.slice(5), member.evs);
    } else if (t.startsWith("IVs: ")) {
      parseEvLine(t.slice(5), member.ivs);
    } else if (/Nature\s*$/.test(t)) {
      member.nature = t
        .replace(/\s*Nature\s*$/, "")
        .trim()
        .toLowerCase();
    }
    // Ignore Happiness, Dynamax Level, etc.
  }

  return member;
}

export function parseShowdownPaste(text) {
  const blocks = text.trim().split(/\n[ \t]*\n+/);
  const members = [];
  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].split("\n");
    const member = parseBlock(lines, members.length);
    if (member) members.push(member);
  }
  return members;
}
