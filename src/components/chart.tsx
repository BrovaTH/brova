import type { ReactNode } from "react";
import { money, num } from "@/lib/format";

// ============================================================================
// กราฟทั้งหมดในไฟล์นี้วาดด้วย SVG ล้วน ไม่พึ่งไลบรารีนอก
//
// เหตุผล  ไลบรารีกราฟส่วนใหญ่ต้องรันฝั่งเบราว์เซอร์ ทำให้หน้าโหลดช้าลงและ
// พิมพ์ออกกระดาษไม่ได้เรื่อง  ส่วน SVG ที่เรนเดอร์มาจากเซิร์ฟเวอร์เลย
// เปิดปุ๊บเห็นปั๊บ พิมพ์ออกมาก็คมเท่าหน้าจอ และไม่มีอะไรให้พังตอนอัปเดต
//
// ทุกกราฟใช้สีชุดเดียวกับทั้งระบบ และมีตัวเลขกำกับเสมอ
// เพราะกราฟมีไว้ให้เห็นรูปทรง ส่วนตัวเลขคือสิ่งที่เอาไปตัดสินใจ
// ============================================================================

/** สีของหน่วยธุรกิจ ไล่จากเข้มไปอ่อน อ่านออกแม้พิมพ์ขาวดำ */
export const BU_FILL: Record<string, string> = {
  BU1: "#0A0A0A",
  BU2: "#4A4845",
  BU3: "#8A8681",
  BU4: "#C4C0B9",
};

function fmtShort(v: number): string {
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + " ล้าน";
  if (Math.abs(v) >= 1_000) return Math.round(v / 1_000) + "k";
  return String(Math.round(v));
}

// ---------------------------------------------------------------- กรอบกราฟ
export function ChartFrame({
  title, hint, legend, children,
}: {
  title: string;
  hint?: string;
  legend?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="card px-4 py-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-medium tracking-display">{title}</p>
          {hint && <p className="mt-0.5 text-[11px] leading-relaxed text-ink/45">{hint}</p>}
        </div>
        {legend}
      </div>
      {children}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; fill: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-[11px] text-ink/55">
          <span className="inline-block h-2.5 w-2.5" style={{ background: i.fill }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- แท่งซ้อนรายเดือน
export type StackPoint = { label: string; parts: { key: string; value: number }[] };

export function StackedBars({
  data, fills, height = 190,
}: {
  data: StackPoint[];
  fills: Record<string, string>;
  height?: number;
}) {
  const totals = data.map((d) => d.parts.reduce((a, p) => a + p.value, 0));
  const max = Math.max(1, ...totals);
  const cols = Math.max(1, data.length);

  // วาดในระบบพิกัดกว้าง 600 หน่วย แล้วค่อยย่อขยายทั้งภาพให้พอดีกล่อง
  //
  // สำคัญตรงที่ต้องคงสัดส่วนไว้  ถ้าปล่อยให้ยืดตามความกว้างกล่อง
  // ตัวหนังสือในกราฟจะถูกยืดไปด้วยจนอ่านไม่ออก
  const W = 600;

  // เว้นที่ด้านบนไว้ใส่ตัวเลข และด้านล่างไว้ใส่ชื่อเดือน
  const padTop = 18;
  const padBottom = 26;
  const plot = height - padTop - padBottom;
  const slot = W / cols;
  const barW = Math.min(64, slot * 0.5);

  if (totals.every((t) => t === 0)) {
    return (
      <p className="py-12 text-center text-[12px] text-ink/40">
        ยังไม่มียอดขายในช่วงนี้ กราฟจะขึ้นเองเมื่อมีงานปิดการขาย
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="xMidYMid meet"
           className="w-full min-w-[420px]" role="img">
        {/* เส้นฐาน */}
        <line x1="0" x2={W} y1={padTop + plot} y2={padTop + plot}
              stroke="#DEDBD6" strokeWidth="1" />
        {data.map((d, i) => {
          const cx = slot * i + slot / 2;
          const x = cx - barW / 2;
          const total = totals[i];
          let y = padTop + plot;
          return (
            <g key={d.label}>
              {d.parts.map((p) => {
                const h = total === 0 ? 0 : (p.value / max) * plot;
                y -= h;
                return h <= 0 ? null : (
                  <rect key={p.key} x={x} y={y} width={barW} height={h}
                        fill={fills[p.key] ?? "#8A8681"} />
                );
              })}
              {total > 0 && (
                <text x={cx} y={padTop + plot - (total / max) * plot - 6}
                      textAnchor="middle" fontSize="13" fill="#4A4845"
                      style={{ fontVariantNumeric: "tabular-nums" }}>
                  {fmtShort(total)}
                </text>
              )}
              <text x={cx} y={height - 9} textAnchor="middle" fontSize="12" fill="#8A8681">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------- กรวยการขาย
export type FunnelStep = { label: string; value: number; hint?: string };

export function Funnel({ steps }: { steps: FunnelStep[] }) {
  const top = Math.max(1, steps[0]?.value ?? 1);
  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const w = Math.max(3, (s.value / top) * 100);
        const prev = i === 0 ? null : steps[i - 1].value;
        const drop = prev && prev > 0 ? Math.round(((prev - s.value) / prev) * 100) : null;
        return (
          <div key={s.label}>
            <div className="mb-0.5 flex items-baseline justify-between gap-3">
              <span className="text-[12px]">{s.label}</span>
              <span className="tnum text-[12px] font-medium">{num(s.value)}</span>
            </div>
            <div className="h-5 w-full bg-bone-300">
              <div className="h-full bg-ink" style={{ width: `${w}%` }} />
            </div>
            <p className="mt-0.5 text-[10px] text-ink/40">
              {s.hint}
              {drop !== null && drop > 0 && (
                <span className="ml-1 text-signal-warn">หลุดไป {drop}%</span>
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- แท่งแนวนอน
export function HBars({
  rows, unit = "บาท",
}: {
  rows: { label: string; value: number }[];
  unit?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) {
    return <p className="py-10 text-center text-[12px] text-ink/40">ยังไม่มีข้อมูล</p>;
  }
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[100px_1fr_auto] items-center gap-3">
          <span className="truncate text-[12px] text-ink/70">{r.label}</span>
          <span className="h-3 w-full bg-bone-300">
            <span className="block h-full bg-ink" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="tnum text-[12px]">
            {unit === "บาท" ? money(r.value, 0) : num(r.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- ตัวชี้วัดเทียบเป้า
export type Kpi = {
  label: string;
  /** ค่าที่ทำได้จริง */
  value: number;
  /** เป้าที่ตั้งไว้ */
  target: number;
  /** true เมื่อยิ่งมากยิ่งดี  false เมื่อยิ่งน้อยยิ่งดี เช่นของเสีย */
  higherBetter: boolean;
  unit?: string;
  hint?: string;
};

export function KpiTable({ rows }: { rows: Kpi[] }) {
  return (
    <div className="card divide-y divide-line-soft">
      {rows.map((k) => {
        const pass = k.higherBetter ? k.value >= k.target : k.value <= k.target;
        // ความยาวแถบเทียบกับเป้า ตันที่ 100% เพื่อให้ทุกแถวอ่านเทียบกันได้
        const pct = k.target === 0 ? 0 : Math.min(100, (k.value / k.target) * 100);
        return (
          <div key={k.label} className="px-4 py-3">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[12px]">{k.label}</span>
              <span className="flex items-baseline gap-2">
                <span className={`tnum text-[15px] font-medium ${pass ? "" : "text-signal-bad"}`}>
                  {money(k.value, 1)}
                  {k.unit && <span className="ml-0.5 text-[11px] font-light">{k.unit}</span>}
                </span>
                <span className="text-[11px] text-ink/40">
                  เป้า {k.higherBetter ? "ไม่ต่ำกว่า" : "ไม่เกิน"} {money(k.target, 1)}{k.unit}
                </span>
              </span>
            </div>
            <div className="h-1.5 w-full bg-bone-300">
              <div
                className={`h-full ${pass ? "bg-signal-ok" : "bg-signal-bad"}`}
                style={{ width: `${k.higherBetter ? pct : Math.min(100, pct)}%` }}
              />
            </div>
            {k.hint && <p className="mt-1 text-[10px] text-ink/40">{k.hint}</p>}
          </div>
        );
      })}
    </div>
  );
}
