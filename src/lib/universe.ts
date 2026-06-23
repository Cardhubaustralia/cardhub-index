// A game's tradeable card pool. Empty {} / null = every card. Rules are
// ANDed and map directly onto v_market columns (game_slug, group_id,
// rarity, name, is_sealed), so the market applies them as query filters.
// Single source of truth — imported by actions, the market, and forms.
export interface Universe {
  games?: string[];
  set_ids?: number[];
  rarities?: string[];
  name_like?: string;
  sealed?: "any" | "only" | "exclude";
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
