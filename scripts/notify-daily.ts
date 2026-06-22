// Generate daily "days left" game notifications. Run from the daily cron.
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { adminClient } = await import("../src/lib/supabase/admin");
  const { error } = await adminClient().rpc("notify_daily");
  if (error) throw new Error(error.message);
  console.log("daily notifications generated");
}
main().catch((e) => { console.error(e); process.exit(1); });
