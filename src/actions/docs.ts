"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { docTotals, type DocModel, type DocType } from "@/lib/doc-model";
import { needsApprovalDiscountLocal } from "@/lib/rules";
import { consumeApproval } from "./approvals";
import type { SaveResult } from "@/components/doc-editor";

const TABLE: Record<DocType, string> = {
  quotation: "quotations",
  invoice: "invoices",
  receipt: "receipts",
};

const PREFIX: Record<DocType, string> = {
  quotation: "QT",
  invoice: "INV",
  receipt: "RC",
};

function fail(message: string): SaveResult {
  return { ok: false, message };
}

function parse(payload: string): DocModel | null {
  try {
    return JSON.parse(payload) as DocModel;
  } catch {
    return null;
  }
}

/** เอกสารใบนี้ยังแก้ได้ไหม ตรวจจากของจริงในฐานข้อมูล ไม่ใช่จากที่หน้าจอส่งมา */
async function assertEditable(docType: DocType, id: string): Promise<string | null> {
  const sb = supabaseServer();
  const { data } = await sb
    .from(TABLE[docType])
    .select("code, status, locked_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) return "ไม่พบเอกสาร";
  if (data.locked_at) return "เอกสารนี้ถูกล็อกแล้ว แก้ไม่ได้";
  if (data.code) return `เอกสารออกเลขที่ ${data.code} ไปแล้ว แก้ย้อนหลังไม่ได้`;
  if (data.status && data.status !== "Draft")
    return `เอกสารอยู่ในสถานะ ${data.status} แก้ไม่ได้`;
  return null;
}

/** เขียนหัวเอกสารและรายการลงฐานข้อมูล */
async function writeDoc(docType: DocType, m: DocModel) {
  const sb = supabaseServer();
  const t = docTotals(m);

  const head: Record<string, unknown> = {
    po_number: m.poNumber || null,
    project_name: m.projectName || null,
    credit_days: m.creditDays ?? null,
    terms: m.terms || null,
    labels: m.labels ?? {},
    party_name: m.party.name || null,
    party_tax_id: m.party.tax_id || null,
    party_address: m.party.address || null,
    party_contact: m.party.contact || null,
    party_phone: m.party.phone || null,
    subtotal: t.subtotal,
    vat_pct: t.vatPct,
    vat_amount: t.vatAmount,
    grand_total: t.grandTotal,
    wht_pct: t.whtPct,
    wht_amount: t.whtAmount,
  };

  if (docType === "quotation") {
    head.issued_at = m.issueDate || null;
    head.valid_until = m.dueDate || null;
  } else {
    head.issue_date = m.issueDate || null;
    if (docType === "invoice") {
      head.due_date = m.dueDate || null;
      head.discount = t.discount;
      head.net_payable = t.netPayable;
    } else {
      head.net_received = t.netPayable;
    }
  }

  const { error: hErr } = await sb.from(TABLE[docType]).update(head).eq("id", m.id);
  if (hErr) throw new Error(hErr.message);

  // รายการเขียนใหม่ทั้งชุด ง่ายและตรงกับสิ่งที่เห็นบนจอเสมอ
  await sb.from("doc_lines").delete().eq("doc_type", docType).eq("doc_id", m.id);
  if (m.lines.length) {
    const { error: lErr } = await sb.from("doc_lines").insert(
      m.lines.map((l, i) => ({
        doc_type: docType,
        doc_id: m.id,
        seq: i + 1,
        description: l.description || null,
        detail: l.detail || null,
        qty: Number(l.qty) || 0,
        unit: l.unit || "ตัว",
        unit_price: Number(l.unit_price) || 0,
      })),
    );
    if (lErr) throw new Error(lErr.message);
  }

  return t;
}

// ============================================================================
// บันทึกร่าง
// ============================================================================
export async function saveDoc(
  docType: DocType,
  id: string,
  payload: string,
): Promise<SaveResult> {
  const m = parse(payload);
  if (!m) return fail("ข้อมูลเอกสารเสียหาย ลองโหลดหน้าใหม่");
  if (m.id !== id) return fail("รหัสเอกสารไม่ตรงกัน");

  const locked = await assertEditable(docType, id);
  if (locked) return fail(locked);

  try {
    await writeDoc(docType, m);
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
  }

  revalidatePath(`/${docType}s/${id}`);
  revalidatePath("/docs");
  return { ok: true, message: "บันทึกร่างแล้ว" };
}

// ============================================================================
// ออกเอกสารและล็อก
// เลขที่เอกสารเกิดตรงนี้ที่เดียว ร่างจึงไม่กินเลข
// ============================================================================
export async function issueDoc(
  docType: DocType,
  id: string,
  payload: string,
): Promise<SaveResult> {
  const sb = supabaseServer();
  const me = await currentProfile();
  const m = parse(payload);
  if (!m) return fail("ข้อมูลเอกสารเสียหาย ลองโหลดหน้าใหม่");
  if (m.id !== id) return fail("รหัสเอกสารไม่ตรงกัน");
  if (m.lines.length === 0) return fail("เอกสารต้องมีอย่างน้อยหนึ่งรายการ");
  if (!m.party.name) return fail("ต้องระบุชื่อคู่ค้าก่อนออกเอกสาร");

  const locked = await assertEditable(docType, id);
  if (locked) return fail(locked);

  const t = docTotals(m);
  if (t.grandTotal <= 0) return fail("ยอดรวมต้องมากกว่าศูนย์");

  // ---------------------------------------------------------------- ส่วนลดเกินเพดาน
  if (t.discount > 0 && t.subtotal > 0) {
    const pct = (t.discount / t.subtotal) * 100;
    const over = await needsApprovalDiscountLocal(pct);
    if (over) {
      try {
        const code = await consumeApproval(
          "discount_over",
          docType === "quotation" ? "quotation" : "invoice",
          id,
          `ส่วนลด ${pct.toFixed(1)}%`,
        );
        m.terms = `${m.terms ?? ""}`.trim();
        await sb
          .from(TABLE[docType])
          .update({ note: `ส่วนลด ${pct.toFixed(1)}% ใช้ใบอนุมัติ ${code}` })
          .eq("id", id);
      } catch {
        return fail(
          `ส่วนลด ${pct.toFixed(1)}% เกินเพดานที่ฝ่ายขายลดได้เอง ` +
            `ต้องขออนุมัติจากเจ้าของก่อนออกเอกสาร`,
        );
      }
    }
  }

  try {
    await writeDoc(docType, m);
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
  }

  const { data: code, error: cErr } = await sb.rpc("next_code", {
    p_prefix: PREFIX[docType],
  });
  if (cErr) return fail(cErr.message);

  const patch: Record<string, unknown> = {
    code,
    locked_at: new Date().toISOString(),
    locked_by: me?.full_name ?? null,
  };
  if (docType === "quotation") patch.status = "Sent";
  if (docType === "invoice") patch.status = "Issued";

  const { error } = await sb.from(TABLE[docType]).update(patch).eq("id", id);
  if (error) return fail(error.message);

  revalidatePath(`/${docType}s/${id}`);
  revalidatePath("/docs");
  revalidatePath("/accounting");
  return { ok: true, message: `ออกเอกสารเลขที่ ${code} และล็อกแล้ว` };
}

// ============================================================================
// สร้างร่างใหม่  ไม่กินเลขที่เอกสาร
// ============================================================================
export async function newDraft(fd: FormData): Promise<{ ok: boolean; message: string; id?: string }> {
  const sb = supabaseServer();
  const docType = (String(fd.get("doc_type") ?? "quotation")) as DocType;
  const customerId = String(fd.get("customer_id") ?? "").trim();

  const { data: cus } = customerId
    ? await sb
        .from("customers")
        .select("name, tax_id, address_bill, contact_name, phone, credit_days")
        .eq("id", customerId)
        .maybeSingle()
    : { data: null };

  const today = new Date().toISOString().slice(0, 10);
  const base: Record<string, unknown> = {
    code: null,
    customer_id: customerId || null,
    credit_days: cus?.credit_days ?? 30,
    party_name: cus?.name ?? null,
    party_tax_id: cus?.tax_id ?? null,
    party_address: cus?.address_bill ?? null,
    party_contact: cus?.contact_name ?? null,
    party_phone: cus?.phone ?? null,
  };

  if (docType === "quotation") {
    base.status = "Draft";
    base.issued_at = today;
    base.bu_code = "BU1";
  } else if (docType === "invoice") {
    base.status = "Draft";
    base.issue_date = today;
    base.bill_to_name = cus?.name ?? null;
  } else {
    base.issue_date = today;
    base.received_from = cus?.name ?? null;
  }

  const { data, error } = await sb.from(TABLE[docType]).insert(base).select("id").single();
  if (error) return { ok: false, message: error.message };

  revalidatePath("/docs");
  return { ok: true, message: "สร้างร่างแล้ว", id: data.id };
}

export async function deleteDraft(fd: FormData): Promise<SaveResult> {
  const sb = supabaseServer();
  const docType = (String(fd.get("doc_type") ?? "quotation")) as DocType;
  const id = String(fd.get("id") ?? "").trim();

  const locked = await assertEditable(docType, id);
  if (locked) return fail(`ลบไม่ได้ ${locked}`);

  await sb.from("doc_lines").delete().eq("doc_type", docType).eq("doc_id", id);
  const { error } = await sb.from(TABLE[docType]).delete().eq("id", id);
  if (error) return fail(error.message);

  revalidatePath("/docs");
  return { ok: true, message: "ลบร่างแล้ว" };
}
