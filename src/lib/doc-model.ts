// ============================================================================
// รูปแบบข้อมูลกลางของเอกสารทั้งสามใบ
// หน้าแก้ไข หน้าพรีวิว และหน้าพิมพ์ ใช้ก้อนข้อมูลเดียวกันนี้
// จะได้ไม่มีปัญหาแก้แล้วพิมพ์ออกมาไม่ตรงกับที่เห็น
// ============================================================================

import { computeTotals, type Totals } from "./accounting";

export type DocType = "quotation" | "invoice" | "receipt";

export const DOC_TITLE: Record<DocType, string> = {
  quotation: "ใบเสนอราคา",
  invoice: "ใบวางบิล / ใบแจ้งหนี้",
  receipt: "ใบเสร็จรับเงิน",
};

export const DOC_TITLE_EN: Record<DocType, string> = {
  quotation: "QUOTATION",
  invoice: "INVOICE",
  receipt: "RECEIPT",
};

export const DOC_PREFIX: Record<DocType, string> = {
  quotation: "QT",
  invoice: "INV",
  receipt: "RC",
};

export type DocLine = {
  id?: string;
  seq: number;
  description: string | null;
  detail: string | null;
  qty: number;
  unit: string;
  unit_price: number;
};

export type DocParty = {
  name: string | null;
  tax_id: string | null;
  address: string | null;
  contact: string | null;
  phone: string | null;
};

export type DocLabels = Record<string, string>;

export type DocModel = {
  docType: DocType;
  id: string;
  code: string | null;
  status: string | null;
  issueDate: string | null;
  dueDate: string | null;
  poNumber: string | null;
  projectName: string | null;
  creditDays: number | null;
  terms: string | null;
  party: DocParty;
  lines: DocLine[];
  discount: number;
  vat: boolean;
  vatPct: number;
  wht: boolean;
  whtPct: number;
  labels: DocLabels;
  lockedAt: string | null;
  note: string | null;
};

export const DEFAULT_LABELS: DocLabels = {
  doc_no: "เลขที่", doc_date: "วันที่", due_date: "ครบกำหนด",
  party: "ลูกค้า", refs: "เอกสารอ้างอิง", po: "เลขที่ใบสั่งซื้อ",
  project: "โปรเจกต์", credit: "เครดิต",
  col_seq: "ลำดับ", col_desc: "รายการ", col_qty: "จำนวน", col_unit: "หน่วย",
  col_price: "ราคา/หน่วย", col_amount: "จำนวนเงิน",
  subtotal: "รวมเป็นเงิน", discount: "ส่วนลด", before_vat: "ยอดก่อนภาษี",
  vat: "ภาษีมูลค่าเพิ่ม", grand_total: "รวมทั้งสิ้น", wht: "หัก ณ ที่จ่าย",
  net: "ยอดที่ต้องชำระ", baht_text: "จำนวนเงินเป็นตัวอักษร", terms: "เงื่อนไขการชำระเงิน",
};

export function label(m: Pick<DocModel, "labels">, key: string): string {
  return m.labels?.[key] || DEFAULT_LABELS[key] || key;
}

export function docTotals(m: DocModel): Totals {
  const subtotal = m.lines.reduce(
    (s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0),
    0,
  );
  return computeTotals({
    subtotal,
    discount: m.discount,
    vat: m.vat,
    vatPct: m.vatPct,
    wht: m.wht,
    whtPct: m.whtPct,
  });
}

/** แปลงแถวจากฐานข้อมูลให้เป็นรูปแบบกลาง */
export function toDocModel(
  docType: DocType,
  row: Record<string, unknown>,
  lines: Record<string, unknown>[],
): DocModel {
  const g = <T,>(k: string, d: T): T => (row[k] === null || row[k] === undefined ? d : (row[k] as T));

  return {
    docType,
    id: String(row.id),
    code: g<string | null>("code", null),
    status: g<string | null>("status", null),
    issueDate: g<string | null>("issue_date", null) ?? g<string | null>("issued_at", null),
    dueDate: g<string | null>("due_date", null) ?? g<string | null>("valid_until", null),
    poNumber: g<string | null>("po_number", null),
    projectName: g<string | null>("project_name", null),
    creditDays: g<number | null>("credit_days", null),
    terms: g<string | null>("terms", null),
    party: {
      name: g<string | null>("party_name", null)
        ?? g<string | null>("bill_to_name", null)
        ?? g<string | null>("received_from", null),
      tax_id: g<string | null>("party_tax_id", null)
        ?? g<string | null>("bill_to_tax_id", null)
        ?? g<string | null>("tax_id", null),
      address: g<string | null>("party_address", null)
        ?? g<string | null>("bill_to_address", null)
        ?? g<string | null>("address", null),
      contact: g<string | null>("party_contact", null)
        ?? g<string | null>("bill_to_contact", null),
      phone: g<string | null>("party_phone", null),
    },
    lines: lines
      .map((l, i) => ({
        id: l.id ? String(l.id) : undefined,
        seq: Number(l.seq ?? i + 1),
        description: (l.description as string) ?? null,
        detail: (l.detail as string) ?? null,
        qty: Number(l.qty ?? 0),
        unit: (l.unit as string) ?? "ตัว",
        unit_price: Number(l.unit_price ?? 0),
      }))
      .sort((a, b) => a.seq - b.seq),
    discount: Number(row.discount ?? 0),
    vat: Number(row.vat_pct ?? 0) > 0,
    vatPct: Number(row.vat_pct ?? 7),
    wht: Number(row.wht_pct ?? 0) > 0,
    whtPct: Number(row.wht_pct ?? 3),
    labels: (row.labels as DocLabels) ?? {},
    lockedAt: g<string | null>("locked_at", null),
    note: g<string | null>("note", null),
  };
}

/** ร่างเปล่าสำหรับสร้างเอกสารใหม่ */
export function emptyLine(seq: number): DocLine {
  return { seq, description: "", detail: "", qty: 1, unit: "ตัว", unit_price: 0 };
}
