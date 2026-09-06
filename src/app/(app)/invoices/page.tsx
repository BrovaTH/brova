import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHead, Section, Stat, Table, Td, Tag, Note, LinkBtn } from "@/components/ui";
import { InvoiceActions } from "@/components/invoice-actions";
import { money, num, thDate } from "@/lib/format";
import { INVOICE_STATUS_TH } from "@/lib/accounting";

export const dynamic = "force-dynamic";

// ============================================================================
// หน้าใบวางบิล
//
// ใบวางบิลผูกกับงานเสมอ งานหนึ่งงานวางบิลได้สองใบ คือมัดจำและยอดคงเหลือ
// ทั้งคู่อ้างกลับไปที่งานเดิม เพื่อให้ไล่ได้ว่าเงินก้อนนี้มาจากงานไหน
//
// สิ่งที่ต้องเห็นก่อนอย่างอื่นคือใบที่เลยกำหนดชำระ เพราะนั่นคือเงินของเรา
// ที่อยู่ในมือคนอื่นเกินเวลาที่ตกลงกันไว้
// ============================================================================

export default async function InvoicesPage() {
  const sb = supabaseServer();
  const { data: invs } = await sb
    .from("invoices_view")
    .select("*")
    .order("issue_date", { ascending: false });

  const all = invs ?? [];
  const live = all.filter((i) => i.status !== "Void");

  const billed = live.reduce((a, i) => a + Number(i.grand_total ?? 0), 0);
  const outstanding = live.reduce((a, i) => a + Number(i.outstanding ?? 0), 0);
  const collected = billed - outstanding;
  const overdue = live.filter(
    (i) => Number(i.overdue_days ?? 0) > 0 && Number(i.outstanding ?? 0) > 0,
  );
  const overdueAmt = overdue.reduce((a, i) => a + Number(i.outstanding ?? 0), 0);

  return (
    <>
      <PageHead
        eyebrow="ใบวางบิล"
        title="INVOICES"
        lead="ใบวางบิลผูกกับงานเสมอ ออกเลขแล้วล็อก ถ้าผิดต้องยกเลิกแล้วออกใหม่ หรือออกใบลดหนี้"
        right={<LinkBtn href="/accounting">ไปหน้าการเงินภาพรวม</LinkBtn>}
      />

      <Section title="สถานะเงินจากใบวางบิล" hint="ไม่นับใบที่ยกเลิกไปแล้ว">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="วางบิลไปแล้ว" value={money(billed, 0)} unit="บาท"
                hint={`${live.length} ใบ`} />
          <Stat label="เก็บได้แล้ว" value={money(collected, 0)} unit="บาท"
                hint={billed > 0 ? `คิดเป็น ${((collected / billed) * 100).toFixed(0)}% ของที่วางบิล` : "—"} />
          <Stat label="ยังเก็บไม่ได้" value={money(outstanding, 0)} unit="บาท"
                tone={outstanding > 0 ? "warn" : undefined}
                hint="รวมทุกใบที่ยังรับเงินไม่ครบ" />
          <Stat label="เลยกำหนดชำระ" value={money(overdueAmt, 0)} unit="บาท"
                tone={overdue.length ? "bad" : undefined}
                hint={`${overdue.length} ใบ · เงินของเราที่อยู่ในมือคนอื่นเกินเวลา`} />
        </div>
      </Section>

      {overdue.length > 0 && (
        <Section title="ใบที่เลยกำหนดชำระ" hint="ตามใบพวกนี้ก่อน เรียงจากที่เลยมานานที่สุด">
          <Table head={["เลขที่", "ลูกค้า", "งาน", "ครบกำหนด", "ค้างชำระ", ""]}>
            {[...overdue]
              .sort((a, b) => Number(b.overdue_days ?? 0) - Number(a.overdue_days ?? 0))
              .map((i) => (
                <tr key={String(i.id)} className="border-b border-line-soft last:border-0">
                  <Td>
                    <Link href={`/docs/invoice/${i.id}`}
                          className="tnum underline decoration-line-hard underline-offset-4">
                      {String(i.code)}
                    </Link>
                  </Td>
                  <Td>{String(i.bill_to_name ?? "—")}</Td>
                  <Td><span className="tnum text-[12px] text-ink/55">{String(i.job_code ?? "—")}</span></Td>
                  <Td>
                    <span className="text-signal-bad">
                      {thDate(i.due_date as string)}
                      <span className="ml-1.5 text-[11px]">เลยมา {String(i.overdue_days)} วัน</span>
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="tnum text-signal-bad">{money(Number(i.outstanding ?? 0))}</span>
                  </Td>
                  <Td align="right"><InvoiceActions inv={i} /></Td>
                </tr>
              ))}
          </Table>
        </Section>
      )}

      <Section title={`ใบวางบิลทั้งหมด ${num(all.length)} ใบ`} hint="เรียงจากใบใหม่สุด">
        <Table
          head={["เลขที่", "ลูกค้า", "งาน", "ครบกำหนด", "ยอดสุทธิ", "ค้าง", "สถานะ", ""]}
          empty="ยังไม่มีใบวางบิล ออกได้จากหน้ารายละเอียดงาน"
        >
          {all.map((i) => {
            const od = Number(i.overdue_days ?? 0);
            const out = Number(i.outstanding ?? 0);
            return (
              <tr key={String(i.id)} className="border-b border-line-soft last:border-0">
                <Td>
                  <Link href={`/docs/invoice/${i.id}`}
                        className="tnum underline decoration-line-hard underline-offset-4">
                    {String(i.code)}
                  </Link>
                </Td>
                <Td>{String(i.bill_to_name ?? "—")}</Td>
                <Td>
                  {i.job_code ? (
                    <span className="tnum text-[12px] text-ink/55">{String(i.job_code)}</span>
                  ) : "—"}
                </Td>
                <Td>
                  <span className={od > 0 && out > 0 ? "text-signal-bad" : ""}>
                    {thDate(i.due_date as string)}
                    {od > 0 && out > 0 && <span className="ml-1 text-[11px]">เลย {od} วัน</span>}
                  </span>
                </Td>
                <Td align="right"><span className="tnum">{money(Number(i.net_payable ?? 0))}</span></Td>
                <Td align="right">
                  <span className={`tnum ${out > 0 ? "text-signal-warn" : "text-ink/35"}`}>
                    {out > 0 ? money(out) : "ครบ"}
                  </span>
                </Td>
                <Td>
                  <Tag tone={
                    i.status === "Paid" ? "ok"
                    : i.status === "Void" ? "mute"
                    : od > 0 && out > 0 ? "bad"
                    : "warn"
                  }>
                    {INVOICE_STATUS_TH[String(i.status)] ?? String(i.status)}
                  </Tag>
                </Td>
                <Td align="right"><InvoiceActions inv={i} /></Td>
              </tr>
            );
          })}
        </Table>
      </Section>

      <Note tone="info" title="ยกเลิกบิลได้ไหม">
        ยกเลิกได้เฉพาะใบที่ยังไม่เคยรับเงินเลย และต้องมีเหตุผลกำกับเสมอ
        เลขที่เดิมจะยังอยู่ในระบบและไม่ถูกเอาไปใช้ซ้ำ เพราะเลขที่เอกสารต้องเรียงต่อเนื่อง
        ถ้ารับเงินไปแล้วแต่ต้องลดยอด ให้ออกใบลดหนี้แทน ยอดค้างจะถูกหักให้เอง
      </Note>
    </>
  );
}
