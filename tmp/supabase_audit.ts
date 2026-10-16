import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_ANON_KEY || "";

const client = createClient(url, key);

async function runAudit() {
  console.log("=== SUPABASE PRODUCTION LIVE QUERY AUDIT ===");
  console.log("Project URL:", url);
  console.log("Project Ref:", url.replace("https://", "").replace(".supabase.co", ""));

  const tables = [
    "dental_doctors",
    "doctor_branch_assignments",
    "doctor_schedules",
    "dental_branches",
    "master_services",
    "branch_service_tariffs",
    "promotion_media",
    "patient_profiles",
    "bookings",
    "patient_visits",
    "queue_items",
    "treatment_jobs",
    "invoices",
    "payment_transactions"
  ];

  for (const table of tables) {
    const res = await client.from(table).select("*").limit(5);
    if (res.error) {
      console.log(`[-] ${table}: Error ${res.error.code} - ${res.error.message} (status ${res.status})`);
    } else {
      console.log(`[+] ${table}: OK (status ${res.status}), records count returned: ${res.data?.length}`);
    }
  }
}

runAudit();
