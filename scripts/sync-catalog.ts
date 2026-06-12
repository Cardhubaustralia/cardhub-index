// One-off / scheduled catalog sync:  npm run sync:catalog
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { adminClient } = await import("../src/lib/supabase/admin");
  const { syncCatalog } = await import("../src/lib/sync");
  await syncCatalog(adminClient());
  console.log("catalog sync complete");
}
main().catch((e) => { console.error(e); process.exit(1); });
