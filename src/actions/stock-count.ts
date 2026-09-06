"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import type { ActionResult } from "@/components/action-form";

function fail(message: string): ActionResult {
  return { ok: false, message };
}
function s(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}

// ============================================================================
// เปิดรอบนับสต็อก
// นับรวมทั้งคลัง แยกไซส์และสี  ตั้งต้นจากรหัสสินค้าที่ยังใช้งานอยู่ทั้งหมด
// ============================================================================
export async function openCount(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const me = await currentProfile();
  if (!me) return fail("ต้องเข้าสู่ระบบก่อน");

  const { data: openOne } = await sb
    .from("stock_counts")
    .select("code")
    .eq("status", "ร่าง")
    .maybeSingle();
  if (openOne)
    return fail(`ยังมีรอบนับที่เปิดค้างอยู่ ${openOne.code} ปิดรอบนั้นก่อนถึงจะเปิดรอบใหม่ได้`);

  const { data: code, error: cErr } = await sb.rpc("next_code", { p_prefix: "CNT" });
  if (cErr) return fail(cErr.message);

  const { data: last } = await sb
    .from("stock_counts")
    .select("round_no")
    .order("round_no", { ascending: false })
    .limit(1);

  const { data: count, error } = await sb
    .from("stock_counts")
    .insert({
      code,
      round_no: Number(last?.[0]?.round_no ?? 0) + 1,
      scope: s(fd, "scope") || "ทั้งคลัง",
      status: "ร่าง",
      counted_by: me.full_name,
      note: s(fd, "note") || null,
    })
    .select("id")
    .single();
  if (error) return fail(error.message);

  const { data: skus } = await sb
    .from("skus")
    .select("code, qty_on_hand")
    .eq("status", "Active");
  const { data: supplies } = await sb.from("supplies").select("code, qty_on_hand");

  const rows = [
    ...(skus ?? []).map((k) => ({
      count_id: count.id,
      sku_code: k.code,
      qty_system: Number(k.qty_on_hand ?? 0),
    })),
    ...(supplies ?? []).map((k) => ({
      count_id: count.id,
      supply_code: k.code,
      qty_system: Number(k.qty_on_hand ?? 0),
    })),
  ];

  if (rows.length === 0) return fail("ยังไม่มีรายการในคลังให้นับ");

  const { error: iErr } = await sb.from("stock_count_items").insert(rows);
  if (iErr) return fail(iErr.message);

  revalidatePath("/stock/count");
  return { ok: true, message: `เปิดรอบนับ ${code} แล้ว มีทั้งหมด ${rows.length} รายการ` };
}

// ============================================================================
// บันทึกยอดที่นับได้ทีละรายการ
// ============================================================================
export async function saveCountRow(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const itemId = s(fd, "item_id");
  const raw = s(fd, "qty_counted");

  const { data: item } = await sb
    .from("stock_count_items")
    .select("id, count_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return fail("ไม่พบรายการนับ");

  const { data: head } = await sb
    .from("stock_counts")
    .select("status")
    .eq("id", item.count_id)
    .maybeSingle();
  if (head?.status !== "ร่าง") return fail("รอบนับนี้ปิดแล้ว แก้ยอดไม่ได้");

  if (raw === "") {
    const { error } = await sb
      .from("stock_count_items")
      .update({ qty_counted: null })
      .eq("id", itemId);
    if (error) return fail(error.message);
    return { ok: true };
  }

  const qty = Number(raw);
  if (!Number.isFinite(qty) || qty < 0 || !Number.isInteger(qty))
    return fail("จำนวนที่นับได้ต้องเป็นจำนวนเต็มไม่ติดลบ");

  const { error } = await sb
    .from("stock_count_items")
    .update({ qty_counted: qty })
    .eq("id", itemId);
  if (error) return fail(error.message);

  return { ok: true };
}

// ============================================================================
// ปิดรอบนับ
// ตรงนี้เท่านั้นที่ยอดในคลังจะขยับ และทุกการขยับมีร่องรอย
// ============================================================================
export async function closeCount(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const me = await currentProfile();
  if (!me) return fail("ต้องเข้าสู่ระบบก่อน");

  const countId = s(fd, "count_id");
  const { data: head } = await sb
    .from("stock_counts")
    .select("id, code, status")
    .eq("id", countId)
    .maybeSingle();
  if (!head) return fail("ไม่พบรอบนับ");
  if (head.status !== "ร่าง") return fail("รอบนับนี้ปิดไปแล้ว");

  const { data: items } = await sb
    .from("stock_count_items")
    .select("*")
    .eq("count_id", countId);
  if (!items?.length) return fail("รอบนับนี้ไม่มีรายการ");

  const counted = items.filter((i) => i.qty_counted !== null);
  if (counted.length === 0) return fail("ยังไม่ได้นับสักรายการ");

  const notCounted = items.length - counted.length;
  if (notCounted > 0 && s(fd, "force") !== "on")
    return fail(
      `ยังนับไม่ครบ เหลืออีก ${notCounted} รายการ · ` +
        `ถ้าตั้งใจปิดทั้งที่นับไม่ครบ ให้ติ๊กยืนยันแล้วกดอีกครั้ง รายการที่ไม่ได้นับจะไม่ถูกแตะ`,
    );

  let changed = 0;
  let diffQty = 0;

  for (const it of counted) {
    const to = Number(it.qty_counted);
    const from = Number(it.qty_system);
    if (to === from) continue;

    if (it.sku_code) {
      await sb.from("skus").update({ qty_on_hand: to }).eq("code", it.sku_code);
      await sb.from("stock_movements").insert({
        sku_code: it.sku_code,
        type: "ปรับปรุง",
        qty: Math.abs(to - from),
        ref_type: "count",
        ref_no: head.code,
        qty_before: from,
        qty_after: to,
        reason_code: "ปรับตามผลนับ",
        remark: it.note ?? `นับได้ ${to} ระบบมี ${from}`,
        by_user: me.full_name,
      });
    } else if (it.supply_code) {
      await sb.from("supplies").update({ qty_on_hand: to }).eq("code", it.supply_code);
      await sb.from("stock_movements").insert({
        supply_code: it.supply_code,
        type: "ปรับปรุง",
        qty: Math.abs(to - from),
        ref_type: "count",
        ref_no: head.code,
        qty_before: from,
        qty_after: to,
        reason_code: "ปรับตามผลนับ",
        remark: it.note ?? `นับได้ ${to} ระบบมี ${from}`,
        by_user: me.full_name,
      });
    }
    changed++;
    diffQty += to - from;
  }

  const { error } = await sb
    .from("stock_counts")
    .update({
      status: "ปิดแล้ว",
      closed_at: new Date().toISOString(),
      closed_by: me.full_name,
    })
    .eq("id", countId);
  if (error) return fail(error.message);

  revalidatePath("/stock");
  revalidatePath("/stock/count");
  return {
    ok: true,
    message:
      changed === 0
        ? `ปิดรอบนับ ${head.code} แล้ว ยอดตรงกับระบบทุกรายการ`
        : `ปิดรอบนับ ${head.code} แล้ว ปรับ ${changed} รายการ รวม ${diffQty > 0 ? "+" : ""}${diffQty} ชิ้น`,
  };
}
