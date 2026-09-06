"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { needsApprovalBudgetLocal } from "@/lib/rules";
import { consumeApproval } from "./approvals";
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
// เปิดใบสั่งซื้อ  เกินงบต้องมีใบอนุมัติ
// ============================================================================
export async function createPurchaseOrder(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const me = await currentProfile();
  if (!me) return fail("ต้องเข้าสู่ระบบก่อน");

  const title = s(fd, "title");
  const supplierName = s(fd, "supplier_name");
  if (!title) return fail("ใส่ชื่อรายการที่จะสั่งซื้อ");
  if (!supplierName) return fail("เลือกร้านหรือโรงงานที่สั่ง");

  // รายการมาเป็นชุด item_name / qty / cost ตามลำดับเดียวกัน
  const names = fd.getAll("item_name").map(String);
  const qtys = fd.getAll("qty_ordered").map((v) => Number(v) || 0);
  const costs = fd.getAll("unit_cost").map((v) => Number(v) || 0);
  const skus = fd.getAll("sku_code").map(String);
  const sizes = fd.getAll("size").map(String);

  const lines = names
    .map((nm, i) => ({
      seq: i + 1,
      item_name: nm.trim(),
      sku_code: skus[i]?.trim() || null,
      size: sizes[i]?.trim() || null,
      qty_ordered: qtys[i] ?? 0,
      unit_cost: costs[i] ?? 0,
    }))
    .filter((l) => l.item_name && l.qty_ordered > 0);

  if (lines.length === 0) return fail("ต้องมีอย่างน้อยหนึ่งรายการที่จำนวนมากกว่าศูนย์");

  const total = lines.reduce((a, l) => a + l.qty_ordered * l.unit_cost, 0);

  // ---------------------------------------------------------------- เกินงบ
  let approvalNote: string | null = null;
  if (await needsApprovalBudgetLocal(total)) {
    try {
      const code = await consumeApproval("budget_over", "purchase_order", null, title);
      approvalNote = `ยอดเกินงบ ใช้ใบอนุมัติ ${code}`;
    } catch {
      return fail(
        `ยอดรวม ${total.toLocaleString("th-TH")} บาท เกินเพดานที่สั่งซื้อได้เอง ` +
          `ต้องขออนุมัติจากเจ้าของก่อน`,
      );
    }
  }

  const { data: code, error: cErr } = await sb.rpc("next_code", { p_prefix: "PO" });
  if (cErr) return fail(cErr.message);

  const { data: po, error } = await sb
    .from("purchase_orders")
    .insert({
      code,
      supplier_name: supplierName,
      title,
      category: s(fd, "category") || "เสื้อเปล่า",
      status: "Ordered",
      ordered_at: new Date().toISOString(),
      expected_at: s(fd, "expected_at") || null,
      total,
      created_by: me.full_name,
      note: [s(fd, "note"), approvalNote].filter(Boolean).join(" · ") || null,
    })
    .select("id")
    .single();
  if (error) return fail(error.message);

  const { error: lErr } = await sb
    .from("purchase_order_items")
    .insert(lines.map((l) => ({ ...l, po_id: po.id })));
  if (lErr) return fail(lErr.message);

  revalidatePath("/purchasing");
  return {
    ok: true,
    message: approvalNote
      ? `เปิดใบสั่งซื้อ ${code} แล้ว · ${approvalNote}`
      : `เปิดใบสั่งซื้อ ${code} ยอด ${total.toLocaleString("th-TH")} บาท`,
  };
}

// ============================================================================
// รับของเข้าคลัง
//
// ตรวจทุกบรรทัดให้ผ่านก่อน แล้วค่อยลงมือเขียน
// ถ้าตรวจไปเขียนไป บรรทัดแรกจะเข้าคลังไปแล้วตอนที่บรรทัดหลังพัง
// ============================================================================
export async function receivePurchase(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const me = await currentProfile();
  if (!me) return fail("ต้องเข้าสู่ระบบก่อน");

  const poCode = s(fd, "po_code");
  const { data: po } = await sb
    .from("purchase_orders")
    .select("id, code, status")
    .eq("code", poCode)
    .maybeSingle();
  if (!po) return fail("ไม่พบใบสั่งซื้อ");
  if (po.status === "Cancelled") return fail("ใบสั่งซื้อนี้ถูกยกเลิกไปแล้ว");
  if (po.status === "Received") return fail("ใบสั่งซื้อนี้รับของครบแล้ว");

  const { data: items } = await sb
    .from("purchase_order_items")
    .select("*")
    .eq("po_id", po.id);
  if (!items?.length) return fail("ใบสั่งซื้อนี้ไม่มีรายการ");

  // ---------------------------------------------------------------- รอบตรวจ
  type Plan = {
    itemId: string;
    qty: number;
    skuCode: string | null;
    supplyCode: string | null;
    newReceived: number;
    label: string;
  };
  const plan: Plan[] = [];

  for (const it of items) {
    const raw = fd.get(`qty_${it.id}`);
    if (raw === null) continue;
    const qty = Number(raw);
    const label = `${it.item_name ?? it.sku_code ?? "รายการ"}${it.size ? ` ไซส์ ${it.size}` : ""}`;

    if (!Number.isFinite(qty) || qty < 0) return fail(`${label} จำนวนที่รับไม่ถูกต้อง`);
    if (qty === 0) continue;
    if (!Number.isInteger(qty)) return fail(`${label} จำนวนต้องเป็นจำนวนเต็ม`);

    const outstanding = Number(it.qty_ordered) - Number(it.qty_received);
    if (qty > outstanding)
      return fail(
        `${label} รับเกินยอดค้าง ค้างอยู่ ${outstanding} ชิ้น แต่กรอกมา ${qty} ชิ้น`,
      );

    plan.push({
      itemId: it.id,
      qty,
      skuCode: it.sku_code,
      supplyCode: it.supply_code,
      newReceived: Number(it.qty_received) + qty,
      label,
    });
  }

  if (plan.length === 0) return fail("ยังไม่ได้ใส่จำนวนที่รับเข้า");

  // ---------------------------------------------------------------- รอบเขียน
  let totalQty = 0;
  for (const p of plan) {
    await sb
      .from("purchase_order_items")
      .update({ qty_received: p.newReceived })
      .eq("id", p.itemId);

    if (p.skuCode) {
      const { data: sku } = await sb
        .from("skus")
        .select("qty_on_hand")
        .eq("code", p.skuCode)
        .maybeSingle();
      const before = Number(sku?.qty_on_hand ?? 0);
      await sb.from("skus").update({ qty_on_hand: before + p.qty }).eq("code", p.skuCode);
      await sb.from("stock_movements").insert({
        sku_code: p.skuCode,
        type: "รับเข้า",
        qty: p.qty,
        ref_type: "po",
        ref_no: po.code,
        qty_before: before,
        qty_after: before + p.qty,
        reason_code: "รับของตามใบสั่งซื้อ",
        by_user: me.full_name,
      });
    } else if (p.supplyCode) {
      const { data: sup } = await sb
        .from("supplies")
        .select("qty_on_hand")
        .eq("code", p.supplyCode)
        .maybeSingle();
      const before = Number(sup?.qty_on_hand ?? 0);
      await sb.from("supplies").update({ qty_on_hand: before + p.qty }).eq("code", p.supplyCode);
      await sb.from("stock_movements").insert({
        supply_code: p.supplyCode,
        type: "รับเข้า",
        qty: p.qty,
        ref_type: "po",
        ref_no: po.code,
        qty_before: before,
        qty_after: before + p.qty,
        reason_code: "รับของตามใบสั่งซื้อ",
        by_user: me.full_name,
      });
    }
    totalQty += p.qty;
  }

  // ---------------------------------------------------------------- ปิดใบถ้าครบ
  const { data: after } = await sb
    .from("purchase_order_items")
    .select("qty_ordered, qty_received")
    .eq("po_id", po.id);
  const left = (after ?? []).reduce(
    (a, r) => a + (Number(r.qty_ordered) - Number(r.qty_received)),
    0,
  );

  await sb
    .from("purchase_orders")
    .update({
      status: left <= 0 ? "Received" : "Partial",
      received_at: new Date().toISOString(),
      confirmed_at: left <= 0 ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", po.id);

  revalidatePath("/purchasing");
  revalidatePath("/stock");
  return {
    ok: true,
    message:
      left <= 0
        ? `รับเข้า ${totalQty} ชิ้น · ใบสั่งซื้อ ${po.code} รับครบแล้ว`
        : `รับเข้า ${totalQty} ชิ้น · ยังค้างอีก ${left} ชิ้น`,
  };
}

// ============================================================================
// ยกเลิกใบสั่งซื้อ
// ============================================================================
export async function cancelPurchase(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const code = s(fd, "po_code");
  const reason = s(fd, "reason");
  if (reason.length < 5) return fail("ระบุเหตุผลที่ยกเลิก");

  const { data: po } = await sb
    .from("purchase_orders")
    .select("id, status")
    .eq("code", code)
    .maybeSingle();
  if (!po) return fail("ไม่พบใบสั่งซื้อ");
  if (po.status === "Received") return fail("ใบนี้รับของครบแล้ว ยกเลิกไม่ได้");
  if (po.status === "Partial")
    return fail("ใบนี้รับของไปบางส่วนแล้ว ยกเลิกไม่ได้ ให้ปิดใบตามจำนวนที่รับจริง");

  const { error } = await sb
    .from("purchase_orders")
    .update({ status: "Cancelled", cancelled_reason: reason })
    .eq("id", po.id);
  if (error) return fail(error.message);

  revalidatePath("/purchasing");
  return { ok: true, message: "ยกเลิกใบสั่งซื้อแล้ว" };
}

// ============================================================================
// จองผ้าให้งาน  ผ่านประตู G5
// ============================================================================
export async function reserveStock(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const me = await currentProfile();
  const jobCode = s(fd, "job_code");
  const skuCode = s(fd, "sku_code");
  const qty = n(fd, "qty");

  if (!skuCode) return fail("เลือกรหัสสินค้าที่จะจอง");
  if (qty <= 0) return fail("จำนวนที่จองต้องมากกว่าศูนย์");

  const { data: sku } = await sb
    .from("skus")
    .select("qty_on_hand, qty_allocated, stock_policy")
    .eq("code", skuCode)
    .maybeSingle();
  if (!sku) return fail("ไม่พบรหัสสินค้านี้");

  const available = Number(sku.qty_on_hand) - Number(sku.qty_allocated);
  if (qty > available)
    return fail(
      `จองได้ไม่เกินยอดที่ว่างอยู่ ตอนนี้ว่าง ${available} ชิ้น · ` +
        `ถ้าต้องการมากกว่านี้ ให้เปิดใบสั่งซื้อเพิ่มก่อน`,
    );

  await sb
    .from("skus")
    .update({ qty_allocated: Number(sku.qty_allocated) + qty })
    .eq("code", skuCode);

  const { error } = await sb.from("stock_movements").insert({
    sku_code: skuCode,
    type: "จอง",
    qty,
    ref_type: "job",
    ref_no: jobCode,
    qty_before: Number(sku.qty_allocated),
    qty_after: Number(sku.qty_allocated) + qty,
    reason_code: "จองผ้าให้งาน",
    by_user: me?.full_name ?? null,
  });
  if (error) return fail(error.message);

  revalidatePath("/stock");
  return { ok: true, message: `จอง ${skuCode} จำนวน ${qty} ชิ้น ให้งาน ${jobCode} แล้ว` };
}

// ============================================================================
// ปรับยอดสต็อกด้วยมือ  ต้องมีเหตุผลเสมอ
// ============================================================================
export async function adjustStock(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const me = await currentProfile();
  const skuCode = s(fd, "sku_code");
  const qty = n(fd, "qty");
  const type = s(fd, "type");
  const reason = s(fd, "reason");

  if (!skuCode) return fail("เลือกรหัสสินค้า");
  if (qty === 0) return fail("จำนวนต้องไม่เป็นศูนย์");
  if (reason.length < 5) return fail("ต้องเขียนเหตุผล ยอดสต็อกต้องอธิบายที่มาได้เสมอ");
  if (!["รับเข้า", "ตัดจ่าย", "คืน", "ปรับปรุง", "ตัดของเสีย"].includes(type))
    return fail("ประเภทการเคลื่อนไหวไม่ถูกต้อง");

  const { data: sku } = await sb
    .from("skus")
    .select("qty_on_hand")
    .eq("code", skuCode)
    .maybeSingle();
  if (!sku) return fail("ไม่พบรหัสสินค้านี้");

  const before = Number(sku.qty_on_hand);
  const sign = type === "รับเข้า" || type === "คืน" ? 1 : type === "ปรับปรุง" ? 0 : -1;
  const after = sign === 0 ? qty : before + sign * Math.abs(qty);

  if (after < 0) return fail(`ยอดคงเหลือติดลบไม่ได้ ตอนนี้มี ${before} ชิ้น`);

  await sb.from("skus").update({ qty_on_hand: after }).eq("code", skuCode);
  const { error } = await sb.from("stock_movements").insert({
    sku_code: skuCode,
    type,
    qty: Math.abs(after - before) || Math.abs(qty),
    ref_type: "manual",
    ref_no: null,
    qty_before: before,
    qty_after: after,
    reason_code: reason.slice(0, 40),
    remark: reason,
    by_user: me?.full_name ?? null,
  });
  if (error) return fail(error.message);

  revalidatePath("/stock");
  return { ok: true, message: `ปรับ ${skuCode} จาก ${before} เป็น ${after} ชิ้นแล้ว` };
}
