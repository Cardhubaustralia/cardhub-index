// Advance the cycle state machine once:  npm run cycle:tick
// (run from cron every minute if not using Vercel Cron)
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { adminClient } = await import("../src/lib/supabase/admin");
  const { tick } = await import("../src/lib/cycles");
  const result = await tick(adminClient());
  console.log(JSON.stringify(result, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
