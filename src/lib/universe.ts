// Human-readable label for a game's card universe rules.
export interface Universe {
  games?: string[];
  set_ids?: number[];
  rarities?: string[];
  name_like?: string;
  sealed?: string;
}

export function universeLabel(u: Universe | null | undefined): string {
  if (!u || Object.keys(u).length === 0) return "All cards";
  const parts: string[] = [];
  if (u.games?.length)
    parts.push(u.games.map((g) => (g === "one-piece" ? "One Piece" : "Pokémon")).join(" + "));
  if (u.name_like) parts.push(`“${u.name_like}” cards`);
  if (u.rarities?.length) parts.push(u.rarities.join(", "));
  if (u.set_ids?.length) parts.push(`${u.set_ids.length} set${u.set_ids.length > 1 ? "s" : ""}`);
  if (u.sealed === "only") parts.push("sealed only");
  if (u.sealed === "exclude") parts.push("singles only");
  return parts.length ? parts.join(" · ") : "All cards";
}
