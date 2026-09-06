"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "./logo";
import { ManualButton } from "./manual";

export type NavUser = { name: string; role: string; roleTh: string };

const NAV = [
  { href: "/", th: "ภาพรวม" },
  { href: "/jobs", th: "ใบงาน" },
  { href: "/approvals", th: "ขออนุมัติ" },
  { href: "/accounting", th: "การเงิน" },
  { href: "/docs", th: "เอกสาร" },
  { href: "/stock", th: "คลัง" },
  { href: "/purchasing", th: "สั่งซื้อ" },
  { href: "/fabrics", th: "คลังผ้า" },
  { href: "/customers", th: "ลูกค้า" },
  { href: "/shipments", th: "จัดส่ง" },
  { href: "/settings", th: "ตั้งค่า" },
] as const;

export function Shell({
  user, pending, children,
}: {
  user: NavUser;
  /** จำนวนเรื่องที่รอเจ้าของอนุมัติ */
  pending: number;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  const active = (href: string) =>
    href === "/" ? path === "/" : path === href || path.startsWith(href + "/");

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-40 border-b border-line bg-bone/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="shrink-0">
            <Wordmark />
          </Link>

          <nav className="ml-4 hidden flex-1 items-center gap-0.5 lg:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`relative border px-3 py-1.5 text-[12px] transition-colors ${
                  active(n.href)
                    ? "border-ink bg-ink text-bone"
                    : "border-transparent text-ink/60 hover:border-line hover:text-ink"
                }`}
              >
                {n.th}
                {n.href === "/approvals" && pending > 0 && (
                  <span
                    className={`tnum ml-1.5 inline-block px-1 text-[10px] ${
                      active(n.href) ? "bg-bone text-ink" : "bg-signal-bad text-white"
                    }`}
                  >
                    {pending}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-[12px]">{user.name}</p>
              <p className="text-[10px] uppercase tracking-wide2 text-ink/40">{user.roleTh}</p>
            </div>
            <ManualButton label="คู่มือ" className="px-3 py-1.5 text-[11px]" />
            <form action="/auth/signout" method="post">
              <button className="btn-ghost px-3 py-1.5 text-[11px]">ออก</button>
            </form>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="btn-ghost px-3 py-1.5 lg:hidden"
              aria-label="เมนู"
            >
              เมนู
            </button>
          </div>
        </div>

        {open && (
          <nav className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-3 lg:hidden">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className={`px-4 py-2.5 text-[13px] ${
                  active(n.href) ? "bg-ink text-bone" : "bg-bone text-ink/70"
                }`}
              >
                {n.th}
                {n.href === "/approvals" && pending > 0 && (
                  <span className="tnum ml-2 bg-signal-bad px-1 text-[10px] text-white">
                    {pending}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-7 sm:px-6 sm:py-9">{children}</main>

      <footer className="no-print mx-auto max-w-[1400px] border-t border-line px-4 py-6 text-[11px] text-ink/35 sm:px-6">
        BROVA · ระบบหลังบ้าน · ข้อมูลทุกอย่างในหน้านี้อยู่ในฐานข้อมูลของคุณเอง
      </footer>
    </div>
  );
}
