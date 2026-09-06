import { supabaseServer } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // ระบบยังไม่มีใครเลยหรือเปล่า ถ้าไม่มีให้ตั้งบัญชีเจ้าของคนแรกก่อน
  const sb = supabaseServer();
  const { data } = await sb.rpc("has_any_user");
  return <LoginForm hasUser={data === true} />;
}
