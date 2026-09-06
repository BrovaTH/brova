import { NextResponse } from "next/server";
import { adminClient, ADMIN_MISSING } from "@/lib/supabase/admin";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";

/**
 * สร้างและจัดการผู้ใช้
 *
 * ต้องใช้กุญแจระดับระบบเพราะการสร้างบัญชีเป็นสิทธิ์ของผู้ดูแล
 * กุญแจนี้อยู่ในตัวแปรฝั่งเซิร์ฟเวอร์เท่านั้น ไม่มี NEXT_PUBLIC นำหน้า
 * จึงไม่ถูกส่งไปที่เบราว์เซอร์ และไม่มีทางหลุดออกไปทางหน้าเว็บ
 *
 * ใครเรียกได้บ้าง
 *   ตอนระบบยังไม่มีผู้ใช้เลย  ใครก็ได้ เพื่อตั้งบัญชีเจ้าของคนแรก
 *   หลังจากนั้น              เฉพาะเจ้าของเท่านั้น
 */

export const dynamic = "force-dynamic";

const ROLES = ["owner", "sales", "design", "production", "qc", "warehouse", "finance", "affiliate"];

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(req: Request) {
  const sb = adminClient();
  if (!sb) {
    return bad(ADMIN_MISSING, 500);
  }

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return bad("ข้อมูลที่ส่งมาไม่ถูกต้อง");
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const fullName = String(body.full_name ?? "").trim();
  const role = String(body.role ?? "sales");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("อีเมลไม่ถูกต้อง");
  if (password.length < 8) return bad("รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร");
  if (!fullName) return bad("ใส่ชื่อผู้ใช้ด้วย");
  if (!ROLES.includes(role)) return bad("บทบาทไม่ถูกต้อง");

  // ---------------------------------------------------------------- ใครเรียก
  const { count } = await sb.from("profiles").select("id", { count: "exact", head: true });
  const isBootstrap = (count ?? 0) === 0;

  if (!isBootstrap) {
    const me = await currentProfile();
    if (!me) return bad("ต้องเข้าสู่ระบบก่อน", 401);
    if (me.role !== "owner") return bad("เฉพาะเจ้าของเท่านั้นที่สร้างผู้ใช้ได้", 403);
  }

  // บัญชีแรกของระบบต้องเป็นเจ้าของเสมอ ไม่ว่าจะเลือกอะไรมา
  const finalRole = isBootstrap ? "owner" : role;

  const { data: created, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,               // ใช้ในองค์กร ไม่ต้องให้ยืนยันอีเมล
    user_metadata: { full_name: fullName },
  });

  if (error) {
    const msg = error.message.includes("already")
      ? "อีเมลนี้มีบัญชีอยู่แล้ว"
      : error.message;
    return bad(msg);
  }

  // ทริกเกอร์สร้างโปรไฟล์ให้อัตโนมัติแล้ว เหลือแค่ปรับชื่อกับบทบาทให้ตรง
  await sb
    .from("profiles")
    .update({
      full_name: fullName,
      role: finalRole,
      can_see_cost: finalRole === "owner" || finalRole === "finance",
      active: true,
    })
    .eq("id", created.user!.id);

  return NextResponse.json({
    ok: true,
    bootstrap: isBootstrap,
    message: isBootstrap
      ? `สร้างบัญชีเจ้าของ ${fullName} แล้ว เข้าสู่ระบบได้เลย`
      : `สร้างผู้ใช้ ${fullName} แล้ว`,
  });
}

// ---------------------------------------------------------------- ตั้งรหัสผ่านใหม่
export async function PATCH(req: Request) {
  const sb = adminClient();
  if (!sb) return bad(ADMIN_MISSING, 500);

  const me = await currentProfile();
  if (!me) return bad("ต้องเข้าสู่ระบบก่อน", 401);
  if (me.role !== "owner") return bad("เฉพาะเจ้าของเท่านั้นที่ตั้งรหัสผ่านให้คนอื่นได้", 403);

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return bad("ข้อมูลที่ส่งมาไม่ถูกต้อง");
  }

  const id = String(body.id ?? "");
  const password = String(body.password ?? "");
  if (!id) return bad("ไม่พบผู้ใช้");
  if (password.length < 8) return bad("รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร");

  const { error } = await sb.auth.admin.updateUserById(id, { password });
  if (error) return bad(error.message);

  return NextResponse.json({ ok: true, message: "ตั้งรหัสผ่านใหม่แล้ว แจ้งเจ้าตัวได้เลย" });
}

// ---------------------------------------------------------------- ระบบพร้อมใช้หรือยัง
export async function GET() {
  const sb = supabaseServer();
  const { data } = await sb.rpc("has_any_user");
  return NextResponse.json({ hasUser: data === true });
}
