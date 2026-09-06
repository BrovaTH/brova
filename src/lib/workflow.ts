// ============================================================================
// แกนกลางของระบบ  สถานะงาน ประตูตรวจ และกติกาที่ทุกหน้าจอต้องใช้ร่วมกัน
//
// ที่นี่คือแหล่งความจริงเพียงแห่งเดียว  หน้าจอห้ามเขียนกติกาซ้ำเอง
// ============================================================================

export type Role =
  | "owner" | "sales" | "design" | "production" | "qc"
  | "warehouse" | "finance" | "affiliate";

export const ROLE_TH: Record<Role, string> = {
  owner: "เจ้าของ",
  sales: "ฝ่ายขาย",
  design: "ฝ่ายออกแบบ",
  production: "ฝ่ายผลิต",
  qc: "ฝ่ายตรวจคุณภาพ",
  warehouse: "คลังสินค้า",
  finance: "ฝ่ายบัญชี",
  affiliate: "พาร์ตเนอร์",
};

// ---------------------------------------------------------------- สถานะงาน
export type StatusDef = {
  code: string;
  th: string;
  owner: Role;
  phase: "ขาย" | "ออกแบบ" | "ผลิต" | "ส่งมอบ" | "ปิดงาน";
  /** ขั้นที่ลูกค้ามองเห็นบนหน้าติดตามงาน 1–7 */
  publicStep: number;
  hint: string;
};

export const STATUSES: StatusDef[] = [
  { code: "10", th: "รับเรื่องเข้ามา",        owner: "sales",      phase: "ขาย",     publicStep: 1, hint: "มีคนทักเข้ามา ยังไม่ได้คุยรายละเอียด" },
  { code: "15", th: "เก็บโจทย์ครบแล้ว",       owner: "sales",      phase: "ขาย",     publicStep: 1, hint: "รู้แล้วว่าใครใส่ ใส่ที่ไหน ใส่นานแค่ไหน" },
  { code: "20", th: "ทำใบเสนอราคา",          owner: "sales",      phase: "ขาย",     publicStep: 2, hint: "กำลังคิดราคาและกำหนดส่ง" },
  { code: "25", th: "ส่งใบเสนอราคาแล้ว",      owner: "sales",      phase: "ขาย",     publicStep: 2, hint: "รอลูกค้าตอบกลับ" },
  { code: "30", th: "ลูกค้าตกลงราคา",         owner: "sales",      phase: "ขาย",     publicStep: 2, hint: "ตกลงราคาแล้ว รอวางมัดจำ" },
  { code: "35", th: "รับมัดจำแล้ว",           owner: "finance",    phase: "ขาย",     publicStep: 3, hint: "เงินเข้าแล้ว เริ่มงานได้" },
  { code: "40", th: "ทำแบบร่าง",             owner: "design",     phase: "ออกแบบ",  publicStep: 3, hint: "ออกแบบภาพจำลองให้ลูกค้าดู" },
  { code: "45", th: "ส่งแบบให้ลูกค้าดู",       owner: "design",     phase: "ออกแบบ",  publicStep: 3, hint: "รอลูกค้าเคาะแบบ" },
  { code: "50", th: "ลูกค้าอนุมัติแบบ",        owner: "design",     phase: "ออกแบบ",  publicStep: 3, hint: "เคาะแบบแล้ว ห้ามแก้เพิ่มโดยไม่คิดเงิน" },
  { code: "55", th: "ทำตัวอย่างจริง",         owner: "production", phase: "ออกแบบ",  publicStep: 4, hint: "ตัดเย็บตัวอย่างก่อนผลิตจำนวนมาก" },
  { code: "60", th: "จองผ้าและเตรียมของ",     owner: "warehouse",  phase: "ผลิต",    publicStep: 4, hint: "กันผ้าไว้ให้งานนี้" },
  { code: "65", th: "เข้าไลน์ผลิต",           owner: "production", phase: "ผลิต",    publicStep: 5, hint: "ตัด เย็บ สกรีน ปัก" },
  { code: "70", th: "ผลิตเสร็จ",             owner: "production", phase: "ผลิต",    publicStep: 5, hint: "ครบจำนวน รอตรวจ" },
  { code: "75", th: "ตรวจคุณภาพ",           owner: "qc",         phase: "ผลิต",    publicStep: 6, hint: "สุ่มตรวจตามเกณฑ์" },
  { code: "78", th: "แก้งานที่ตรวจไม่ผ่าน",     owner: "production", phase: "ผลิต",    publicStep: 6, hint: "ซ่อมหรือทำใหม่เฉพาะตัวที่เสีย" },
  { code: "80", th: "แพ็กของ",              owner: "warehouse",  phase: "ส่งมอบ",  publicStep: 6, hint: "นับใส่กล่อง ติดใบปะหน้า" },
  { code: "82", th: "เก็บเงินส่วนที่เหลือ",      owner: "finance",    phase: "ส่งมอบ",  publicStep: 6, hint: "ต้องครบก่อนปล่อยของ" },
  { code: "85", th: "ส่งของแล้ว",            owner: "warehouse",  phase: "ส่งมอบ",  publicStep: 7, hint: "ออกจากคลัง มีเลขพัสดุ" },
  { code: "90", th: "ลูกค้ารับของแล้ว",       owner: "sales",      phase: "ส่งมอบ",  publicStep: 7, hint: "ยืนยันปลายทางแล้ว" },
  { code: "92", th: "เก็บความเห็นลูกค้า",      owner: "sales",      phase: "ปิดงาน",  publicStep: 7, hint: "ถามความพอใจและขอรูปใช้งานจริง" },
  { code: "95", th: "เคลมหรือแก้หลังส่ง",     owner: "qc",         phase: "ปิดงาน",  publicStep: 7, hint: "มีปัญหาหลังรับของ" },
  { code: "97", th: "พักงานไว้ก่อน",          owner: "sales",      phase: "ปิดงาน",  publicStep: 7, hint: "ติดปัญหา รอลูกค้าหรือรอของ" },
  { code: "98", th: "ยกเลิกงาน",             owner: "sales",      phase: "ปิดงาน",  publicStep: 7, hint: "จบแบบไม่ได้ส่งของ" },
  { code: "99", th: "ปิดงานเรียบร้อย",        owner: "owner",      phase: "ปิดงาน",  publicStep: 7, hint: "ครบทุกอย่าง เก็บเงินครบ" },
];

export const STATUS_MAP: Record<string, StatusDef> =
  Object.fromEntries(STATUSES.map((s) => [s.code, s]));

export function statusTh(code: string | null | undefined): string {
  return STATUS_MAP[code ?? ""]?.th ?? code ?? "—";
}

export function statusPhase(code: string | null | undefined): string {
  return STATUS_MAP[code ?? ""]?.phase ?? "—";
}

export function publicStep(code: string | null | undefined): number {
  return STATUS_MAP[code ?? ""]?.publicStep ?? 1;
}

/** งานจบแล้วหรือยัง */
export function isClosed(code: string | null | undefined): boolean {
  return code === "98" || code === "99";
}

export function isTrouble(code: string | null | undefined): boolean {
  return code === "78" || code === "95" || code === "97" || code === "98";
}

// ---------------------------------------------------------------- ขั้นที่ลูกค้าเห็น
export const PUBLIC_STEPS = [
  { step: 1, th: "รับเรื่อง",       hint: "เราได้รับโจทย์ของคุณแล้ว" },
  { step: 2, th: "เสนอราคา",       hint: "คิดราคาและกำหนดส่งให้" },
  { step: 3, th: "ออกแบบ",        hint: "ทำภาพจำลองให้ดูก่อนผลิต" },
  { step: 4, th: "เตรียมผ้า",      hint: "จองผ้าและทำตัวอย่าง" },
  { step: 5, th: "ผลิต",          hint: "ตัด เย็บ สกรีน ปัก" },
  { step: 6, th: "ตรวจและแพ็ก",   hint: "ตรวจคุณภาพแล้วแพ็กใส่กล่อง" },
  { step: 7, th: "ส่งมอบ",        hint: "ส่งถึงมือคุณ" },
] as const;

// ---------------------------------------------------------------- ประตูตรวจแปดบาน
export type Gate = {
  id: "G1" | "G2" | "G3" | "G4" | "G5" | "G6" | "G7" | "G8";
  th: string;
  /** ต้องผ่านประตูนี้ก่อนจะเข้าสถานะเหล่านี้ */
  before: string[];
  why: string;
  /** ข้ามได้ไหมถ้าเจ้าของอนุมัติ */
  overridable: boolean;
};

export const GATES: Gate[] = [
  { id: "G1", th: "โจทย์ครบสามข้อ",       before: ["20"],
    why: "ต้องรู้ว่าใครใส่ ใส่ที่ไหน ใส่นานแค่ไหน ไม่งั้นเลือกผ้าผิด", overridable: true },
  { id: "G2", th: "ลูกค้ายืนยันเป็นลายลักษณ์", before: ["35"],
    why: "ต้องมีหลักฐานการตกลงราคา กันเถียงกันทีหลัง", overridable: true },
  { id: "G3", th: "รับมัดจำแล้ว",          before: ["40"],
    why: "ไม่เริ่มออกแบบก่อนได้มัดจำ", overridable: true },
  { id: "G4", th: "ลูกค้าเคาะแบบแล้ว",      before: ["55", "60"],
    why: "ตัดผ้าแล้วแก้แบบไม่ได้", overridable: true },
  { id: "G5", th: "ผ้าพร้อมและจองแล้ว",     before: ["65"],
    why: "เข้าไลน์แล้วผ้าขาดจะค้างทั้งไลน์", overridable: true },
  { id: "G6", th: "ตรวจคุณภาพผ่าน",        before: ["80"],
    why: "ห้ามแพ็กของที่ยังไม่ตรวจ", overridable: false },
  { id: "G7", th: "เก็บเงินครบแล้ว",        before: ["85"],
    why: "ไม่ปล่อยของก่อนได้เงินครบ", overridable: true },
  { id: "G8", th: "มีหลักฐานการส่ง",        before: ["90"],
    why: "ต้องมีเลขพัสดุหรือรูปตอนส่ง", overridable: false },
];

export const GATE_MAP: Record<string, Gate> =
  Object.fromEntries(GATES.map((g) => [g.id, g]));

/** ประตูที่ขวางอยู่ตรงหน้า ถ้าจะย้ายจากสถานะปัจจุบันไปสถานะใหม่ */
export function gateFor(toStatus: string): Gate | null {
  return GATES.find((g) => g.before.includes(toStatus)) ?? null;
}

// ---------------------------------------------------------------- ทางเดินของสถานะ
const FLOW: Record<string, string[]> = {
  "10": ["15", "97", "98"],
  "15": ["20", "97", "98"],
  "20": ["25", "97", "98"],
  "25": ["30", "20", "97", "98"],
  "30": ["35", "97", "98"],
  "35": ["40", "97", "98"],
  "40": ["45", "97", "98"],
  "45": ["50", "40", "97", "98"],
  "50": ["55", "60", "97", "98"],
  "55": ["60", "40", "97", "98"],
  "60": ["65", "97", "98"],
  "65": ["70", "97", "98"],
  "70": ["75", "97", "98"],
  "75": ["80", "78", "97", "98"],
  "78": ["75", "97", "98"],
  "80": ["82", "85", "97", "98"],
  "82": ["85", "97", "98"],
  "85": ["90", "95", "97"],
  "90": ["92", "95", "97"],
  "92": ["99", "95"],
  "95": ["92", "99", "97"],
  "97": ["10", "20", "40", "60", "65", "80", "98"],
  "98": [],
  "99": [],
};

export function nextStatuses(from: string): StatusDef[] {
  return (FLOW[from] ?? []).map((c) => STATUS_MAP[c]).filter(Boolean);
}

export function canMove(from: string, to: string): boolean {
  return (FLOW[from] ?? []).includes(to);
}

// ---------------------------------------------------------------- กลุ่มผ้าตามนโยบายสต็อก
// หมายเหตุ  รหัส A–D ตรงนี้คือกลุ่มนโยบายสต็อก ไม่ใช่เกรดผ้าในตารางราคา
export const FABRIC_GROUPS = [
  { code: "A", th: "พรีเมียม สำหรับแบรนด์",   policy: "สต็อกลอย",        lead: "≤ 3 ชม." },
  { code: "B", th: "ผ้าผสม ระบายอากาศ",     policy: "สต็อกน้อย",       lead: "1–3 วัน" },
  { code: "C", th: "อีเวนต์ / เสื้อแจก",        policy: "สต็อกลอย",        lead: "≤ 3 ชม." },
  { code: "D", th: "ต้องผ่านกระบวนการเพิ่ม",   policy: "สต็อกจริง เข้มงวด", lead: "1–2 สัปดาห์" },
] as const;

export const FABRIC_GROUP_MAP: Record<string, (typeof FABRIC_GROUPS)[number]> =
  Object.fromEntries(FABRIC_GROUPS.map((g) => [g.code, g])) as never;

export const SIZES = ["S", "M", "L", "XL", "2XL", "3XL"] as const;
export type Size = (typeof SIZES)[number];

/** เรียงไซส์ให้ถูกลำดับเสมอ ไม่ใช่เรียงตามตัวอักษร */
export function sizeRank(s: string): number {
  const i = (SIZES as readonly string[]).indexOf(s);
  return i < 0 ? 99 : i;
}

// ---------------------------------------------------------------- ประเภทการเคลื่อนไหวสต็อก
export const MOVE_TYPES = [
  { code: "รับเข้า",     sign: +1, hint: "ของเข้าคลัง" },
  { code: "จอง",        sign: 0,  hint: "กันไว้ให้งาน ยังไม่ตัดออก" },
  { code: "ตัดจ่าย",     sign: -1, hint: "เบิกออกไปผลิตหรือส่ง" },
  { code: "คืน",        sign: +1, hint: "เบิกเกินแล้วคืนคลัง" },
  { code: "ปรับปรุง",    sign: 0,  hint: "ปรับตามผลนับจริง" },
  { code: "ตัดของเสีย",  sign: -1, hint: "ผ้าเสีย ตัดทิ้งจากยอด" },
] as const;

// ---------------------------------------------------------------- เรื่องที่ต้องขออนุมัติ
export const APPROVAL_KINDS = [
  { kind: "credit_extend", th: "เลื่อนกำหนดชำระ / ขอเครดิต", target: "invoice",
    hint: "ลูกค้าขอจ่ายช้ากว่ากำหนดเดิม หรือขอเครดิตยาวกว่าเพดาน" },
  { kind: "ship_unpaid",   th: "ส่งของก่อนชำระครบ",        target: "job",
    hint: "ปล่อยของทั้งที่ยังเก็บเงินไม่ครบ" },
  { kind: "discount_over", th: "ลดราคาเกินเพดาน",         target: "quotation",
    hint: "ลดมากกว่าที่ฝ่ายขายลดได้เอง" },
  { kind: "gate_skip",     th: "ข้ามประตูตรวจ",            target: "job",
    hint: "ข้ามเงื่อนไขที่ระบบตั้งไว้เพื่อความเร็ว" },
  { kind: "job_cancel",    th: "ยกเลิกงาน",               target: "job",
    hint: "ปิดงานโดยไม่ส่งของ" },
  { kind: "budget_over",   th: "ซื้อเกินงบ",               target: "purchase_order",
    hint: "ใบสั่งซื้อยอดเกินเพดานที่ตั้งไว้" },
] as const;

export type ApprovalKind = (typeof APPROVAL_KINDS)[number]["kind"];

export const APPROVAL_KIND_MAP: Record<string, (typeof APPROVAL_KINDS)[number]> =
  Object.fromEntries(APPROVAL_KINDS.map((k) => [k.kind, k])) as never;

export function approvalKindTh(k: string | null | undefined): string {
  return APPROVAL_KIND_MAP[k ?? ""]?.th ?? k ?? "—";
}

export const APPROVAL_STATUS_TH: Record<string, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
  used: "ใช้แล้ว",
  expired: "หมดอายุ",
  cancelled: "ถอนเรื่อง",
};

// ---------------------------------------------------------------- หน่วยธุรกิจ
export const BUS = [
  { code: "BU1", th: "งานองค์กรและยูนิฟอร์ม" },
  { code: "BU2", th: "งานอีเวนต์และเสื้อแจก" },
  { code: "BU3", th: "แบรนด์ลูกค้า" },
  { code: "BU4", th: "งานด่วนหน้าร้าน" },
] as const;
