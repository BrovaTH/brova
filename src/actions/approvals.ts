"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { notify, appUrl } from "@/lib/line/send";
import { cardApprovalNew, cardApprovalDone } from "@/lib/line/flex";
import { approvalKindTh } from "@/lib/workflow";
import type { ActionResult } from "@/components/action-form";

/**
 * ระบบขออนุมัติจากเจ้าของ
 *
 * ด่านจริงอยู่ที่ฐานข้อมูล ไม่ได้อยู่ที่หน้าจอ
 *   ทริกเกอร์ approvals_guard  กันไม่ให้ใครนอกจากเจ้าของกดอนุมัติ
 *   ฟังก์ชัน use_approval       โยนข้อผิดพลาดถ้าไม่มีใบอนุมัติที่ใช้ได้
 * ฉะนั้นต่อให้ยิงตรงข้าม UI เข้ามา ก็ยังทำรายการนอกกรอบไม่ได้
 */

function fail(message: string): ActionResult {
  return { ok: false, message };
}

function s(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}

// ---------------------------------------------------------------- ยื่นเรื่อง
export async function requestApproval(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const me = await currentProfile();
  if (!me) return fail("ต้องเข้าสู่ระบบก่อน");

  const kind = s(fd, "kind");
  const targetType = s(fd, "target_type");
  const targetId = s(fd, "target_id");
  const targetCode = s(fd, "target_code");
  const title = s(fd, "title");
  const reason = s(fd, "reason");
  const amountRaw = s(fd, "amount");

  if (!kind || !targetType) return fail("ข้อมูลไม่ครบ ระบุเรื่องที่ขอและสิ่งที่เกี่ยวข้อง");
  if (!title) return fail("ใส่หัวเรื่องให้เจ้าของอ่านเข้าใจว่าขออะไร");
  if (reason.length < 10)
    return fail("เขียนเหตุผลให้ละเอียดกว่านี้ อย่างน้อยสิบตัวอักษร เจ้าของจะได้ตัดสินใจได้");

  // เก็บค่าที่ขอไว้ทั้งก้อน เผื่อย้อนดูว่าตอนนั้นขออะไรไว้
  const payload: Record<string, unknown> = {};
  fd.forEach((v, k) => {
    if (k.startsWith("p_")) payload[k.slice(2)] = String(v);
  });

  // กันยื่นซ้ำเรื่องเดิมกับของชิ้นเดิมที่ยังรออยู่
  const { data: dup } = await sb
    .from("approvals")
    .select("code")
    .eq("kind", kind)
    .eq("target_type", targetType)
    .eq("target_id", targetId || null)
    .eq("status", "pending")
    .maybeSingle();
  if (dup) return fail(`เรื่องนี้ยื่นไปแล้ว เลขที่ ${dup.code} กำลังรอเจ้าของพิจารณา`);

  const { error } = await sb.from("approvals").insert({
    kind,
    target_type: targetType,
    target_id: targetId || null,
    target_code: targetCode || null,
    title,
    reason,
    payload,
    amount: amountRaw ? Number(amountRaw) : null,
    requested_by: me.id,
    requested_by_name: me.full_name,
  });

  if (error) return fail(error.message);

  // แจ้งเจ้าของทางไลน์ ถ้าส่งไม่ได้ก็ไม่ให้กระทบการยื่นเรื่อง
  const { data: fresh } = await sb
    .from("approvals")
    .select("code")
    .eq("kind", kind)
    .eq("status", "pending")
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await notify(
    "approval_new",
    `มีเรื่องรออนุมัติ ${title}`,
    cardApprovalNew({
      code: fresh?.code ?? "—",
      kindTh: approvalKindTh(kind),
      title,
      reason,
      amount: amountRaw ? Number(amountRaw) : null,
      requester: me.full_name,
      targetCode: targetCode || null,
      url: appUrl("/approvals"),
    }),
  );

  revalidatePath("/approvals");
  revalidatePath("/");
  return { ok: true, message: "ส่งเรื่องให้เจ้าของแล้ว รอผลอนุมัติ" };
}

// ---------------------------------------------------------------- เจ้าของตัดสิน
export async function decideApproval(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const me = await currentProfile();
  if (!me) return fail("ต้องเข้าสู่ระบบก่อน");
  if (me.role !== "owner") return fail("เฉพาะเจ้าของเท่านั้นที่อนุมัติได้");

  const id = s(fd, "id");
  const decision = s(fd, "decision");
  const note = s(fd, "note");

  if (!id) return fail("ไม่พบใบขออนุมัติ");
  if (decision !== "approve" && decision !== "reject") return fail("ต้องเลือกอนุมัติหรือไม่อนุมัติ");
  if (decision === "reject" && note.length < 5)
    return fail("ถ้าไม่อนุมัติ ให้เขียนเหตุผลไว้ด้วย ทีมจะได้รู้ว่าต้องแก้อะไร");

  const { error } = await sb
    .from("approvals")
    .update({
      status: decision === "approve" ? "approved" : "rejected",
      decision_note: note || null,
      decided_by: me.id,
      decided_by_name: me.full_name,
    })
    .eq("id", id)
    .eq("status", "pending");

  if (error) return fail(error.message);

  const { data: apv } = await sb
    .from("approvals")
    .select("code, kind, title, expires_at")
    .eq("id", id)
    .maybeSingle();

  if (apv) {
    const { data: rules } = await sb
      .from("approval_rules").select("approval_valid_hours").eq("id", 1).maybeSingle();
    await notify(
      "approval_done",
      `${decision === "approve" ? "อนุมัติแล้ว" : "ไม่อนุมัติ"} ${apv.title}`,
      cardApprovalDone({
        code: apv.code,
        kindTh: approvalKindTh(apv.kind),
        title: apv.title,
        approved: decision === "approve",
        note: note || null,
        decider: me.full_name,
        hours: Number(rules?.approval_valid_hours ?? 72),
        url: appUrl("/approvals"),
      }),
    );
  }

  revalidatePath("/approvals");
  revalidatePath("/");
  return {
    ok: true,
    message: decision === "approve" ? "อนุมัติแล้ว" : "บันทึกว่าไม่อนุมัติแล้ว",
  };
}

// ---------------------------------------------------------------- ถอนเรื่อง
export async function cancelApproval(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const me = await currentProfile();
  if (!me) return fail("ต้องเข้าสู่ระบบก่อน");

  const id = s(fd, "id");
  const { error } = await sb
    .from("approvals")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", "pending");

  if (error) return fail(error.message);
  revalidatePath("/approvals");
  return { ok: true, message: "ถอนเรื่องแล้ว" };
}

// ---------------------------------------------------------------- ตั้งเพดาน
export async function saveApprovalRules(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const me = await currentProfile();
  if (!me) return fail("ต้องเข้าสู่ระบบก่อน");
  if (me.role !== "owner") return fail("เฉพาะเจ้าของเท่านั้นที่ตั้งเพดานได้");

  const n = (k: string, d: number) => {
    const v = Number(s(fd, k));
    return Number.isFinite(v) && v >= 0 ? v : d;
  };

  const hours = n("approval_valid_hours", 72);
  if (hours < 1 || hours > 720)
    return fail("อายุใบอนุมัติต้องอยู่ระหว่าง 1 ถึง 720 ชั่วโมง");

  const { error } = await sb
    .from("approval_rules")
    .update({
      max_discount_pct: n("max_discount_pct", 10),
      max_credit_days: n("max_credit_days", 30),
      po_budget_cap: n("po_budget_cap", 50000),
      allow_ship_before_paid: s(fd, "allow_ship_before_paid") === "on",
      approval_valid_hours: hours,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) return fail(error.message);
  revalidatePath("/approvals");
  return { ok: true, message: "บันทึกเพดานแล้ว" };
}

// ---------------------------------------------------------------- ตัวช่วยให้ action อื่นเรียก
/** มีใบอนุมัติที่ใช้ได้อยู่ไหม ใช้ตอนวาดหน้าจอ */
export async function hasUsableApproval(
  kind: string,
  targetType: string,
  targetId: string | null,
): Promise<boolean> {
  const sb = supabaseServer();
  const { data } = await sb.rpc("find_usable_approval", {
    p_kind: kind,
    p_target_type: targetType,
    p_target_id: targetId,
  });
  return !!data;
}

/**
 * ใช้ใบอนุมัติหนึ่งครั้ง  ไม่มีใบที่ใช้ได้จะโยนข้อผิดพลาดออกไป
 * action อื่นเรียกตัวนี้ก่อนทำรายการนอกกรอบเสมอ
 */
export async function consumeApproval(
  kind: string,
  targetType: string,
  targetId: string | null,
  ref: string,
): Promise<string> {
  const sb = supabaseServer();
  const { data, error } = await sb.rpc("use_approval", {
    p_kind: kind,
    p_target_type: targetType,
    p_target_id: targetId,
    p_ref: ref,
  });
  if (error) throw new Error(error.message);
  return String(data);
}
