import "server-only";
import { supabaseServer } from "./supabase/server";

export type ApprovalRules = {
  max_discount_pct: number;
  max_credit_days: number;
  po_budget_cap: number;
  allow_ship_before_paid: boolean;
  approval_valid_hours: number;
};

const FALLBACK: ApprovalRules = {
  max_discount_pct: 10,
  max_credit_days: 30,
  po_budget_cap: 50000,
  allow_ship_before_paid: false,
  approval_valid_hours: 72,
};

/** เพดานที่เจ้าของตั้งไว้ ถ้าอ่านไม่ได้ให้ใช้ค่าเข้มไว้ก่อน ปลอดภัยกว่าปล่อยผ่าน */
export async function getRules(): Promise<ApprovalRules> {
  const sb = supabaseServer();
  const { data } = await sb.from("approval_rules").select("*").eq("id", 1).maybeSingle();
  if (!data) return FALLBACK;
  return {
    max_discount_pct: Number(data.max_discount_pct ?? FALLBACK.max_discount_pct),
    max_credit_days: Number(data.max_credit_days ?? FALLBACK.max_credit_days),
    po_budget_cap: Number(data.po_budget_cap ?? FALLBACK.po_budget_cap),
    allow_ship_before_paid: !!data.allow_ship_before_paid,
    approval_valid_hours: Number(data.approval_valid_hours ?? FALLBACK.approval_valid_hours),
  };
}

export async function needsApprovalDiscountLocal(pct: number): Promise<boolean> {
  const r = await getRules();
  return pct > r.max_discount_pct;
}

export async function needsApprovalCreditLocal(days: number): Promise<boolean> {
  const r = await getRules();
  return days > r.max_credit_days;
}

export async function needsApprovalBudgetLocal(amount: number): Promise<boolean> {
  const r = await getRules();
  return amount > r.po_budget_cap;
}
