"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

// ============================================================================
// ข้อมูลบริษัทและภาษี
//
// ทุกอย่างในหน้านี้ไปขึ้นบนหัวเอกสารที่ออกจากระบบ
//
// เรื่องสำคัญที่สุดคือ เอกสารที่ออกเลขไปแล้วจะไม่เปลี่ยนตาม
// เพราะตอนออกใบ ระบบคัดลอกข้อมูลบริษัท ณ วันนั้นเก็บไว้กับใบนั้นเลย
// ถ้าย้ายที่อยู่แล้วใบเก่าเปลี่ยนตามด้วย ใบที่ลูกค้าถืออยู่จะไม่ตรงกับใบในระบบ
// ============================================================================

function text(fd: FormData, key: string): string | null {
  const v = String(fd.get(key) ?? "").trim();
  return v === "" ? null : v;
}

function pct(fd: FormData, key: string, fallback: number): number {
  const n = Number(String(fd.get(key) ?? "").trim());
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : fallback;
}

export async function saveCompany(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const me = await currentProfile();

  // ข้อมูลชุดนี้ขึ้นบนเอกสารที่ส่งออกไปข้างนอกทุกใบ จึงให้เจ้าของแก้เท่านั้น
  if (me?.role !== "owner")
    return { ok: false, message: "เฉพาะเจ้าของกิจการเท่านั้นที่แก้ข้อมูลบริษัทได้" };

  const nameTh = text(fd, "name_th");
  if (!nameTh) return { ok: false, message: "ต้องกรอกชื่อบริษัทภาษาไทย เพราะขึ้นบนหัวเอกสารทุกใบ" };

  const vatRegistered = String(fd.get("vat_registered") ?? "") === "on";
  const vatDate = text(fd, "vat_effective_date");

  // จดภาษีมูลค่าเพิ่มแล้วต้องบอกวันที่มีผลด้วย เพราะใบที่ออกก่อนวันนั้นห้ามมี VAT
  if (vatRegistered && !vatDate)
    return { ok: false, message: "จดภาษีมูลค่าเพิ่มแล้วต้องระบุวันที่มีผล ใบที่ออกก่อนวันนั้นจะไม่คิด VAT" };

  const { error } = await sb
    .from("company_settings")
    .update({
      name: text(fd, "name") ?? nameTh,
      name_th: nameTh,
      tax_id: text(fd, "tax_id"),
      address: text(fd, "address"),
      phone: text(fd, "phone"),
      email: text(fd, "email"),
      website: text(fd, "website"),
      logo_url: text(fd, "logo_url"),
      vat_registered: vatRegistered,
      vat_pct: pct(fd, "vat_pct", 7),
      vat_effective_date: vatDate,
      wht_pct: pct(fd, "wht_pct", 3),
      bank_name: text(fd, "bank_name"),
      bank_account_no: text(fd, "bank_account_no"),
      bank_account_name: text(fd, "bank_account_name"),
      payment_note: text(fd, "payment_note"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/settings/company");
  revalidatePath("/settings");
  return { ok: true, message: "บันทึกข้อมูลบริษัทแล้ว ใบที่ออกหลังจากนี้จะใช้ข้อมูลชุดใหม่" };
}
