"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import type { ActionResult } from "@/components/action-form";

const ROLES = ["owner", "sales", "design", "production", "qc", "warehouse", "finance", "affiliate"];

function fail(message: string): ActionResult {
  return { ok: false, message };
}
function s(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}

async function ownerOnly() {
  const me = await currentProfile();
  if (!me) return { me: null, err: fail("ต้องเข้าสู่ระบบก่อน") };
  if (me.role !== "owner") return { me, err: fail("เฉพาะเจ้าของเท่านั้นที่จัดการผู้ใช้ได้") };
  return { me, err: null };
}

/**
 * แก้บทบาทและสิทธิ์เห็นต้นทุน
 * ฐานข้อมูลมีตัวกันอีกชั้น ไม่ให้ลดเจ้าของคนสุดท้ายจนระบบไม่เหลือเจ้าของ
 */
export async function setUserRole(fd: FormData): Promise<ActionResult> {
  const { err } = await ownerOnly();
  if (err) return err;

  const id = s(fd, "id");
  const role = s(fd, "role");
  if (!id) return fail("ไม่พบผู้ใช้");
  if (!ROLES.includes(role)) return fail("บทบาทไม่ถูกต้อง");

  const { error } = await supabaseServer()
    .from("profiles")
    .update({ role, can_see_cost: s(fd, "can_see_cost") === "on" })
    .eq("id", id);

  if (error) return fail(error.message);

  revalidatePath("/settings/users");
  revalidatePath("/settings");
  return { ok: true, message: "บันทึกบทบาทแล้ว" };
}

/** ปิดหรือเปิดการใช้งานบัญชี */
export async function setUserActive(fd: FormData): Promise<ActionResult> {
  const { me, err } = await ownerOnly();
  if (err) return err;

  const id = s(fd, "id");
  const active = s(fd, "active") === "on";
  if (!id) return fail("ไม่พบผู้ใช้");
  if (id === me?.id) return fail("ปิดใช้งานบัญชีตัวเองไม่ได้");

  const { error } = await supabaseServer()
    .from("profiles")
    .update({ active })
    .eq("id", id);

  if (error) return fail(error.message);

  revalidatePath("/settings/users");
  return { ok: true, message: active ? "เปิดใช้งานแล้ว" : "ปิดใช้งานแล้ว เข้าระบบไม่ได้อีก" };
}
