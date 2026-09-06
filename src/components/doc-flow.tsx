import Link from "next/link";
import { money, num } from "@/lib/format";

// ============================================================================
// สายเอกสาร
//
// เอกสารในธุรกิจนี้ไม่ได้อยู่เดี่ยว ๆ มันต่อกันเป็นสาย
//   ใบเสนอราคา → ใบงาน → ใบวางบิล → รับเงิน → ใบเสร็จ
// ทุกใบเกิดจากใบก่อนหน้า ถ้าใบไหนขาด แปลว่ามีงานค้างอยู่ตรงนั้น
//
// หน้าจอนี้เลยไม่ได้แค่นับจำนวน แต่บอกด้วยว่า "ตอนนี้ค้างอยู่กี่ใบ ที่ขั้นไหน"
// เพราะเงินที่ยังไม่เข้าบัญชี มักไม่ได้หายไปไหน แค่ค้างอยู่ที่ขั้นใดขั้นหนึ่ง
// ============================================================================

export type FlowStage = {
  /** ลำดับที่แสดงบนหัวการ์ด */
  step: number;
  /** ชื่อเอกสารภาษาไทย */
  th: string;
  /** ตัวย่อที่ใช้เป็นเลขที่เอกสาร เช่น QT INV RC */
  abbr: string;
  /** จำนวนใบที่ออกแล้วทั้งหมด */
  count: number;
  /** ยอดเงินรวมของขั้นนี้ ใส่ null ถ้าขั้นนี้ไม่มีเรื่องเงิน */
  amount: number | null;
  /** ลิงก์ไปหน้ารายการเต็มของขั้นนี้ */
  href: string;
  /** อธิบายว่าขั้นนี้ทำอะไร */
  what: string;
  /** สิ่งที่ค้างอยู่ตรงนี้ ถ้าไม่มีให้ใส่ null */
  stuck: { n: number; label: string; href: string; bad?: boolean } | null;
};

function StageCard({ s }: { s: FlowStage }) {
  return (
    <div className="card flex h-full flex-col px-4 py-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide2 text-ink/35">
          ขั้นที่ {s.step}
        </span>
        <span className="tnum text-[10px] uppercase tracking-wide2 text-ink/35">{s.abbr}</span>
      </div>

      <Link href={s.href} className="text-[14px] font-medium tracking-display hover:underline underline-offset-4">
        {s.th}
      </Link>

      <p className="mt-1 text-[11px] leading-relaxed text-ink/45">{s.what}</p>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="tnum text-[24px] font-medium leading-none">{num(s.count)}</span>
        <span className="text-[11px] text-ink/40">ใบ</span>
      </div>

      {s.amount !== null && (
        <p className="tnum mt-1 text-[12px] text-ink/55">{money(s.amount, 0)} บาท</p>
      )}

      <div className="mt-auto pt-3">
        {s.stuck && s.stuck.n > 0 ? (
          <Link
            href={s.stuck.href}
            className={`block border-l-2 py-1 pl-2 text-[11px] leading-snug hover:bg-bone-200 ${
              s.stuck.bad ? "border-signal-bad text-signal-bad" : "border-signal-warn text-ink/70"
            }`}
          >
            <span className="tnum font-medium">{num(s.stuck.n)}</span> {s.stuck.label}
          </Link>
        ) : (
          <p className="border-l-2 border-signal-ok py-1 pl-2 text-[11px] text-ink/40">
            ไม่มีค้าง
          </p>
        )}
      </div>
    </div>
  );
}

/** ลูกศรคั่นระหว่างขั้น จอกว้างชี้ขวา จอแคบชี้ลง */
function Arrow() {
  return (
    <div className="flex items-center justify-center text-ink/25" aria-hidden>
      <span className="hidden text-[16px] xl:inline">→</span>
      <span className="text-[16px] xl:hidden">↓</span>
    </div>
  );
}

export function DocFlow({ stages }: { stages: FlowStage[] }) {
  return (
    <div className="grid grid-cols-1 gap-2 xl:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] xl:items-stretch">
      {stages.map((s, i) => (
        <div key={s.abbr} className="contents">
          <StageCard s={s} />
          {i < stages.length - 1 && <Arrow />}
        </div>
      ))}
    </div>
  );
}
