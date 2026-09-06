"use server";

import { revalidatePath } from "next/cache";
import { insertWithCode } from "@/lib/doc-code";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { canMove, gateFor, statusTh } from "@/lib/workflow";
import { consumeApproval } from "./approvals";
import { notify, appUrl } from "@/lib/line/send";
import { cardQcFail } from "@/lib/line/flex";
import type { ActionResult } from "@/components/action-form";

function fail(message: string): ActionResult {
  return { ok: false, message };
}

function s(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}

// ============================================================================
// ประตูตรวจ  ตรวจที่เซิร์ฟเวอร์เท่านั้น หน้าจอแค่บอกล่วงหน้าว่าจะติดอะไร
// ============================================================================
export type GateCheck = { pass: boolean; why: string };

export async function checkGate(gateId: string, jobId: string): Promise<GateCheck> {
  const sb = supabaseServer();
  const { data: job } = await sb.from("jobs_view").select("*").eq("id", jobId).maybeSingle();
  if (!job) return { pass: false, why: "ไม่พบใบงาน" };

  switch (gateId) {
    case "G1": {
      const miss: string[] = [];
      if (!job.brief_who) miss.push("ใครใส่");
      if (!job.brief_where) miss.push("ใส่ที่ไหน");
      if (!job.brief_duration) miss.push("ใส่นานแค่ไหน");
      return miss.length
        ? { pass: false, why: `ยังไม่ได้เก็บโจทย์ครบ ขาด ${miss.join(" · ")}` }
        : { pass: true, why: "โจทย์ครบสามข้อ" };
    }
    case "G2":
      return job.confirm_evidence
        ? { pass: true, why: `มีหลักฐานยืนยันจาก ${job.confirmed_by ?? "ลูกค้า"}` }
        : { pass: false, why: "ยังไม่มีหลักฐานว่าลูกค้าตกลงราคา ต้องแนบไฟล์หรือใส่ข้อความยืนยัน" };
    case "G3": {
      const paid = Number(job.paid_amount ?? 0);
      return paid > 0
        ? { pass: true, why: `รับเงินแล้ว ${paid.toLocaleString("th-TH")} บาท` }
        : { pass: false, why: "ยังไม่มีการรับชำระเงินสำหรับงานนี้" };
    }
    case "G4": {
      const { count } = await sb
        .from("mockups")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId)
        .eq("approved", true);
      return (count ?? 0) > 0
        ? { pass: true, why: "ลูกค้าเคาะแบบแล้ว" }
        : { pass: false, why: "ยังไม่มีแบบที่ลูกค้าอนุมัติ" };
    }
    case "G5": {
      const { count } = await sb
        .from("stock_movements")
        .select("id", { count: "exact", head: true })
        .eq("ref_type", "job")
        .eq("ref_no", job.code)
        .eq("type", "จอง");
      return (count ?? 0) > 0
        ? { pass: true, why: "จองผ้าให้งานนี้แล้ว" }
        : { pass: false, why: "ยังไม่ได้จองผ้าให้งานนี้ ถ้าเข้าไลน์แล้วผ้าขาดจะค้างทั้งไลน์" };
    }
    case "G6": {
      const { data } = await sb
        .from("qc_records")
        .select("result, created_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false })
        .limit(1);
      const last = data?.[0];
      if (!last) return { pass: false, why: "ยังไม่มีผลตรวจคุณภาพ" };
      return last.result === "ผ่าน"
        ? { pass: true, why: "ตรวจคุณภาพผ่านแล้ว" }
        : { pass: false, why: `ผลตรวจล่าสุดคือ ${last.result} ต้องแก้ให้ผ่านก่อน` };
    }
    case "G7": {
      const out = Number(job.outstanding ?? 0);
      return out <= 0
        ? { pass: true, why: "เก็บเงินครบแล้ว" }
        : { pass: false, why: `ยังค้างชำระ ${out.toLocaleString("th-TH")} บาท` };
    }
    case "G8":
      return job.tracking_no || job.ship_photo_url
        ? { pass: true, why: "มีหลักฐานการส่งแล้ว" }
        : { pass: false, why: "ยังไม่มีเลขพัสดุหรือรูปตอนส่งของ" };
    default:
      return { pass: true, why: "ไม่มีเงื่อนไข" };
  }
}

/** ประตูที่ขวางอยู่ พร้อมผลตรวจ ใช้วาดหน้าจอ */
export async function gateStatus(jobId: string, toStatus: string) {
  const gate = gateFor(toStatus);
  if (!gate) return null;
  const res = await checkGate(gate.id, jobId);
  return { gate, ...res };
}

// ============================================================================
// ย้ายสถานะงาน
// ============================================================================
export async function moveStatus(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const me = await currentProfile();
  if (!me) return fail("ต้องเข้าสู่ระบบก่อน");

  const jobId = s(fd, "job_id");
  const to = s(fd, "to");
  const note = s(fd, "note");

  const { data: job } = await sb
    .from("jobs")
    .select("id, code, status")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return fail("ไม่พบใบงาน");

  const from = job.status as string;
  if (from === to) return fail("สถานะเดิมกับสถานะใหม่เป็นอันเดียวกัน");
  if (!canMove(from, to))
    return fail(`ย้ายจาก ${statusTh(from)} ไป ${statusTh(to)} ไม่ได้ ไม่ใช่ทางเดินของงาน`);

  // ---------------------------------------------------------------- ด่านประตู
  let overrideNote: string | null = null;
  const gate = gateFor(to);
  if (gate) {
    const res = await checkGate(gate.id, jobId);
    if (!res.pass) {
      if (!gate.overridable)
        return fail(`ติดประตู ${gate.id} ${gate.th} — ${res.why} · ประตูนี้ข้ามไม่ได้ไม่ว่ากรณีใด`);

      // ข้ามได้ก็ต่อเมื่อมีใบอนุมัติจากเจ้าของที่ยังใช้ได้
      const kind = to === "85" ? "ship_unpaid" : "gate_skip";
      try {
        const code = await consumeApproval(kind, "job", jobId, `${job.code} → ${statusTh(to)}`);
        overrideNote = `ข้ามประตู ${gate.id} ด้วยใบอนุมัติ ${code}`;
      } catch {
        return fail(
          `ติดประตู ${gate.id} ${gate.th} — ${res.why} · ` +
            `ถ้าจำเป็นต้องข้ามจริง ให้ยื่นขออนุมัติจากเจ้าของก่อน`,
        );
      }
    }
  }

  // ---------------------------------------------------------------- ยกเลิกงานต้องขออนุมัติ
  if (to === "98") {
    const reason = s(fd, "cancel_reason");
    if (reason.length < 5) return fail("เขียนเหตุผลที่ยกเลิกงานไว้ด้วย");
    try {
      const code = await consumeApproval("job_cancel", "job", jobId, job.code);
      overrideNote = `ยกเลิกงานด้วยใบอนุมัติ ${code}`;
    } catch {
      return fail("ยกเลิกงานต้องได้รับอนุมัติจากเจ้าของก่อน ยื่นเรื่องแล้วรอผล");
    }
    await sb.from("jobs").update({ cancel_reason: reason }).eq("id", jobId);
  }

  if (to === "97") {
    const reason = s(fd, "hold_reason");
    if (reason.length < 5) return fail("เขียนเหตุผลที่พักงานไว้ด้วย ทีมจะได้รู้ว่ารออะไร");
    await sb.from("jobs").update({ hold_reason: reason }).eq("id", jobId);
  }

  // ---------------------------------------------------------------- บันทึก
  const { error } = await sb.from("jobs").update({ status: to }).eq("id", jobId);
  if (error) return fail(error.message);

  await sb.from("status_logs").insert({
    job_id: jobId,
    from_status: from,
    to_status: to,
    gate_passed: gate && !overrideNote ? gate.id : null,
    gate_override: overrideNote ? gate?.id ?? null : null,
    note: [note, overrideNote].filter(Boolean).join(" · ") || null,
    by_user: me.full_name,
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  revalidatePath("/");
  return {
    ok: true,
    message: overrideNote
      ? `ย้ายไป ${statusTh(to)} แล้ว · ${overrideNote}`
      : `ย้ายไป ${statusTh(to)} แล้ว`,
  };
}

// ============================================================================
// เก็บโจทย์สามข้อ
// ============================================================================
export async function saveBrief(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const jobId = s(fd, "job_id");
  const who = s(fd, "brief_who");
  const where = s(fd, "brief_where");
  const dur = s(fd, "brief_duration");

  if (!who || !where || !dur)
    return fail("ต้องกรอกครบทั้งสามข้อ ใครใส่ ใส่ที่ไหน ใส่นานแค่ไหน — ไม่งั้นเลือกผ้าผิด");

  const { error } = await sb
    .from("jobs")
    .update({
      brief_who: who,
      brief_where: where,
      brief_duration: dur,
      item_description: s(fd, "item_description") || null,
    })
    .eq("id", jobId);

  if (error) return fail(error.message);
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true, message: "บันทึกโจทย์แล้ว" };
}

// ============================================================================
// หลักฐานการยืนยันจากลูกค้า
// ============================================================================
export async function saveConfirmation(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const jobId = s(fd, "job_id");
  const by = s(fd, "confirmed_by");
  const ev = s(fd, "confirm_evidence");

  if (!by) return fail("ระบุชื่อคนที่ยืนยันมา");
  if (ev.length < 5) return fail("ใส่หลักฐานด้วย เช่นข้อความที่ลูกค้าตอบกลับ หรือลิงก์ไฟล์");

  const { error } = await sb
    .from("jobs")
    .update({ confirmed_by: by, confirm_evidence: ev, confirmed_at: new Date().toISOString() })
    .eq("id", jobId);

  if (error) return fail(error.message);
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true, message: "บันทึกหลักฐานการยืนยันแล้ว" };
}

// ============================================================================
// แบบร่าง
// ============================================================================
export async function addMockup(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const jobId = s(fd, "job_id");

  const { count } = await sb
    .from("mockups")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId);

  const { error } = await sb.from("mockups").insert({
    job_id: jobId,
    rev_no: (count ?? 0) + 1,
    file_url: s(fd, "file_url") || null,
    size_cm: s(fd, "size_cm") || null,
    note: s(fd, "note") || null,
  });
  if (error) return fail(error.message);

  await sb.from("jobs").update({ revision_count: (count ?? 0) + 1 }).eq("id", jobId);
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true, message: "บันทึกแบบร่างแล้ว" };
}

export async function approveMockup(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const me = await currentProfile();
  const id = s(fd, "mockup_id");
  const jobId = s(fd, "job_id");

  const { error } = await sb.from("mockups").update({ approved: true }).eq("id", id);
  if (error) return fail(error.message);

  const { data: job } = await sb.from("jobs").select("status").eq("id", jobId).maybeSingle();
  await sb.from("status_logs").insert({
    job_id: jobId,
    from_status: job?.status ?? null,
    to_status: job?.status ?? "45",
    note: "ลูกค้าอนุมัติแบบ",
    by_user: me?.full_name ?? "ระบบ",
  });

  revalidatePath(`/jobs/${jobId}`);
  return { ok: true, message: "บันทึกว่าลูกค้าเคาะแบบแล้ว" };
}

// ============================================================================
// ผลตรวจคุณภาพ
// ============================================================================
export async function addQc(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const me = await currentProfile();
  const jobId = s(fd, "job_id");
  const checked = Number(s(fd, "checked_qty"));
  const pass = Number(s(fd, "pass_qty"));

  if (!Number.isFinite(checked) || checked <= 0) return fail("จำนวนที่ตรวจต้องมากกว่าศูนย์");
  if (!Number.isFinite(pass) || pass < 0) return fail("จำนวนที่ผ่านไม่ถูกต้อง");
  if (pass > checked) return fail("จำนวนที่ผ่านมากกว่าจำนวนที่ตรวจไม่ได้");

  const result = pass === checked ? "ผ่าน" : pass / checked >= 0.9 ? "ส่งซ่อม" : "ไม่ผ่าน";
  const reasons = s(fd, "fail_reasons");
  if (result !== "ผ่าน" && !reasons)
    return fail("ตรวจไม่ผ่านต้องระบุสาเหตุ ฝ่ายผลิตจะได้แก้ถูกจุด");

  const { error } = await sb.from("qc_records").insert({
    job_id: jobId,
    checked_qty: checked,
    pass_qty: pass,
    fail_reasons: reasons || null,
    wash_test_done: s(fd, "wash_test_done") === "on",
    photo_url: s(fd, "photo_url") || null,
    result,
    by_user: me?.full_name ?? null,
  });
  if (error) return fail(error.message);

  // ตรวจไม่ผ่านต้องรู้กันทั้งทีมทันที จะได้แก้ทัน
  if (result !== "ผ่าน") {
    const { data: job } = await sb
      .from("jobs").select("code, title").eq("id", jobId).maybeSingle();
    await notify(
      "qc_fail",
      `ตรวจคุณภาพ ${result} ${job?.code ?? ""}`,
      cardQcFail({
        jobCode: job?.code ?? "—",
        jobTitle: job?.title ?? "—",
        checked, pass, result,
        reasons: reasons || null,
        by: me?.full_name ?? null,
        url: appUrl(`/jobs/${jobId}`),
      }),
    );
  }

  revalidatePath(`/jobs/${jobId}`);
  return { ok: true, message: `บันทึกผลตรวจแล้ว ผลคือ ${result}` };
}

// ============================================================================
// จัดส่ง
// ============================================================================
export async function addShipment(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const jobId = s(fd, "job_id");
  const carrier = s(fd, "carrier");
  const tracking = s(fd, "tracking_no");
  const photo = s(fd, "photo_url");

  if (!carrier) return fail("ระบุขนส่งที่ใช้");
  if (!tracking && !photo)
    return fail("ต้องมีเลขพัสดุ หรือรูปตอนส่งของอย่างน้อยหนึ่งอย่าง ไว้ยืนยันกับลูกค้า");

  const { data: code } = await sb.rpc("next_code", { p_prefix: "SHP" });

  const { error } = await sb.from("shipments").insert({
    code,
    job_id: jobId,
    carrier,
    tracking_no: tracking || null,
    boxes: Number(s(fd, "boxes")) || 1,
    weight_kg: Number(s(fd, "weight_kg")) || null,
    cost: Number(s(fd, "cost")) || 0,
    photo_url: photo || null,
    status: "ส่งแล้ว",
    shipped_at: new Date().toISOString(),
    note: s(fd, "note") || null,
  });
  if (error) return fail(error.message);

  await sb
    .from("jobs")
    .update({
      carrier,
      tracking_no: tracking || null,
      boxes: Number(s(fd, "boxes")) || 1,
      weight_kg: Number(s(fd, "weight_kg")) || null,
      ship_cost: Number(s(fd, "cost")) || 0,
      ship_photo_url: photo || null,
      shipped_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/shipments");
  return { ok: true, message: "บันทึกการจัดส่งแล้ว" };
}

export async function markDelivered(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const jobId = s(fd, "job_id");
  const now = new Date().toISOString();

  await sb.from("shipments").update({ status: "ถึงแล้ว", delivered_at: now }).eq("job_id", jobId);
  const { error } = await sb.from("jobs").update({ delivered_at: now }).eq("id", jobId);
  if (error) return fail(error.message);

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/shipments");
  return { ok: true, message: "บันทึกว่าลูกค้ารับของแล้ว" };
}

// ============================================================================
// สร้างใบงานใหม่
// ============================================================================
export async function createJob(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const me = await currentProfile();
  const title = s(fd, "title");
  if (!title) return fail("ใส่ชื่องานด้วย");

  const made = await insertWithCode(sb as never, "jobs", "JOB", {
    title,
    customer_id: s(fd, "customer_id") || null,
    bu_code: s(fd, "bu_code") || "BU1",
    status: "10",
    qty_total: Number(s(fd, "qty_total")) || 0,
    total_amount: Number(s(fd, "total_amount")) || 0,
    due_date: s(fd, "due_date") || null,
    brief_who: s(fd, "brief_who") || null,
    brief_where: s(fd, "brief_where") || null,
    brief_duration: s(fd, "brief_duration") || null,
  });
  if (!made.ok) return fail(made.message);
  const code = made.code;

  await sb.from("status_logs").insert({
    job_id: made.id,
    to_status: "10",
    note: "เปิดใบงาน",
    by_user: me?.full_name ?? null,
  });

  revalidatePath("/jobs");
  return { ok: true, id: made.id, message: `เปิดใบงาน ${code} แล้ว` };
}
