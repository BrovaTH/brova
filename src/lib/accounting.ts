// ============================================================================
// กติกาบัญชี  คิดภาษี หักภาษี ณ ที่จ่าย และลำดับเอกสาร
//
// เอกสารสี่ใบเดินตามลำดับนี้
//   ใบเสนอราคา QT → ใบวางบิล INV → ใบเสร็จรับเงิน RC → ใบลดหนี้ CN
//
// กฎที่ห้ามละเมิด
//   1) เอกสารที่ออกเลขแล้วห้ามแก้ ต้องยกเลิกแล้วออกใหม่ หรือออกใบลดหนี้
//   2) ร่างไม่กินเลข เลขที่ออกตอนกดออกเอกสารเท่านั้น
//   3) ยอดบนเอกสารเป็นภาพนิ่ง แก้ราคาสินค้าทีหลังเอกสารเก่าต้องไม่ขยับ
// ============================================================================

export const VAT_PCT = 7;
export const WHT_PCT_SERVICE = 3;

export type PartyType = "บุคคลธรรมดา" | "นิติบุคคล";

export type TotalsInput = {
  /** ราคาก่อนส่วนลดและก่อนภาษี */
  subtotal: number;
  discount?: number;
  /** คิดภาษีมูลค่าเพิ่มไหม ปกติคิดถ้าบริษัทจดทะเบียนภาษี */
  vat?: boolean;
  vatPct?: number;
  /** หักภาษี ณ ที่จ่ายไหม หักเฉพาะลูกค้านิติบุคคล */
  wht?: boolean;
  whtPct?: number;
};

export type Totals = {
  subtotal: number;
  discount: number;
  beforeVat: number;
  vatPct: number;
  vatAmount: number;
  grandTotal: number;
  whtPct: number;
  whtAmount: number;
  netPayable: number;
};

/** ปัดสองตำแหน่งแบบไม่ให้เลขทศนิยมลอย */
export function r2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * คิดยอดท้ายเอกสาร
 *
 * จุดที่คนคิดผิดบ่อยที่สุดคือฐานของภาษีหัก ณ ที่จ่าย
 * ต้องหักจากยอดก่อนภาษีมูลค่าเพิ่ม ไม่ใช่ยอดรวมทั้งสิ้น
 */
export function computeTotals(inp: TotalsInput): Totals {
  const subtotal = r2(inp.subtotal || 0);
  const discount = r2(inp.discount || 0);
  const beforeVat = r2(subtotal - discount);

  const vatPct = inp.vat === false ? 0 : (inp.vatPct ?? VAT_PCT);
  const vatAmount = r2((beforeVat * vatPct) / 100);
  const grandTotal = r2(beforeVat + vatAmount);

  const whtPct = inp.wht ? (inp.whtPct ?? WHT_PCT_SERVICE) : 0;
  const whtAmount = r2((beforeVat * whtPct) / 100); // ← ฐานคือยอดก่อนภาษี
  const netPayable = r2(grandTotal - whtAmount);

  return {
    subtotal, discount, beforeVat,
    vatPct, vatAmount, grandTotal,
    whtPct, whtAmount, netPayable,
  };
}

/** ลูกค้ารายนี้หักภาษี ณ ที่จ่ายไหม */
export function shouldWithhold(partyType: string | null | undefined): boolean {
  return partyType === "นิติบุคคล";
}

export function lineAmount(qty: number, unitPrice: number): number {
  return r2((Number(qty) || 0) * (Number(unitPrice) || 0));
}

export function sumLines(lines: { qty: number; unit_price: number }[]): number {
  return r2(lines.reduce((s, l) => s + lineAmount(l.qty, l.unit_price), 0));
}

// ---------------------------------------------------------------- สถานะเอกสาร
export const INVOICE_STATUS_TH: Record<string, string> = {
  Draft: "ร่าง",
  Issued: "ออกแล้ว",
  Partial: "ชำระบางส่วน",
  Paid: "ชำระครบ",
  Overdue: "เลยกำหนด",
  Void: "ยกเลิก",
};

export const QUOTE_STATUS_TH: Record<string, string> = {
  Draft: "ร่าง",
  Sent: "ส่งแล้ว",
  Accepted: "ลูกค้าตกลง",
  Rejected: "ลูกค้าไม่เอา",
  Expired: "หมดอายุ",
  Void: "ยกเลิก",
};

/** เอกสารใบนี้แก้ได้ไหม  ออกเลขแล้วหรือล็อกแล้วคือแก้ไม่ได้ */
export function isEditable(doc: {
  code?: string | null;
  status?: string | null;
  locked_at?: string | null;
}): boolean {
  if (doc.locked_at) return false;
  if (doc.status && doc.status !== "Draft") return false;
  return !doc.code;
}

/** เหตุผลที่แก้ไม่ได้ เอาไว้แสดงบนหน้าจอ */
export function lockReason(doc: {
  code?: string | null;
  status?: string | null;
  locked_at?: string | null;
}): string | null {
  if (doc.locked_at) return "เอกสารถูกล็อกไว้แล้ว";
  if (doc.code) return `ออกเลขที่ ${doc.code} ไปแล้ว แก้ย้อนหลังไม่ได้`;
  if (doc.status && doc.status !== "Draft") return `สถานะ ${INVOICE_STATUS_TH[doc.status] ?? doc.status} แก้ไม่ได้`;
  return null;
}

// ---------------------------------------------------------------- การชำระเงิน
export const PAYMENT_METHODS = ["โอน", "เงินสด", "บัตรเครดิต", "เช็ค", "หักกลบ"] as const;

/** โอนแล้วต้องมีสลิป เงินสดใช้เลขอ้างอิงแทนได้ */
export function paymentNeedsSlip(method: string | null | undefined): boolean {
  return method !== "เงินสด" && method !== "หักกลบ";
}

export type PaymentCheck = { ok: true } | { ok: false; message: string };

export function validatePayment(p: {
  method?: string | null;
  amount?: number | null;
  slip_url?: string | null;
  slip_ref?: string | null;
}): PaymentCheck {
  if (!p.amount || Number(p.amount) <= 0) {
    return { ok: false, message: "ยอดเงินต้องมากกว่าศูนย์" };
  }
  if (paymentNeedsSlip(p.method) && !p.slip_url && !p.slip_ref) {
    return {
      ok: false,
      message: "การชำระแบบนี้ต้องแนบสลิปหรือใส่เลขอ้างอิง จะได้ตรวจย้อนหลังได้",
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------- เครดิตและกำหนดชำระ
export function dueFromCredit(issueDate: string, creditDays: number): string {
  const d = new Date(issueDate);
  d.setDate(d.getDate() + (Number(creditDays) || 0));
  return d.toISOString().slice(0, 10);
}

export function overdueDays(dueDate: string | null | undefined, paid: boolean): number {
  if (!dueDate || paid) return 0;
  const ms = Date.now() - new Date(dueDate).getTime();
  const d = Math.floor(ms / 86400000);
  return d > 0 ? d : 0;
}
