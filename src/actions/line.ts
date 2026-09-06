"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { notifyTo, appUrl } from "@/lib/line/send";
import { cardTest } from "@/lib/line/flex";
import { thDateTime } from "@/lib/format";
import type { ActionResult } from "@/components/action-form";

function fail(message: string): ActionResult {
  return { ok: false, message };
}
function s(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}

async function ownerOnly() {
  const me = await currentProfile();
  if (!me) return { me: null, err: fail("ต้องเข้าสู่ระบบก่อน") };
  if (me.role !== "owner") return { me, err: fail("เฉพาะเจ้าของเท่านั้นที่ตั้งค่าการแจ้งเตือนได้") };
  return { me, err: null };
}

// ============================================================================
// บันทึกโทเคนและการเปิดใช้งาน
// ============================================================================
export async function saveLineSettings(fd: FormData): Promise<ActionResult> {
  const { me, err } = await ownerOnly();
  if (err) return err;

  const sb = supabaseServer();
  const token = s(fd, "channel_token");
  const secret = s(fd, "channel_secret");
  const time = s(fd, "daily_summary_time") || "08:30";

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    return fail("เวลาส่งสรุปต้องอยู่ในรูปแบบ ชั่วโมง:นาที เช่น 08:30");

  const patch: Record<string, unknown> = {
    enabled: s(fd, "enabled") === "on",
    daily_summary_time: time,
    updated_at: new Date().toISOString(),
    updated_by: me?.full_name ?? null,
  };

  // ช่องโทเคนแสดงเป็นดาวบนหน้าจอ ถ้าไม่ได้พิมพ์ใหม่ก็ไม่ต้องทับของเดิม
  if (token && !token.startsWith("•")) {
    if (token.length < 40) return fail("โทเคนสั้นผิดปกติ ตรวจว่าคัดลอกมาครบหรือยัง");
    patch.channel_token = token;
  }
  if (secret && !secret.startsWith("•")) patch.channel_secret = secret;

  const { error } = await sb.from("line_settings").update(patch).eq("id", 1);
  if (error) return fail(error.message);

  revalidatePath("/settings/line");
  return { ok: true, message: "บันทึกการตั้งค่าแล้ว" };
}

// ============================================================================
// ปลายทาง
// ============================================================================
export async function addLineTarget(fd: FormData): Promise<ActionResult> {
  const { err } = await ownerOnly();
  if (err) return err;

  const sb = supabaseServer();
  const name = s(fd, "name");
  const targetId = s(fd, "target_id");
  const type = s(fd, "target_type") || "group";

  if (!name) return fail("ตั้งชื่อปลายทางให้จำง่าย เช่น กลุ่มบัญชี");
  if (!targetId) return fail("ใส่รหัสกลุ่มหรือรหัสผู้ใช้จากไลน์");
  if (targetId.length < 20)
    return fail("รหัสจากไลน์สั้นผิดปกติ ปกติขึ้นต้นด้วย C หรือ U แล้วตามด้วยตัวอักษรอีกสามสิบกว่าตัว");

  const { error } = await sb.from("line_targets").insert({
    name, target_id: targetId, target_type: type, note: s(fd, "note") || null,
  });
  if (error) {
    if (error.message.includes("duplicate")) return fail("รหัสปลายทางนี้มีอยู่แล้ว");
    return fail(error.message);
  }

  revalidatePath("/settings/line");
  return { ok: true, message: `เพิ่มปลายทาง ${name} แล้ว` };
}

export async function removeLineTarget(fd: FormData): Promise<ActionResult> {
  const { err } = await ownerOnly();
  if (err) return err;
  const { error } = await supabaseServer()
    .from("line_targets").delete().eq("id", s(fd, "id"));
  if (error) return fail(error.message);
  revalidatePath("/settings/line");
  return { ok: true, message: "ลบปลายทางแล้ว" };
}

// ============================================================================
// เปิดปิดรายเหตุการณ์ และเลือกปลายทาง
// ============================================================================
export async function saveLineEvents(fd: FormData): Promise<ActionResult> {
  const { err } = await ownerOnly();
  if (err) return err;

  const sb = supabaseServer();
  const { data: events } = await sb.from("line_events").select("key");

  for (const e of events ?? []) {
    const target = s(fd, `target_${e.key}`);
    await sb
      .from("line_events")
      .update({
        enabled: s(fd, `on_${e.key}`) === "on",
        target_id: target || null,
      })
      .eq("key", e.key);
  }

  revalidatePath("/settings/line");
  return { ok: true, message: "บันทึกการแจ้งเตือนแล้ว" };
}

// ============================================================================
// ส่งทดสอบ
// ============================================================================
export async function sendLineTest(fd: FormData): Promise<ActionResult> {
  const { me, err } = await ownerOnly();
  if (err) return err;

  const targetId = s(fd, "target_id");
  if (!targetId) return fail("เลือกปลายทางที่จะส่งทดสอบ");

  const bubble = cardTest({
    by: me?.full_name ?? "เจ้าของ",
    when: thDateTime(new Date()),
    url: appUrl("/"),
  });

  const res = await notifyTo(targetId, "ทดสอบการแจ้งเตือนจาก BROVA", bubble);
  revalidatePath("/settings/line");

  if (!res.ok) {
    return fail(
      `ส่งไม่สำเร็จ ${res.error ?? ""} · ตรวจว่าโทเคนถูกต้อง บอทอยู่ในกลุ่มนั้นจริง และแพ็กเกจยังมีโควตาเหลือ`,
    );
  }
  return { ok: true, message: "ส่งแล้ว เปิดไลน์ดูได้เลย" };
}
