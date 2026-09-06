import Link from "next/link";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { PageHead, Stat, Section, Table, Td, Tag, LinkBtn, Note, statusTone, Bar } from "@/components/ui";
import { ManualButton } from "@/components/manual";
import { money, num, thDate, ago, daysBetween, todayISO } from "@/lib/format";
import { statusTh, statusPhase, isTrouble, STATUSES } from "@/lib/workflow";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const sb = supabaseServer();
  const me = await currentProfile();

  const [{ data: jobs }, { data: invs }, { data: apvs }, { data: skus }, { data: pos }] =
    await Promise.all([
      sb.from("jobs_view").select("*").order("created_at", { ascending: false }),
      sb.from("invoices_view").select("*"),
      sb.from("approvals_view").select("*").order("requested_at", { ascending: false }).limit(6),
      sb.from("skus_view").select("*"),
      sb.from("purchase_orders_view").select("*"),
    ]);

  const J = jobs ?? [];
  const open = J.filter((j) => j.status !== "99" && j.status !== "98");
  const trouble = open.filter((j) => isTrouble(j.status));
  const lateJobs = open.filter(
    (j) => j.due_date && daysBetween(todayISO(), j.due_date) > 0,
  );

  const I = invs ?? [];
  const outstanding = I.filter((i) => i.status !== "Void").reduce(
    (a, i) => a + Number(i.outstanding ?? 0),
    0,
  );
  const overdue = I.filter((i) => Number(i.overdue_days ?? 0) > 0 && Number(i.outstanding ?? 0) > 0);

  const S = skus ?? [];
  const lowStock = S.filter(
    (k) => Number(k.qty_available ?? 0) <= Number(k.reorder_point ?? 0) && Number(k.reorder_point ?? 0) > 0,
  );

  const pendingApv = (apvs ?? []).filter((a) => a.status === "pending");
  const openPo = (pos ?? []).filter((p) => p.status !== "Received" && p.status !== "Cancelled");

  // งานคั่งอยู่ที่ขั้นไหน
  const byPhase = ["ขาย", "ออกแบบ", "ผลิต", "ส่งมอบ"].map((ph) => ({
    ph,
    n: open.filter((j) => statusPhase(j.status) === ph).length,
  }));
  const maxPhase = Math.max(1, ...byPhase.map((b) => b.n));

  return (
    <>
      <PageHead
        eyebrow={`สวัสดี ${me?.full_name ?? ""}`}
        title="ภาพรวมวันนี้"
        lead="หน้านี้ตอบคำถามเดียว งานไหนกำลังจะมีปัญหา แล้วต้องไปแตะอะไรก่อน"
        right={
          <>
            <ManualButton />
            <LinkBtn href="/jobs/new" solid>เปิดใบงานใหม่</LinkBtn>
          </>
        }
      />

      {/* ------------------------------------------------------------ ที่ต้องรีบ */}
      {(pendingApv.length > 0 || trouble.length > 0 || overdue.length > 0) && (
        <Section title="ต้องแตะก่อน" hint="เรื่องที่ปล่อยไว้แล้วจะบานปลาย">
          <div className="grid gap-3 md:grid-cols-3">
            {pendingApv.length > 0 && (
              <Note tone="warn" title={`${pendingApv.length} เรื่องรอเจ้าของอนุมัติ`}>
                {pendingApv[0].title}
                {pendingApv.length > 1 && <> และอีก {pendingApv.length - 1} เรื่อง</>}
                <div className="mt-2">
                  <Link href="/approvals" className="underline underline-offset-4">
                    ไปหน้าขออนุมัติ
                  </Link>
                </div>
              </Note>
            )}
            {trouble.length > 0 && (
              <Note tone="bad" title={`${trouble.length} งานติดปัญหา`}>
                {trouble
                  .slice(0, 2)
                  .map((j) => `${j.code} ${statusTh(j.status)}`)
                  .join(" · ")}
                <div className="mt-2">
                  <Link href="/jobs?filter=trouble" className="underline underline-offset-4">
                    ดูงานที่ติด
                  </Link>
                </div>
              </Note>
            )}
            {overdue.length > 0 && (
              <Note tone="bad" title={`${overdue.length} ใบวางบิลเลยกำหนด`}>
                ค้างรวม{" "}
                {money(overdue.reduce((a, i) => a + Number(i.outstanding ?? 0), 0))} บาท
                <div className="mt-2">
                  <Link href="/accounting" className="underline underline-offset-4">
                    ไปหน้าการเงิน
                  </Link>
                </div>
              </Note>
            )}
          </div>
        </Section>
      )}

      {/* ------------------------------------------------------------ ตัวเลข */}
      <Section title="ตัวเลขที่ต้องรู้">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="งานที่ยังเปิดอยู่" value={num(open.length)} unit="งาน"
                hint={`เลยกำหนดส่ง ${lateJobs.length} งาน`}
                tone={lateJobs.length ? "bad" : undefined} />
          <Stat label="เงินที่ยังเก็บไม่ได้" value={money(outstanding, 0)} unit="บาท"
                hint={`เลยกำหนด ${overdue.length} ใบ`}
                tone={overdue.length ? "bad" : undefined} />
          <Stat label="รหัสสินค้าใกล้หมด" value={num(lowStock.length)} unit="รายการ"
                hint={lowStock.length ? "ต่ำกว่าจุดสั่งซื้อ" : "ยังไม่มีที่ต้องเติม"}
                tone={lowStock.length ? "warn" : undefined} />
          <Stat label="ใบสั่งซื้อค้างรับ" value={num(openPo.length)} unit="ใบ"
                hint={openPo.length ? "ยังรับของไม่ครบ" : "รับครบทุกใบ"} />
        </div>
      </Section>

      {/* ------------------------------------------------------------ งานคั่งตรงไหน */}
      <Section title="งานคั่งอยู่ตรงไหน" hint="ถ้ากองอยู่ขั้นเดียวนาน ๆ แปลว่าคอขวดอยู่ตรงนั้น">
        <div className="card divide-y divide-line-soft">
          {byPhase.map((b) => (
            <div key={b.ph} className="flex items-center gap-4 px-4 py-3">
              <span className="w-20 shrink-0 text-[13px]">{b.ph}</span>
              <div className="flex-1">
                <Bar value={b.n} max={maxPhase} tone={b.n === maxPhase && b.n > 0 ? "warn" : "ok"} />
              </div>
              <span className="tnum w-12 shrink-0 text-right text-[13px]">{num(b.n)}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------ งานล่าสุด */}
      <Section
        title="งานที่ยังเปิดอยู่"
        right={<LinkBtn href="/jobs">ดูทั้งหมด</LinkBtn>}
      >
        <Table
          head={["ใบงาน", "ลูกค้า", "สถานะ", "กำหนดส่ง", "ยอดค้าง"]}
          empty="ยังไม่มีงานที่เปิดอยู่"
        >
          {open.slice(0, 8).map((j) => {
            const late = j.due_date ? daysBetween(todayISO(), j.due_date) : 0;
            return (
              <tr key={j.id} className="border-b border-line-soft last:border-0 hover:bg-bone-200/50">
                <Td>
                  <Link href={`/jobs/${j.id}`} className="underline decoration-line-hard underline-offset-4 hover:decoration-ink">
                    {j.code}
                  </Link>
                  <span className="ml-2 text-ink/55">{j.title}</span>
                </Td>
                <Td>{j.customer_name ?? "—"}</Td>
                <Td>
                  <Tag tone={statusTone(j.status)}>{statusTh(j.status)}</Tag>
                </Td>
                <Td>
                  {j.due_date ? (
                    <span className={late > 0 ? "text-signal-bad" : ""}>
                      {thDate(j.due_date)}
                      {late > 0 && <span className="ml-1 text-[11px]">เลย {late} วัน</span>}
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td align="right">
                  <span className="tnum">{money(j.outstanding, 0)}</span>
                </Td>
              </tr>
            );
          })}
        </Table>
      </Section>

      {/* ------------------------------------------------------------ ขออนุมัติล่าสุด */}
      <Section title="ใบขออนุมัติล่าสุด" right={<LinkBtn href="/approvals">ดูทั้งหมด</LinkBtn>}>
        <Table head={["เลขที่", "เรื่อง", "เกี่ยวกับ", "สถานะ", "เมื่อ"]} empty="ยังไม่มีใบขออนุมัติ">
          {(apvs ?? []).map((a) => (
            <tr key={a.id} className="border-b border-line-soft last:border-0">
              <Td>
                <span className="tnum">{a.code}</span>
              </Td>
              <Td>{a.kind_th}</Td>
              <Td>
                <span className="text-ink/60">{a.target_th}</span>{" "}
                {a.target_code && <span className="tnum">{a.target_code}</span>}
              </Td>
              <Td>
                <Tag
                  tone={
                    a.status === "approved" ? "ok"
                    : a.status === "rejected" ? "bad"
                    : a.status === "pending" ? "warn"
                    : "mute"
                  }
                >
                  {a.status_th}
                </Tag>
              </Td>
              <Td align="right">{ago(a.requested_at)}</Td>
            </tr>
          ))}
        </Table>
      </Section>

      <p className="text-[11px] leading-relaxed text-ink/35">
        ระบบมีสถานะงานทั้งหมด {STATUSES.length} ขั้น แต่ลูกค้าเห็นแค่ 7 ขั้น
        เพราะรายละเอียดภายในไม่ใช่เรื่องที่ลูกค้าต้องรับรู้
      </p>
    </>
  );
}
