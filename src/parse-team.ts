/**
 * Parses a Showdown/pokepaste text block into an array of team member
 * objects. This is the only entry point most callers need — see
 * {@link parseShowdownPaste}.
 */
import { maxIvs, zeroEvs } from "./stat-calc.js";
import type { EvSpread, TeamMember } from "./types.js";

/**
 * Converts a display name to a canonical Showdown id: lowercase,
 * alphanumerics only (e.g. `'Landorus-Therian'` -> `'landorustherian'`,
 * `'Freeze-Dry'` -> `'freezedry'`).
 */
export function toID(str: string): string {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const STAT_LABELS: Record<string, keyof EvSpread> = {
  HP: "hp",
  Atk: "atk",
  Def: "def",
  SpA: "spa",
  SpD: "spd",
  Spe: "spe",
};

function parseEvLine(str: string, target: Required<EvSpread>): void {
  for (const part of str.split("/")) {
    const m = part.trim().match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    const key = STAT_LABELS[m[2].trim()];
    if (key) target[key] = parseInt(m[1], 10);
  }
}

interface ParsedHeader {
  species: string;
  nickname: string | null;
  item: string | null;
  gender: "M" | "F" | "N" | null;
}

function parseHeader(line: string): ParsedHeader {
  let rest = line.trim();
  let item: string | null = null;

  // Extract " @ Item"
  const atIdx = rest.lastIndexOf(" @ ");
  if (atIdx >= 0) {
    item = toID(rest.slice(atIdx + 3).trim());
    rest = rest.slice(0, atIdx).trim();
  }

  // Extract trailing gender: (M), (F), or (N)
  let gender: "M" | "F" | "N" | null = null;
  const gm = rest.match(/\s*\(([MFN])\)\s*$/);
  if (gm) {
    gender = gm[1] as "M" | "F" | "N";
    rest = rest.slice(0, rest.length - gm[0].length).trim();
  }

  // Try "Nickname (Species)" pattern — last balanced parens group
  let species: string;
  let nickname: string | null = null;
  const nickMatch = rest.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
  if (nickMatch) {
    nickname = nickMatch[1].trim() || null;
    species = toID(nickMatch[2].trim());
  } else {
    species = toID(rest.trim());
  }

  return { species, nickname, item, gender };
}

function parseBlock(lines: string[], slot: number): TeamMember | null {
  if (!lines.length || !lines[0].trim()) return null;

  const { species, nickname, item, gender } = parseHeader(lines[0]);
  if (!species) return null;

  const member: TeamMember = {
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
    evs: zeroEvs(),
    ivs: maxIvs(),
    moves: [],
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

/**
 * Parses a Showdown/pokepaste team export into team member objects.
 * Members are separated by blank lines; each block's first line is the
 * `Nickname (Species) (Gender) @ Item` header, followed by `Ability:`,
 * `Level:`, `Tera Type:`, `Shiny:`, `EVs:`, `IVs:`, a `<Nature> Nature`
 * line, and `- Move` lines in any order. Unrecognized lines (Happiness,
 * Dynamax Level, etc.) are ignored.
 *
 * Note: this only parses the team — it does not enrich members with dex
 * data (types/base stats). Call {@link enrichTeam} after parsing if the
 * caller needs those (the engine does this automatically).
 *
 * @param text - The raw paste text.
 * @returns One {@link TeamMember} per non-empty block, in paste order.
 */
export function parseShowdownPaste(text: string): TeamMember[] {
  const blocks = text.trim().split(/\n[ \t]*\n+/);
  const members: TeamMember[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const member = parseBlock(lines, members.length);
    if (member) members.push(member);
  }
  return members;
}
