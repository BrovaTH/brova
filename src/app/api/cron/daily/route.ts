import { NextResponse } from "next/server";
import { adminClient, ADMIN_MISSING } from "@/lib/supabase/admin";
import { notify, appUrl } from "@/lib/line/send";
import {
  cardDailySummary, cardJobLate, cardInvoiceOverdue, cardStockLow, cardPoLate,
} from "@/lib/line/flex";
import { thDateFull, toISODate, daysBetween, todayISO } from "@/lib/format";
import { statusTh, isClosed, isTrouble } from "@/lib/workflow";

/**
 * งานประจำวัน  ตรวจของที่ต้องเตือนแล้วส่งเข้าไลน์
 *
 * ตั้งให้ Vercel เรียกทุกเช้าด้วยไฟล์ vercel.json
 * ป้องกันคนอื่นเรียกด้วยรหัสลับใน CRON_SECRET
 *
 * ทุกอย่างในนี้เป็นการอ่านอย่างเดียว ไม่แก้ข้อมูลใด ๆ
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  if (header === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get("key") === secret;
}

export async function GET(req: Request) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "ไม่ได้รับอนุญาต" }, { status: 401 });
  }

  const sb = adminClient();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งกุญแจระบบ" }, { status: 500 });

  const today = todayISO();
  const sent: string[] = [];

  // ---------------------------------------------------------------- ดึงข้อมูล
  const [{ data: jobs }, { data: invs }, { data: apvs }, { data: skus }, { data: pos }] =
    await Promise.all([
      sb.from("jobs_view").select("*"),
      sb.from("invoices_view").select("*"),
      sb.from("approvals_view").select("*").eq("status", "pending"),
      sb.from("skus_view").select("*"),
      sb.from("purchase_orders_view").select("*"),
    ]);

  const openJobs = (jobs ?? []).filter((j) => !isClosed(j.status));
  const lateJobs = openJobs
    .filter((j) => j.due_date && daysBetween(today, j.due_date) > 0)
    .map((j) => ({ code: j.code, title: j.title, days: daysBetween(today, j.due_date) }))
    .sort((a, b) => b.days - a.days);

  const liveInv = (invs ?? []).filter((i) => i.status !== "Void");
  const outstanding = liveInv.reduce((a, i) => a + Number(i.outstanding ?? 0), 0);
  const overdue = liveInv
    .filter((i) => Number(i.overdue_days ?? 0) > 0 && Number(i.outstanding ?? 0) > 0)
    .map((i) => ({ code: i.code ?? "—", name: i.bill_to_name ?? "—", days: Number(i.overdue_days) }))
    .sort((a, b) => b.days - a.days);
  const overdueTotal = liveInv
    .filter((i) => Number(i.overdue_days ?? 0) > 0)
    .reduce((a, i) => a + Number(i.outstanding ?? 0), 0);

  const lowStock = (skus ?? [])
    .filter((k) => Number(k.reorder_point ?? 0) > 0 &&
                   Number(k.qty_available ?? 0) <= Number(k.reorder_point ?? 0))
    .map((k) => ({
      code: k.code,
      name: `${k.fabric_name} ${k.color_name} ${k.size}`,
      available: Number(k.qty_available ?? 0),
      reorder: Number(k.reorder_point ?? 0),
    }))
    .sort((a, b) => a.available - b.available);

  const openPo = (pos ?? []).filter((p) => p.status !== "Received" && p.status !== "Cancelled");
  const latePo = openPo
    .filter((p) => Number(p.overdue_days ?? 0) > 0)
    .map((p) => ({
      code: p.code,
      supplier: p.supplier_name ?? "—",
      days: Number(p.overdue_days),
      qty: Number(p.qty_outstanding ?? 0),
    }))
    .sort((a, b) => b.days - a.days);

  const pendingAmount = (apvs ?? []).reduce((a, x) => a + Number(x.amount ?? 0), 0);

  // ---------------------------------------------------------------- ส่งการ์ด
  const hot = [
    ...lateJobs.slice(0, 3).map((j) => ({ code: j.code, title: j.title, note: `เลย ${j.days} วัน` })),
    ...openJobs
      .filter((j) => isTrouble(j.status))
      .slice(0, 2)
      .map((j) => ({ code: j.code, title: j.title, note: statusTh(j.status) })),
  ];

  const r1 = await notify(
    "daily_summary",
    `สรุปประจำวัน ${thDateFull(today)}`,
    cardDailySummary({
      dateTh: thDateFull(today),
      openJobs: openJobs.length,
      lateJobs: lateJobs.length,
      outstanding,
      overdueCount: overdue.length,
      pendingApprovals: (apvs ?? []).length,
      pendingAmount,
      lowStock: lowStock.length,
      openPo: openPo.length,
      hotJobs: hot,
      url: appUrl("/"),
    }),
  );
  if (r1.ok) sent.push("daily_summary");

  if (lateJobs.length > 0) {
    const r = await notify("job_late", `งานเลยกำหนดส่ง ${lateJobs.length} งาน`,
      cardJobLate({ jobs: lateJobs, url: appUrl("/jobs?filter=late") }));
    if (r.ok) sent.push("job_late");
  }

  if (overdue.length > 0) {
    const r = await notify("invoice_overdue", `ใบวางบิลเลยกำหนด ${overdue.length} ใบ`,
      cardInvoiceOverdue({
        count: overdue.length, total: overdueTotal, items: overdue, url: appUrl("/accounting"),
      }));
    if (r.ok) sent.push("invoice_overdue");
  }

  if (lowStock.length > 0) {
    const r = await notify("stock_low", `ของใกล้หมด ${lowStock.length} รายการ`,
      cardStockLow({ items: lowStock, url: appUrl("/stock") }));
    if (r.ok) sent.push("stock_low");
  }

  if (latePo.length > 0) {
    const r = await notify("po_late", `ใบสั่งซื้อเลยกำหนดรับ ${latePo.length} ใบ`,
      cardPoLate({ items: latePo, url: appUrl("/purchasing") }));
    if (r.ok) sent.push("po_late");
  }

  return NextResponse.json({
    ok: true,
    date: toISODate(today),
    checked: {
      openJobs: openJobs.length, lateJobs: lateJobs.length,
      overdueInvoices: overdue.length, lowStock: lowStock.length,
      latePo: latePo.length, pendingApprovals: (apvs ?? []).length,
    },
    sent,
  });
}
