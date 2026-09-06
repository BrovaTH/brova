"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { insertWithCode } from "@/lib/doc-code";

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

// ============================================================================
// บรีฟ หรือคำขอราคา
//
// นี่คือจุดแรกสุดของสายงาน ก่อนจะมีใบเสนอราคา ก่อนจะมีใบงาน
// ลูกค้าทักมาทางไลน์บ้าง เฟซบุ๊กบ้าง โทรมาบ้าง ถ้าไม่จดไว้ที่เดียวกัน
// เรื่องจะหายไปในแชท แล้วไม่มีใครรู้ว่าเดือนนี้มีคนถามราคามากี่เจ้า
//
// บรีฟจึงบันทึกไว้ทุกเรื่อง ต่อให้สุดท้ายลูกค้าไม่เอา เพราะจำนวนที่ไม่เอา
// คือตัวตั้งของอัตราปิดการขาย ถ้าจดแต่เรื่องที่ปิดได้ ตัวเลขจะสวยเกินจริง
// ============================================================================

/** ลอกช่องจากฟอร์มแบบตัดช่องว่างหัวท้าย ช่องว่างเปล่าให้เป็นค่าว่าง */
function text(fd: FormData, key: string): string | null {
  const v = String(fd.get(key) ?? "").trim();
  return v === "" ? null : v;
}

function number(fd: FormData, key: string): number {
  const n = Number(String(fd.get(key) ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function createInquiry(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();

  const who = text(fd, "brief_who");
  if (!who) return { ok: false, message: "ต้องกรอกอย่างน้อยว่าใครใส่ จะได้รู้ว่าเสื้อไปอยู่กับใคร" };

  // ขอเลขบรีฟจากตัวนับกลาง ตัวเดียวกับที่ออกเลขใบงานและใบเสนอราคา
  // เลขจึงเรียงต่อเนื่องและไม่ซ้ำ ต่อให้มีคนบันทึกพร้อมกันหลายคน
  const made = await insertWithCode(sb as never, "inquiries", "INQ", {
    customer_id: text(fd, "customer_id"),
    channel: text(fd, "channel") ?? "LINE",
    brief_who: who,
    brief_where: text(fd, "brief_where"),
    brief_duration: text(fd, "brief_duration"),
    qty_estimate: number(fd, "qty_estimate"),
    budget_per_unit: number(fd, "budget_per_unit"),
    deadline: text(fd, "deadline"),
    recommended_fabric_group: text(fd, "recommended_fabric_group"),
    note: text(fd, "note"),
    status: "ใหม่",
  });
  if (!made.ok) return { ok: false, message: made.message };

  revalidatePath("/briefs");
  return { ok: true, message: `บันทึกบรีฟ ${made.code} แล้ว` };
}

const STATUSES = ["ใหม่", "กำลังเสนอราคา", "ปิดการขาย", "ไม่สนใจ"];

export async function setInquiryStatus(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const id = String(fd.get("id") ?? "");
  const status = String(fd.get("status") ?? "");

  if (!STATUSES.includes(status)) return { ok: false, message: "สถานะไม่ถูกต้อง" };

  const { error } = await sb.from("inquiries").update({ status }).eq("id", id);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/briefs");
  return { ok: true, message: "เปลี่ยนสถานะแล้ว" };
}

/**
 * ออกร่างใบเสนอราคาจากบรีฟใบนี้
 *
 * ยกข้อมูลลูกค้าและโจทย์ที่จดไว้ไปตั้งต้นให้ ไม่ต้องพิมพ์ใหม่
 * ร่างที่ได้ยังไม่กินเลขที่เอกสาร เลขจะออกตอนกดออกเอกสารเท่านั้น
 * และผูก inquiry_id ไว้ด้วย เพื่อให้ไล่ย้อนได้ว่าใบนี้มาจากบรีฟไหน
 */
export async function quoteFromInquiry(
  fd: FormData,
): Promise<{ ok: boolean; message: string; id?: string }> {
  const sb = supabaseServer();
  const id = String(fd.get("id") ?? "");

  const { data: inq } = await sb
    .from("inquiries")
    .select("id, customer_id, brief_who, brief_where, brief_duration, qty_estimate, note")
    .eq("id", id)
    .maybeSingle();
  if (!inq) return { ok: false, message: "ไม่พบบรีฟใบนี้" };

  const { data: cus } = inq.customer_id
    ? await sb
        .from("customers")
        .select("name, tax_id, address_bill, contact_name, phone, credit_days")
        .eq("id", inq.customer_id)
        .maybeSingle()
    : { data: null };

  const brief = [inq.brief_who, inq.brief_where, inq.brief_duration]
    .filter(Boolean)
    .join(" · ");

  const { data, error } = await sb
    .from("quotations")
    .insert({
      code: null,
      status: "Draft",
      inquiry_id: inq.id,
      customer_id: inq.customer_id,
      bu_code: "BU1",
      issued_at: new Date().toISOString().slice(0, 10),
      credit_days: cus?.credit_days ?? 30,
      party_name: cus?.name ?? null,
      party_tax_id: cus?.tax_id ?? null,
      party_address: cus?.address_bill ?? null,
      party_contact: cus?.contact_name ?? null,
      party_phone: cus?.phone ?? null,
      note: [brief, inq.note].filter(Boolean).join("\n") || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };

  // บรีฟที่ออกใบเสนอราคาแล้วถือว่าเดินหน้าต่อ ขยับสถานะให้เอง
  // จะได้ไม่ต้องมาไล่กดทีหลัง แล้วลืมจนตัวเลขในรายงานเพี้ยน
  await sb.from("inquiries").update({ status: "กำลังเสนอราคา" }).eq("id", inq.id);

  revalidatePath("/briefs");
  revalidatePath("/docs");
  return { ok: true, message: "สร้างร่างใบเสนอราคาแล้ว", id: data.id };
}
