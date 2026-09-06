import { NextResponse } from "next/server";
import { adminClient, ADMIN_MISSING } from "@/lib/supabase/admin";
import crypto from "crypto";

/**
 * ปลายทางที่ไลน์ยิงเข้ามา
 *
 * ใช้ทำอย่างเดียวคือจับรหัสกลุ่มให้อัตโนมัติ
 * เชิญบอทเข้ากลุ่มไหน ระบบจะบันทึกรหัสกลุ่มนั้นไว้ให้เอง
 * ไม่ต้องไปหารหัสกลุ่มเองซึ่งหายากมาก
 *
 * ตรวจลายเซ็นทุกครั้งด้วย Channel Secret
 * ถ้าลายเซ็นไม่ตรงแปลว่าไม่ได้มาจากไลน์จริง ต้องปฏิเสธทันที
 */

export const dynamic = "force-dynamic";

function verify(secret: string, body: string, signature: string | null): boolean {
  if (!signature) return false;
  const expect = crypto.createHmac("sha256", secret).update(body).digest("base64");
  const a = Buffer.from(expect);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const sb = adminClient();
  if (!sb) return NextResponse.json({ ok: true, note: "ยังไม่ได้ตั้งค่ากุญแจระบบ" });

  const body = await req.text();

  const { data: settings } = await sb
    .from("line_settings")
    .select("channel_secret")
    .eq("id", 1)
    .maybeSingle();

  const secret = settings?.channel_secret;
  if (!secret) return NextResponse.json({ ok: true, note: "ยังไม่ได้ใส่ Channel Secret" });

  if (!verify(secret, body, req.headers.get("x-line-signature"))) {
    return NextResponse.json({ error: "ลายเซ็นไม่ถูกต้อง" }, { status: 401 });
  }

  let events: { type?: string; source?: { type?: string; groupId?: string; roomId?: string; userId?: string } }[] = [];
  try {
    events = JSON.parse(body).events ?? [];
  } catch {
    return NextResponse.json({ ok: true });
  }

  for (const ev of events) {
    const src = ev.source ?? {};
    const id = src.groupId || src.roomId || src.userId;
    if (!id) continue;

    const type = src.groupId ? "group" : src.roomId ? "room" : "user";
    const label =
      type === "group" ? "กลุ่มใหม่ที่เชิญบอทเข้าไป"
      : type === "room" ? "ห้องแชทใหม่"
      : "ผู้ใช้ที่ทักบอท";

    // มีอยู่แล้วก็ไม่ต้องเพิ่มซ้ำ
    const { data: exists } = await sb
      .from("line_targets")
      .select("id")
      .eq("target_id", id)
      .maybeSingle();
    if (exists) continue;

    await sb.from("line_targets").insert({
      name: `${label} · ${id.slice(0, 8)}`,
      target_id: id,
      target_type: type,
      note: "ระบบจับรหัสให้อัตโนมัติ ตั้งชื่อใหม่ได้ที่หน้าตั้งค่า",
      active: false,   // ให้เจ้าของเปิดเองหลังตรวจแล้วว่าใช่กลุ่มที่ต้องการ
    });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, note: "ปลายทางสำหรับ LINE Messaging API" });
}
