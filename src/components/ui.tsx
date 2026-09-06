import Link from "next/link";
import type { ReactNode } from "react";
import { money, num } from "@/lib/format";

// ---------------------------------------------------------------- หัวหน้าจอ
export function PageHead({
  eyebrow, title, lead, right,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  right?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[11px] uppercase tracking-wide2 text-ink/40">{eyebrow}</p>
        )}
        <h1 className="text-[26px] font-medium leading-tight tracking-display">{title}</h1>
        {lead && <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink/55">{lead}</p>}
      </div>
      {right && <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div>}
    </header>
  );
}

// ---------------------------------------------------------------- ป้ายสถานะ
type Tone = "ok" | "warn" | "bad" | "info" | "mute";

const TONE: Record<Tone, string> = {
  ok:   "bg-signal-okbg text-signal-ok border-signal-ok/25",
  warn: "bg-signal-warnbg text-signal-warn border-signal-warn/25",
  bad:  "bg-signal-badbg text-signal-bad border-signal-bad/25",
  info: "bg-signal-infobg text-signal-info border-signal-info/25",
  mute: "bg-bone-200 text-ink/55 border-line",
};

export function Tag({
  children, tone = "mute", className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 text-[11px] leading-5 ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** เลือกสีป้ายจากสถานะงาน */
export function statusTone(code: string | null | undefined): Tone {
  if (code === "99") return "ok";
  if (code === "98") return "mute";
  if (code === "97" || code === "78" || code === "95") return "bad";
  if (code === "85" || code === "90" || code === "92") return "info";
  return "warn";
}

// ---------------------------------------------------------------- กล่องตัวเลข
export function Stat({
  label, value, unit, hint, tone,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="card px-4 py-3.5">
      <p className="text-[11px] uppercase tracking-wide2 text-ink/40">{label}</p>
      <p className="tnum mt-1 flex items-baseline gap-1 text-[24px] font-medium leading-none tracking-display">
        {value}
        {unit && <span className="text-[12px] font-light text-ink/45">{unit}</span>}
      </p>
      {hint && (
        <p className={`mt-1.5 text-[11px] ${tone === "bad" ? "text-signal-bad" : "text-ink/45"}`}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function Money({ value, dp = 2 }: { value: number | null | undefined; dp?: number }) {
  return <span className="tnum">{money(value, dp)}</span>;
}

export function Qty({ value }: { value: number | null | undefined }) {
  return <span className="tnum">{num(value)}</span>;
}

// ---------------------------------------------------------------- ตาราง
export function Table({ head, children, empty }: {
  head: ReactNode[];
  children: ReactNode;
  empty?: string;
}) {
  const rows = Array.isArray(children) ? children.flat() : children;
  const isEmpty = Array.isArray(rows) ? rows.length === 0 : !rows;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line bg-bone-200/60">
            {head.map((h, i) => (
              <th
                key={i}
                className="px-3 py-2.5 text-left text-[11px] font-normal uppercase tracking-wide2 text-ink/45 last:text-right"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isEmpty ? (
            <tr>
              <td colSpan={head.length} className="px-3 py-10 text-center text-[13px] text-ink/40">
                {empty ?? "ยังไม่มีข้อมูล"}
              </td>
            </tr>
          ) : (
            rows
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Tr({ children, href }: { children: ReactNode; href?: string }) {
  const cls = "border-b border-line-soft last:border-0 hover:bg-bone-200/50 transition-colors";
  if (!href) return <tr className={cls}>{children}</tr>;
  return <tr className={cls + " cursor-pointer"}>{children}</tr>;
}

export function Td({
  children, align = "left", className = "", colSpan,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  colSpan?: number;
}) {
  const a = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <td colSpan={colSpan} className={`px-3 py-2.5 align-top ${a} ${className}`}>
      {children}
    </td>
  );
}

// ---------------------------------------------------------------- ปุ่มลิงก์
export function LinkBtn({
  href, children, solid, className = "", target,
}: {
  href: string;
  children: ReactNode;
  solid?: boolean;
  className?: string;
  target?: string;
}) {
  return (
    <Link
      href={href}
      target={target}
      className={`${solid ? "btn-solid" : "btn-ghost"} ${className}`}
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------- กล่องข้อความ
export function Note({
  tone = "info", title, children,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={`border px-4 py-3 text-[13px] leading-relaxed ${TONE[tone]}`}>
      {title && <p className="mb-1 font-medium">{title}</p>}
      <div className="opacity-90">{children}</div>
    </div>
  );
}

export function Empty({ title, hint, action }: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="h-8 w-8 border border-line-hard" />
      <p className="text-[15px]">{title}</p>
      {hint && <p className="max-w-md text-[13px] leading-relaxed text-ink/50">{hint}</p>}
      {action}
    </div>
  );
}

// ---------------------------------------------------------------- ส่วนย่อยในหน้า
export function Section({
  title, hint, right, children, className = "",
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-9 ${className}`}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-medium tracking-display">{title}</h2>
          {hint && <p className="mt-0.5 text-[12px] text-ink/50">{hint}</p>}
        </div>
        {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
      </div>
      {children}
    </section>
  );
}

/** คู่ ป้าย/ค่า ใช้ในกล่องรายละเอียด */
export function KV({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line-soft py-2 last:border-0">
      <span className="shrink-0 text-[12px] text-ink/45">{k}</span>
      <span className={`text-right text-[13px] ${mono ? "tnum" : ""}`}>{v}</span>
    </div>
  );
}

// ---------------------------------------------------------------- แถบความคืบหน้า
export function Bar({ value, max, tone = "ok" }: { value: number; max: number; tone?: Tone }) {
  const p = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const fill =
    tone === "bad" ? "bg-signal-bad"
    : tone === "warn" ? "bg-signal-warn"
    : tone === "info" ? "bg-signal-info"
    : "bg-signal-ok";
  return (
    <div className="h-1.5 w-full bg-bone-300">
      <div className={`h-full ${fill}`} style={{ width: `${p}%` }} />
    </div>
  );
}
