"use server";
// Player-facing server actions — thin wrappers over security-definer RPCs.
import { revalidatePath } from "next/cache";
import { serverClient } from "@/lib/supabase/server";

export interface ActionResult {
  ok: boolean;
  message: string;
}

export async function placeOrder(
  leagueId: string,
  assetId: number,
  side: "buy" | "sell",
  qty: number
): Promise<ActionResult> {
  const supabase = await serverClient();
  const { error } = await supabase.rpc("place_order", {
    p_league_id: leagueId,
    p_asset_id: assetId,
    p_side: side,
    p_qty: qty,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/portfolio");
  return {
    ok: true,
    message: `${side === "buy" ? "Buy" : "Sell"} order locked in — executes at the next price update`,
  };
}

export async function cancelOrder(orderId: string): Promise<ActionResult> {
  const supabase = await serverClient();
  const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/portfolio");
  return { ok: true, message: "Order cancelled" };
}

export interface UniverseRules {
  games?: string[];
  set_ids?: number[];
  rarities?: string[];
  name_like?: string;
  sealed?: "any" | "only" | "exclude";
}

export async function createGame(input: {
  name: string;
  joinPolicy: "open" | "invite";
  startingCash: number;
  maxPositionPct: number;
  durationDays: number;
  universe: UniverseRules;
}): Promise<ActionResult & { leagueId?: string }> {
  const supabase = await serverClient();
  const { data, error } = await supabase.rpc("create_game", {
    p_name: input.name,
    p_join_policy: input.joinPolicy,
    p_starting_cash: input.startingCash,
    p_max_position_pct: input.maxPositionPct,
    p_duration_days: input.durationDays,
    p_universe: input.universe,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/leagues");
  return { ok: true, message: "Game created", leagueId: data?.id };
}

export async function joinLeague(code: string): Promise<ActionResult> {
  const supabase = await serverClient();
  const { error } = await supabase.rpc("join_league", { p_invite_code: code });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/leagues");
  return { ok: true, message: "Joined league!" };
}

export async function markOnboarded(): Promise<ActionResult> {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in" };
  const { error } = await supabase
    .from("profiles").update({ onboarded: true }).eq("user_id", user.id);
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "" };
}

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in" };
  const { error } = await supabase
    .from("profiles")
    .update({
      username: String(formData.get("username") ?? ""),
      display_name: String(formData.get("display_name") ?? ""),
      country: String(formData.get("country") ?? "") || null,
    })
    .eq("user_id", user.id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/settings");
  return { ok: true, message: "Profile saved" };
}
