"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { computeTotals, validatePayment, shouldWithhold, r2 } from "@/lib/accounting";
import { consumeApproval } from "./approvals";
import { notify, appUrl } from "@/lib/line/send";
import { cardPaymentIn } from "@/lib/line/flex";
import type { ActionResult } from "@/components/action-form";

function fail(message: string): ActionResult {
  return { ok: false, message };
}
function s(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}
function n(fd: FormData, k: string): number {
  const v = Number(s(fd, k));
  return Number.isFinite(v) ? v : 0;
}

// ============================================================================
// รับชำระเงิน
// ต้องมีสลิปหรือเลขอ้างอิงเสมอ ตรวจสองชั้น ที่นี่และที่ฐานข้อมูล
// ============================================================================
export async function addPayment(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const me = await currentProfile();
  if (!me) return fail("ต้องเข้าสู่ระบบก่อน");

  const invoiceId = s(fd, "invoice_id");
  const amount = n(fd, "amount");
  const method = s(fd, "method") || "โอน";
  const slipUrl = s(fd, "slip_url");
  const slipRef = s(fd, "slip_ref");

  const v = validatePayment({ method, amount, slip_url: slipUrl, slip_ref: slipRef });
  if (!v.ok) return fail(v.message);

  const { data: inv } = await sb
    .from("invoices_view")
    .select("id, code, job_id, status, net_payable, outstanding, bill_to_name")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return fail("ไม่พบใบวางบิล");
  if (inv.status === "Void") return fail("ใบวางบิลนี้ถูกยกเลิกไปแล้ว");
  if (inv.status === "Draft") return fail("ใบวางบิลยังเป็นร่าง ต้องออกเอกสารก่อนถึงจะรับชำระได้");

  const outstanding = Number(inv.outstanding ?? 0);
  if (amount > outstanding + 0.01)
    return fail(
      `รับเกินยอดค้างไม่ได้ ใบนี้ค้างอยู่ ${outstanding.toLocaleString("th-TH")} บาท`,
    );

  const { data: code } = await sb.rpc("next_code", { p_prefix: "PAY" });

  const { error } = await sb.from("payments").insert({
    code,
    job_id: inv.job_id,
    invoice_id: invoiceId,
    type: s(fd, "type") || "ยอดคงเหลือ",
    method,
    amount,
    wht_amount: n(fd, "wht_amount"),
    slip_url: slipUrl || null,
    slip_ref: slipRef || null,
    by_user: me.full_name,
    note: s(fd, "note") || null,
  });
  if (error) return fail(error.message);

  // ปรับสถานะใบวางบิลตามยอดที่เก็บได้
  const left = r2(outstanding - amount);
  await sb
    .from("invoices")
    .update({ status: left <= 0.01 ? "Paid" : "Partial" })
    .eq("id", invoiceId);

  await notify(
    "payment_in",
    `รับเงิน ${amount.toLocaleString("th-TH")} บาท จาก ${inv.code}`,
    cardPaymentIn({
      amount,
      invoiceCode: inv.code ?? "—",
      customer: (inv as { bill_to_name?: string }).bill_to_name ?? null,
      method,
      outstanding: left,
      by: me.full_name,
      url: appUrl("/accounting"),
    }),
  );

  revalidatePath("/accounting");
  revalidatePath(`/invoices/${invoiceId}`);
  if (inv.job_id) revalidatePath(`/jobs/${inv.job_id}`);
  return {
    ok: true,
    message:
      left <= 0.01
        ? `รับชำระ ${amount.toLocaleString("th-TH")} บาท · ใบนี้ชำระครบแล้ว`
        : `รับชำระ ${amount.toLocaleString("th-TH")} บาท · ยังค้าง ${left.toLocaleString("th-TH")} บาท`,
  };
}

// ============================================================================
// ออกใบเสร็จจากการชำระเงิน
// ============================================================================
export async function issueReceipt(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const paymentId = s(fd, "payment_id");

  const { data: pay } = await sb
    .from("payments")
    .select("id, amount, wht_amount, job_id, invoice_id, method, slip_url, slip_ref")
    .eq("id", paymentId)
    .maybeSingle();
  if (!pay) return fail("ไม่พบรายการชำระเงิน");

  const { data: dup } = await sb
    .from("receipts")
    .select("code")
    .eq("payment_id", paymentId)
    .not("code", "is", null)
    .maybeSingle();
  if (dup) return fail(`ออกใบเสร็จไปแล้ว เลขที่ ${dup.code}`);

  const { data: inv } = await sb
    .from("invoices")
    .select("customer_id, vat_pct, wht_pct, bill_to_name, bill_to_tax_id, bill_to_address")
    .eq("id", pay.invoice_id)
    .maybeSingle();

  const isTax = s(fd, "is_tax_invoice") === "on";
  const vatPct = Number(inv?.vat_pct ?? 0);
  const amount = Number(pay.amount);

  // ยอดที่รับมาเป็นยอดรวมภาษีแล้ว ต้องถอดฐานกลับออกมา
  const base = vatPct > 0 ? r2(amount / (1 + vatPct / 100)) : amount;
  const t = computeTotals({ subtotal: base, vat: vatPct > 0, vatPct });

  const { data: code } = await sb.rpc("next_code", {
    p_prefix: isTax ? "TAX" : "RC",
  });

  const { error } = await sb.from("receipts").insert({
    code,
    invoice_id: pay.invoice_id,
    payment_id: paymentId,
    job_id: pay.job_id,
    customer_id: inv?.customer_id ?? null,
    is_tax_invoice: isTax,
    received_from: inv?.bill_to_name ?? null,
    tax_id: inv?.bill_to_tax_id ?? null,
    address: inv?.bill_to_address ?? null,
    subtotal: t.subtotal,
    vat_pct: t.vatPct,
    vat_amount: t.vatAmount,
    grand_total: t.grandTotal,
    wht_pct: Number(inv?.wht_pct ?? 0),
    wht_amount: Number(pay.wht_amount ?? 0),
    net_received: amount,
    method: pay.method,
    slip_url: pay.slip_url,
    slip_ref: pay.slip_ref,
    party_name: inv?.bill_to_name ?? null,
    party_tax_id: inv?.bill_to_tax_id ?? null,
    party_address: inv?.bill_to_address ?? null,
    locked_at: new Date().toISOString(),
  });
  if (error) return fail(error.message);

  revalidatePath("/accounting");
  return { ok: true, message: `ออก${isTax ? "ใบกำกับภาษี" : "ใบเสร็จ"} ${code} แล้ว` };
}

// ============================================================================
// เลื่อนกำหนดชำระ  ต้องมีใบอนุมัติจากเจ้าของเสมอ
// ============================================================================
export async function extendDueDate(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const invoiceId = s(fd, "invoice_id");
  const newDue = s(fd, "due_date");
  if (!newDue) return fail("เลือกวันครบกำหนดใหม่");

  const { data: inv } = await sb
    .from("invoices")
    .select("id, code, due_date, status")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return fail("ไม่พบใบวางบิล");
  if (inv.status === "Paid") return fail("ใบนี้ชำระครบแล้ว ไม่ต้องเลื่อน");
  if (inv.due_date && newDue <= inv.due_date)
    return fail("วันครบกำหนดใหม่ต้องหลังกว่าเดิม");

  let code: string;
  try {
    code = await consumeApproval("credit_extend", "invoice", invoiceId, inv.code ?? invoiceId);
  } catch {
    return fail(
      "การเลื่อนกำหนดชำระต้องได้รับอนุมัติจากเจ้าของก่อน ยื่นเรื่องที่หน้าขออนุมัติแล้วรอผล",
    );
  }

  const { error } = await sb
    .from("invoices")
    .update({
      due_date: newDue,
      note: `เลื่อนกำหนดชำระด้วยใบอนุมัติ ${code}`,
    })
    .eq("id", invoiceId);
  if (error) return fail(error.message);

  revalidatePath("/accounting");
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true, message: `เลื่อนกำหนดชำระแล้ว ใช้ใบอนุมัติ ${code}` };
}

// ============================================================================
// ยกเลิกใบวางบิล
// ============================================================================
export async function voidInvoice(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const me = await currentProfile();
  const id = s(fd, "invoice_id");
  const reason = s(fd, "reason");
  if (reason.length < 5) return fail("ระบุเหตุผลที่ยกเลิก เก็บไว้เป็นหลักฐานทางบัญชี");

  const { data: paid } = await sb
    .from("payments")
    .select("id")
    .eq("invoice_id", id)
    .limit(1);
  if (paid && paid.length > 0)
    return fail("ใบนี้มีการรับชำระแล้ว ยกเลิกไม่ได้ ให้ออกใบลดหนี้แทน");

  const { error } = await sb
    .from("invoices")
    .update({
      status: "Void",
      void_reason: reason,
      voided_at: new Date().toISOString(),
      voided_by: me?.full_name ?? null,
    })
    .eq("id", id);
  if (error) return fail(error.message);

  revalidatePath("/accounting");
  return { ok: true, message: "ยกเลิกใบวางบิลแล้ว เลขที่เดิมยังอยู่ในระบบเพื่อการตรวจสอบ" };
}

// ============================================================================
// ใบลดหนี้
// ============================================================================
export async function createCreditNote(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const me = await currentProfile();
  const invoiceId = s(fd, "invoice_id");
  const amount = n(fd, "amount");
  const reason = s(fd, "reason");

  if (amount <= 0) return fail("ยอดลดหนี้ต้องมากกว่าศูนย์");
  if (reason.length < 5) return fail("ระบุเหตุผลของใบลดหนี้");

  const { data: inv } = await sb
    .from("invoices_view")
    .select("id, code, grand_total, credited_amount, customer_id, vat_pct")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return fail("ไม่พบใบวางบิล");

  const room = r2(Number(inv.grand_total) - Number(inv.credited_amount ?? 0));
  if (amount > room + 0.01)
    return fail(`ลดหนี้ได้ไม่เกิน ${room.toLocaleString("th-TH")} บาท`);

  const { data: code } = await sb.rpc("next_code", { p_prefix: "CN" });
  const vatPct = Number(inv.vat_pct ?? 0);
  const base = vatPct > 0 ? r2(amount / (1 + vatPct / 100)) : amount;
  const t = computeTotals({ subtotal: base, vat: vatPct > 0, vatPct });

  const { error } = await sb.from("credit_notes").insert({
    code,
    invoice_id: invoiceId,
    customer_id: inv.customer_id,
    reason,
    subtotal: t.subtotal,
    vat_pct: t.vatPct,
    vat_amount: t.vatAmount,
    grand_total: t.grandTotal,
    created_by: me?.full_name ?? null,
  });
  if (error) return fail(error.message);

  revalidatePath("/accounting");
  return { ok: true, message: `ออกใบลดหนี้ ${code} จำนวน ${amount.toLocaleString("th-TH")} บาท` };
}

// ============================================================================
// สร้างใบวางบิลจากใบงาน
// ============================================================================
export async function createInvoiceFromJob(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const me = await currentProfile();
  const jobId = s(fd, "job_id");
  const type = s(fd, "type") || "มัดจำ";
  const amount = n(fd, "amount");
  if (amount <= 0) return fail("ใส่ยอดที่จะวางบิล");

  const { data: job } = await sb
    .from("jobs_view")
    .select("id, code, title, customer_id, customer_name, customer_type, bu_code")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return fail("ไม่พบใบงาน");

  const { data: cus } = await sb
    .from("customers")
    .select("name, tax_id, address_bill, contact_name, phone, credit_days, type")
    .eq("id", job.customer_id)
    .maybeSingle();

  const useVat = s(fd, "vat") === "on";
  const useWht = shouldWithhold(cus?.type ?? job.customer_type);
  const t = computeTotals({ subtotal: amount, vat: useVat, wht: useWht });

  const { data: code } = await sb.rpc("next_code", { p_prefix: "INV" });
  const today = new Date().toISOString().slice(0, 10);
  const creditDays = Number(cus?.credit_days ?? 0);
  const due = new Date();
  due.setDate(due.getDate() + creditDays);

  const { data, error } = await sb
    .from("invoices")
    .insert({
      code,
      job_id: jobId,
      customer_id: job.customer_id,
      type,
      status: "Issued",
      bill_to_name: cus?.name ?? job.customer_name,
      bill_to_tax_id: cus?.tax_id ?? null,
      bill_to_address: cus?.address_bill ?? null,
      bill_to_contact: cus?.contact_name ?? null,
      bu_code: job.bu_code,
      issue_date: today,
      due_date: due.toISOString().slice(0, 10),
      subtotal: t.subtotal,
      discount: t.discount,
      vat_pct: t.vatPct,
      vat_amount: t.vatAmount,
      grand_total: t.grandTotal,
      wht_pct: t.whtPct,
      wht_amount: t.whtAmount,
      net_payable: t.netPayable,
      credit_days: creditDays,
      party_name: cus?.name ?? job.customer_name,
      party_tax_id: cus?.tax_id ?? null,
      party_address: cus?.address_bill ?? null,
      party_contact: cus?.contact_name ?? null,
      party_phone: cus?.phone ?? null,
      created_by: me?.full_name ?? null,
      locked_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) return fail(error.message);

  await sb.from("doc_lines").insert({
    doc_type: "invoice",
    doc_id: data.id,
    seq: 1,
    description: `${type} · ${job.title}`,
    detail: `อ้างอิงใบงาน ${job.code}`,
    qty: 1,
    unit: "งาน",
    unit_price: amount,
  });

  revalidatePath("/accounting");
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true, message: `ออกใบวางบิล ${code} ยอด ${t.netPayable.toLocaleString("th-TH")} บาท` };
}
