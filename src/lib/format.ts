// ตัวช่วยจัดรูปแบบตัวเลข วันที่ และข้อความ ใช้ร่วมกันทั้งระบบ

export const TZ = "Asia/Bangkok";

/** 1234.5 → "1,234.50" */
export function money(n: number | null | undefined, dp = 2): string {
  const v = Number(n ?? 0);
  return v.toLocaleString("th-TH", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

/** 1234.5 → "1,235" ใช้กับจำนวนชิ้น */
export function num(n: number | null | undefined): string {
  return Math.round(Number(n ?? 0)).toLocaleString("th-TH");
}

/** ตัดทศนิยมที่ลงท้ายด้วยศูนย์ออก 80.00 → "80" แต่ 80.50 → "80.50" */
export function priceTag(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return Number.isInteger(v) ? num(v) : money(v);
}

export function pct(n: number | null | undefined, dp = 0): string {
  return `${Number(n ?? 0).toFixed(dp)}%`;
}

/** ปีพุทธศักราช */
export function beYear(d: Date): number {
  return d.getFullYear() + 543;
}

const TH_MONTH = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

const TH_MONTH_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "12 ส.ค. 2569" */
export function thDate(v: string | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return "—";
  return `${d.getDate()} ${TH_MONTH[d.getMonth()]} ${beYear(d)}`;
}

/** "12 สิงหาคม 2569" ใช้บนหัวเอกสาร */
export function thDateFull(v: string | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return "—";
  return `${d.getDate()} ${TH_MONTH_FULL[d.getMonth()]} ${beYear(d)}`;
}

/** "12 ส.ค. 2569 14:30" */
export function thDateTime(v: string | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${thDate(d)} ${hh}:${mm}`;
}

/** "2026-08-12" สำหรับ input type=date และการเทียบวัน */
export function toISODate(v: string | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDaysISO(v: string | Date, days: number): string {
  const d = toDate(v) ?? new Date();
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** ต่างกันกี่วัน บวกคือ a มาทีหลัง */
export function daysBetween(a: string | Date, b: string | Date): number {
  const x = toDate(a), y = toDate(b);
  if (!x || !y) return 0;
  const ms = new Date(toISODate(x)).getTime() - new Date(toISODate(y)).getTime();
  return Math.round(ms / 86400000);
}

/** "3 ชั่วโมงที่แล้ว" */
export function ago(v: string | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return "—";
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "เมื่อครู่";
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชั่วโมงที่แล้ว`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} วันที่แล้ว`;
  return thDate(d);
}

// ---------------------------------------------------------------- จำนวนเงินเป็นตัวอักษร
const DIGIT = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const PLACE = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];

function readInteger(sRaw: string): string {
  let s = sRaw.replace(/^0+/, "");
  if (!s) return "ศูนย์";

  // เกินเจ็ดหลัก อ่านส่วนล้านก่อนแล้วต่อท้ายด้วยคำว่าล้าน
  if (s.length > 7) {
    const head = s.slice(0, s.length - 6);
    const tail = s.slice(s.length - 6);
    return readInteger(head) + "ล้าน" + (tail === "000000" ? "" : readInteger(tail));
  }

  let out = "";
  const n = s.length;
  for (let i = 0; i < n; i++) {
    const d = Number(s[i]);
    const place = n - i - 1;
    if (d === 0) continue;
    if (place === 0 && d === 1 && n > 1) out += "เอ็ด";
    else if (place === 1 && d === 1) out += "";
    else if (place === 1 && d === 2) out += "ยี่";
    else out += DIGIT[d];
    out += PLACE[place];
  }
  return out;
}

/** 24007.50 → "สองหมื่นสี่พันเจ็ดบาทห้าสิบสตางค์" */
export function bahtText(amount: number | null | undefined): string {
  let v = Number(amount ?? 0);
  const neg = v < 0;
  v = Math.abs(v);
  const rounded = Math.round(v * 100) / 100;
  const baht = Math.floor(rounded);
  const satang = Math.round((rounded - baht) * 100);

  let out = readInteger(String(baht)) + "บาท";
  out += satang === 0 ? "ถ้วน" : readInteger(String(satang)) + "สตางค์";
  return (neg ? "ลบ" : "") + out;
}

/** ตัดข้อความยาวให้พอดีบรรทัด */
export function clip(s: string | null | undefined, n = 60): string {
  const t = (s ?? "").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

/** ชื่อย่อสำหรับวงกลมรูปคน */
export function initials(name: string | null | undefined): string {
  const t = (name ?? "").trim();
  if (!t) return "?";
  return t.slice(0, 2);
}
