"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

// ============================================================================
// บันทึกการผลิตรายขั้น
//
// งานหนึ่งตัวเดินผ่านหลายสถานี ตัด เย็บ พิมพ์ แพ็ก
// ทุกสถานีต้องบอกได้ว่า รับเข้ามากี่ตัว ส่งออกไปกี่ตัว และเสียกี่ตัวเพราะอะไร
//
// เหตุผลที่ต้องบันทึกทีละสถานี ไม่ใช่บันทึกรวมทั้งงาน
// เพราะถ้ารู้แค่ว่าทั้งงานเสีย 6 ตัว จะแก้อะไรไม่ได้เลย
// แต่ถ้ารู้ว่าเสีย 6 ตัวที่สถานีพิมพ์ทั้งหมด จะรู้ทันทีว่าต้องไปดูเครื่องไหน
// ============================================================================

const STEPS = ["ตัด", "เย็บ", "พิมพ์", "ปัก", "รีด", "แพ็ก", "อื่น ๆ"];

function fail(message: string): ActionResult {
  return { ok: false, message };
}

export async function addProductionLog(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const me = await currentProfile();

  const jobId = String(fd.get("job_id") ?? "").trim();
  const step = String(fd.get("step") ?? "").trim();
  const qtyIn = Number(String(fd.get("qty_in") ?? ""));
  const qtyOut = Number(String(fd.get("qty_out") ?? ""));
  const qtyDefect = Number(String(fd.get("qty_defect") ?? "0"));
  const reason = String(fd.get("defect_reason") ?? "").trim();

  if (!jobId) return fail("ต้องเลือกงานก่อน");
  if (!STEPS.includes(step)) return fail("ขั้นตอนไม่ถูกต้อง");

  if (!Number.isFinite(qtyIn) || qtyIn <= 0) return fail("จำนวนที่รับเข้าต้องมากกว่าศูนย์");
  if (!Number.isFinite(qtyOut) || qtyOut < 0) return fail("จำนวนที่ส่งออกไม่ถูกต้อง");
  if (!Number.isFinite(qtyDefect) || qtyDefect < 0) return fail("จำนวนที่เสียไม่ถูกต้อง");

  // ของที่ส่งออกบวกของที่เสีย ต้องไม่เกินของที่รับเข้ามา
  // ถ้าเกิน แปลว่ากรอกผิด หรือมีของโผล่มาจากที่อื่นโดยไม่มีที่มา
  // ปล่อยผ่านไม่ได้ เพราะตัวเลขของเสียทั้งระบบจะเพี้ยนตามไปด้วย
  if (qtyOut + qtyDefect > qtyIn)
    return fail(`ส่งออก ${qtyOut} บวกเสีย ${qtyDefect} เกินที่รับเข้ามา ${qtyIn} ตัว`);

  // เสียแล้วต้องบอกสาเหตุเสมอ ไม่งั้นคลังความรู้จะไม่มีอะไรให้เรียนรู้
  if (qtyDefect > 0 && !reason)
    return fail("มีของเสียต้องระบุสาเหตุ จะได้รู้ว่าปัญหาซ้ำอยู่ที่ขั้นไหน");

  const { error } = await sb.from("production_logs").insert({
    job_id: jobId,
    step,
    qty_in: qtyIn,
    qty_out: qtyOut,
    qty_defect: qtyDefect,
    defect_reason: reason || null,
    machine: String(fd.get("machine") ?? "").trim() || null,
    by_user: me?.full_name ?? null,
  });
  if (error) return fail(error.message);

  revalidatePath("/production");
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true, message: "บันทึกการผลิตแล้ว" };
}
