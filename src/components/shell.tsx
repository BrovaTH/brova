"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "./logo";
import { ManualButton } from "./manual";

export type NavUser = { name: string; role: string; roleTh: string };

// เมนูแถบข้าง
//
// จัดห้าหมวดตามลำดับที่งานเดินจริง คือ รับงาน ขาย ผลิต เก็บเงิน แล้วส่ง
// ไม่ได้เรียงตามตัวอักษร เพราะคนใช้จำจากขั้นตอนงานมากกว่าจำจากชื่อ
//
// พื้นแถบเป็นสีดำตัดกับพื้นหน้าจอสีกระดาษ ทำให้สายตาแยกออกทันทีว่า
// ตรงไหนคือที่เดินทาง ตรงไหนคือเนื้องาน และเวลาสั่งพิมพ์แถบนี้จะหายไปทั้งแถบ
//
// จอกว้าง แถบยืนค้างอยู่ตลอด  จอแคบ ซ่อนไว้แล้วเลื่อนออกมาเมื่อกดปุ่มเมนู
const GROUPS = [
  {
    th: "ภาพรวม",
    items: [
      { href: "/", th: "Dashboard" },
      { href: "/reports", th: "รายงาน" },
    ],
  },
  {
    th: "งานขาย",
    items: [
      { href: "/briefs", th: "บรีฟ / คำขอราคา" },
      { href: "/docs", th: "ร่างเอกสาร" },
      { href: "/quotations", th: "ใบเสนอราคา" },
      { href: "/customers", th: "ลูกค้า" },
    ],
  },
  {
    th: "งานผลิต",
    items: [
      { href: "/jobs", th: "งานทั้งหมด" },
      { href: "/production", th: "ผลิต / QC" },
      { href: "/stock", th: "สต็อกและ SKU" },
      { href: "/fabrics", th: "คลังผ้า" },
      { href: "/purchasing", th: "สั่งซื้อ" },
    ],
  },
  {
    th: "บัญชี",
    items: [
      { href: "/invoices", th: "ใบวางบิล" },
      { href: "/receipts", th: "ใบเสร็จรับเงิน" },
      { href: "/accounting", th: "การเงินภาพรวม" },
      { href: "/approvals", th: "ขออนุมัติ" },
    ],
  },
  {
    th: "ปลายทาง",
    items: [
      { href: "/shipments", th: "จัดส่ง" },
      { href: "/knowledge", th: "คลังความรู้" },
      { href: "/settings/company", th: "ตั้งค่าเอกสาร" },
      { href: "/settings", th: "ตั้งค่าระบบ" },
    ],
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

  /**
   * หน้าไหนกำลังเปิดอยู่
   *
   * ต้องเทียบแบบเป๊ะเมื่อเป็นหน้าที่ซ้อนกันอยู่ เช่น /settings กับ /settings/company
   * ไม่งั้นเปิดหน้าตั้งค่าเอกสารแล้วเมนูจะไฮไลต์สองอันพร้อมกัน
   */
  const active = (href: string) => {
    if (href === "/") return path === "/";
    if (href === "/settings") return path === "/settings";
    return path === href || path.startsWith(href + "/");
  };

  const nav = (
    <nav className="flex-1 overflow-y-auto px-3 py-5">
      {GROUPS.map((g) => (
        <div key={g.th} className="mb-5 last:mb-0">
          <p className="mb-1.5 px-2 text-[10px] tracking-wide2 text-bone/30">{g.th}</p>
          {g.items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center justify-between border-l-2 px-2.5 py-1.5 text-[13px] transition-colors ${
                active(n.href)
                  ? "border-bone bg-ink-700 text-bone"
                  : "border-transparent text-bone/60 hover:bg-ink-800 hover:text-bone"
              }`}
            >
              <span>{n.th}</span>
              {n.href === "/approvals" && pending > 0 && (
                <span className="tnum bg-signal-bad px-1.5 text-[10px] leading-5 text-white">
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
    <div className="border-t border-ink-700 px-3 py-3">
      <div className="mb-2 px-2 leading-tight">
        <p className="truncate text-[12px] text-bone">{user.name}</p>
        <p className="text-[10px] uppercase tracking-wide2 text-bone/35">{user.roleTh}</p>
      </div>
      <div className="flex gap-2">
        <ManualButton
          label="คู่มือ"
          className="flex-1 border border-bone/25 bg-transparent px-2 py-1.5 text-[11px] uppercase tracking-wide2 text-bone/80 no-underline transition-colors hover:border-bone hover:text-bone"
        />
        <form action="/auth/signout" method="post" className="flex-1">
          <button className="w-full border border-bone/25 px-2 py-1.5 text-[11px] uppercase tracking-wide2 text-bone/80 transition-colors hover:border-bone hover:text-bone">
            ออก
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-[220px]">
      {/* ---------------------------------------------------------- แถบข้าง จอกว้าง */}
      <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-[220px] flex-col bg-ink-900 lg:flex">
        <div className="border-b border-ink-700 px-4 py-5">
          <Link href="/" aria-label="Dashboard" className="text-bone">
            <Wordmark invert sub="ระบบหลังบ้าน" />
          </Link>
        </div>
        {nav}
        {foot}
      </aside>

      {/* ---------------------------------------------------------- แถบบน จอแคบ */}
      <header className="no-print sticky top-0 z-30 flex items-center gap-3 bg-ink-900 px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border border-bone/25 px-3 py-1.5 text-[11px] uppercase tracking-wide2 text-bone/80"
          aria-label="เปิดเมนู"
        >
          เมนู
          {pending > 0 && (
            <span className="tnum ml-1 bg-signal-bad px-1 text-[10px] text-white">{pending}</span>
          )}
        </button>
        <Link href="/" className="mx-auto text-bone">
          <Wordmark invert sub="ระบบหลังบ้าน" />
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
            className="absolute inset-0 h-full w-full bg-ink/60"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[260px] flex-col bg-ink-900">
            <div className="flex items-center justify-between border-b border-ink-700 px-4 py-5">
              <span className="text-bone">
                <Wordmark invert sub="ระบบหลังบ้าน" />
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="border border-bone/25 px-2 py-1 text-[11px] uppercase tracking-wide2 text-bone/80"
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
