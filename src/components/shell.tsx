"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "./logo";
import { ManualButton } from "./manual";

export type NavUser = { name: string; role: string; roleTh: string };

// เมนูแถบข้าง
//
// จัดเป็นสี่หมวดตามลำดับที่งานเดินจริง คือรับงาน เก็บเงิน จัดของ แล้วส่ง
// ไม่ได้เรียงตามตัวอักษร เพราะคนใช้จำจากขั้นตอนงานมากกว่าจำจากชื่อ
//
// จอกว้าง แถบยืนค้างอยู่ตลอด  จอแคบ ซ่อนไว้แล้วเลื่อนออกมาเมื่อกดปุ่มเมนู
const GROUPS = [
  {
    th: "งาน",
    items: [
      { href: "/", th: "ภาพรวม" },
      { href: "/jobs", th: "ใบงาน" },
      { href: "/approvals", th: "ขออนุมัติ" },
    ],
  },
  {
    th: "เงินและเอกสาร",
    items: [
      { href: "/accounting", th: "การเงิน" },
      { href: "/docs", th: "เอกสาร" },
    ],
  },
  {
    th: "ของในคลัง",
    items: [
      { href: "/stock", th: "คลัง" },
      { href: "/purchasing", th: "สั่งซื้อ" },
      { href: "/fabrics", th: "คลังผ้า" },
    ],
  },
  {
    th: "ลูกค้าและจัดส่ง",
    items: [
      { href: "/customers", th: "ลูกค้า" },
      { href: "/shipments", th: "จัดส่ง" },
    ],
  },
  {
    th: "ระบบ",
    items: [{ href: "/settings", th: "ตั้งค่า" }],
  },
] as const;

export function Shell({
  user, pending, children,
}: {
  user: NavUser;
  // จำนวนเรื่องที่รอเจ้าของอนุมัติ
  pending: number;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  // เปลี่ยนหน้าแล้วปิดแถบทิ้งเอง ไม่ต้องให้ผู้ใช้กดปิดซ้ำ
  useEffect(() => { setOpen(false); }, [path]);

  const active = (href: string) =>
    href === "/" ? path === "/" : path === href || path.startsWith(href + "/");

  const nav = (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      {GROUPS.map((g) => (
        <div key={g.th} className="mb-5 last:mb-0">
          <p className="mb-1.5 px-2 text-[10px] uppercase tracking-wide2 text-ink/35">
            {g.th}
          </p>
          {g.items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center justify-between border-l-2 px-2 py-1.5 text-[13px] transition-colors ${
                active(n.href)
                  ? "border-ink bg-ink text-bone"
                  : "border-transparent text-ink/65 hover:border-line-hard hover:bg-bone-200 hover:text-ink"
              }`}
            >
              <span>{n.th}</span>
              {n.href === "/approvals" && pending > 0 && (
                <span
                  className={`tnum px-1.5 text-[10px] leading-5 ${
                    active(n.href) ? "bg-bone text-ink" : "bg-signal-bad text-white"
                  }`}
                >
                  {pending}
                </span>
              )}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );

  const foot = (
    <div className="border-t border-line px-3 py-3">
      <div className="mb-2 px-2 leading-tight">
        <p className="truncate text-[12px]">{user.name}</p>
        <p className="text-[10px] uppercase tracking-wide2 text-ink/40">{user.roleTh}</p>
      </div>
      <div className="flex gap-2">
        <ManualButton label="คู่มือ" className="flex-1 px-2 py-1.5 text-[11px]" />
        <form action="/auth/signout" method="post" className="flex-1">
          <button className="btn-ghost w-full px-2 py-1.5 text-[11px]">ออก</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-[220px]">
      {/* ---------------------------------------------------------- แถบข้าง จอกว้าง */}
      <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-[220px] flex-col border-r border-line bg-bone lg:flex">
        <div className="border-b border-line px-4 py-4">
          <Link href="/" aria-label="ภาพรวม">
            <Wordmark sub="ระบบหลังบ้าน" />
          </Link>
        </div>
        {nav}
        {foot}
      </aside>

      {/* ---------------------------------------------------------- แถบบน จอแคบ */}
      <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-bone/95 px-4 py-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-ghost px-3 py-1.5 text-[11px]"
          aria-label="เปิดเมนู"
        >
          เมนู
          {pending > 0 && (
            <span className="tnum ml-1 bg-signal-bad px-1 text-[10px] text-white">{pending}</span>
          )}
        </button>
        <Link href="/" className="mx-auto">
          <Wordmark sub="ระบบหลังบ้าน" />
        </Link>
        <span className="w-[68px]" aria-hidden />
      </header>

      {/* ---------------------------------------------------------- แถบข้างแบบเลื่อนออก จอแคบ */}
      {open && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="ปิดเมนู"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full bg-ink/40"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[260px] flex-col border-r border-line bg-bone">
            <div className="flex items-center justify-between border-b border-line px-4 py-4">
              <Wordmark sub="ระบบหลังบ้าน" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-ghost px-2 py-1 text-[11px]"
              >
                ปิด
              </button>
            </div>
            {nav}
            {foot}
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-[1400px] px-4 py-7 sm:px-6 sm:py-9">{children}</main>

      <footer className="no-print mx-auto max-w-[1400px] border-t border-line px-4 py-6 text-[11px] text-ink/35 sm:px-6">
        BROVA · ระบบหลังบ้าน · ข้อมูลทุกอย่างในหน้านี้อยู่ในฐานข้อมูลของคุณเอง
      </footer>
    </div>
  );
}
