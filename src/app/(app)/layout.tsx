import { redirect } from "next/navigation";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { Shell } from "@/components/shell";
import { ROLE_TH, type Role } from "@/lib/workflow";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await currentProfile();
  if (!me) redirect("/login");

  const sb = supabaseServer();
  const { count } = await sb
    .from("approvals")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return (
    <Shell
      user={{
        name: me.full_name,
        role: me.role,
        roleTh: ROLE_TH[me.role as Role] ?? me.role,
      }}
      pending={count ?? 0}
    >
      {children}
    </Shell>
  );
}
