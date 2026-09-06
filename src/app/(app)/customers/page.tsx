import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHead, Section, Table, Td, Tag, Stat, KV } from "@/components/ui";
import { ModalButton } from "@/components/modal";
import { money, num, thDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const sb = supabaseServer();
  const [{ data: customers }, { data: jobs }, { data: invs }] = await Promise.all([
    sb.from("customers").select("*").order("name"),
    sb.from("jobs_view").select("id, code, title, customer_id, status, total_amount, outstanding, created_at"),
    sb.from("invoices_view").select("customer_id, grand_total, outstanding, overdue_days, status"),
  ]);

  const C = customers ?? [];
  const J = jobs ?? [];
  const I = (invs ?? []).filter((i) => i.status !== "Void");

  const stat = (id: string) => {
    const mine = J.filter((j) => j.customer_id === id);
    const inv = I.filter((i) => i.customer_id === id);
    return {
      jobs: mine.length,
      value: mine.reduce((a, j) => a + Number(j.total_amount ?? 0), 0),
      outstanding: inv.reduce((a, i) => a + Number(i.outstanding ?? 0), 0),
      overdue: inv.some((i) => Number(i.overdue_days ?? 0) > 0 && Number(i.outstanding ?? 0) > 0),
      lastJob: mine.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0],
    };
  };

  const totalOutstanding = I.reduce((a, i) => a + Number(i.outstanding ?? 0), 0);
  const corporate = C.filter((c) => c.type === "นิติบุคคล").length;

  return (
    <>
      <PageHead
        eyebrow="ลูกค้า"
        title="รายชื่อและยอดค้าง"
        lead="ลูกค้านิติบุคคลจะถูกหักภาษี ณ ที่จ่าย 3% จากยอดก่อนภาษีโดยอัตโนมัติเวลาออกใบวางบิล"
      />

      <Section title="ภาพรวม">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="ลูกค้าทั้งหมด" value={num(C.length)} unit="ราย" hint={`นิติบุคคล ${corporate} ราย`} />
          <Stat label="งานทั้งหมด" value={num(J.length)} unit="งาน" hint="รวมทุกสถานะ" />
          <Stat label="ยอดค้างรวม" value={money(totalOutstanding, 0)} unit="บาท"
                tone={totalOutstanding > 0 ? "warn" : undefined} hint="ทุกลูกค้ารวมกัน" />
          <Stat label="มูลค่างานสะสม"
                value={money(J.reduce((a, j) => a + Number(j.total_amount ?? 0), 0), 0)}
                unit="บาท" hint="ตามยอดในใบงาน" />
        </div>
      </Section>

      <Section title={`ลูกค้า ${num(C.length)} ราย`}>
        <Table
          head={["ชื่อ", "ประเภท", "ติดต่อ", "เครดิต", "งาน", "มูลค่าสะสม", "ค้างชำระ", ""]}
          empty="ยังไม่มีลูกค้าในระบบ"
        >
          {C.map((c) => {
            const s = stat(c.id);
            return (
              <tr key={c.id} className="border-b border-line-soft last:border-0">
                <Td>
                  {c.name}
                  {c.code && <span className="tnum ml-2 text-[11px] text-ink/35">{c.code}</span>}
                </Td>
                <Td>
                  <Tag tone={c.type === "นิติบุคคล" ? "info" : "mute"}>{c.type}</Tag>
                </Td>
                <Td>
                  <span className="text-[12px]">
                    {c.contact_name ?? "—"}
                    {c.phone && <span className="block text-ink/50">{c.phone}</span>}
                  </span>
                </Td>
                <Td>
                  <span className="text-[12px] text-ink/60">
                    {c.credit_days > 0 ? `${c.credit_days} วัน` : c.credit_terms ?? "—"}
                  </span>
                </Td>
                <Td align="right"><span className="tnum">{num(s.jobs)}</span></Td>
                <Td align="right"><span className="tnum">{money(s.value, 0)}</span></Td>
                <Td align="right">
                  <span className={`tnum ${s.overdue ? "text-signal-bad" : s.outstanding > 0 ? "text-signal-warn" : "text-ink/35"}`}>
                    {s.outstanding > 0 ? money(s.outstanding, 0) : "ครบ"}
                  </span>
                </Td>
                <Td align="right">
                  <ModalButton label="ดูข้อมูล" title={c.name} subtitle={c.code ?? undefined} wide>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="divide-y divide-line-soft">
                        <KV k="ประเภท" v={c.type} />
                        <KV k="เลขผู้เสียภาษี" v={c.tax_id ?? "—"} mono />
                        <KV k="ผู้ติดต่อ" v={c.contact_name ?? "—"} />
                        <KV k="โทรศัพท์" v={c.phone ?? "—"} mono />
                        <KV k="ไลน์" v={c.line_id ?? "—"} />
                        <KV k="อีเมล" v={c.email ?? "—"} />
                        <KV k="ช่องทางที่มา" v={c.source ?? "—"} />
                        <KV k="เงื่อนไขชำระ" v={c.credit_terms ?? "—"} />
                        <KV k="เครดิต" v={c.credit_days > 0 ? `${c.credit_days} วัน` : "ไม่ให้เครดิต"} mono />
                        <KV k="วงเงิน" v={c.credit_limit > 0 ? `${money(c.credit_limit, 0)} บาท` : "ไม่กำหนด"} mono />
                      </div>

                      <div>
                        <p className="label">ที่อยู่วางบิล</p>
                        <p className="mb-4 whitespace-pre-line leading-relaxed">
                          {c.address_bill ?? "—"}
                        </p>
                        <p className="label">ที่อยู่จัดส่ง</p>
                        <p className="whitespace-pre-line leading-relaxed">
                          {c.address_ship ?? c.address_bill ?? "—"}
                        </p>
                        {c.note && (
                          <>
                            <p className="label mt-4">บันทึก</p>
                            <p className="leading-relaxed">{c.note}</p>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="rule mt-5 pt-4">
                      <p className="label">งานของลูกค้ารายนี้</p>
                      <ul className="space-y-1.5">
                        {J.filter((j) => j.customer_id === c.id).slice(0, 8).map((j) => (
                          <li key={j.id} className="flex items-center justify-between gap-3">
                            <Link href={`/jobs/${j.id}`} className="tnum underline underline-offset-4">
                              {j.code}
                            </Link>
                            <span className="min-w-0 flex-1 truncate text-ink/60">{j.title}</span>
                            <span className="tnum shrink-0">{money(j.total_amount, 0)}</span>
                          </li>
                        ))}
                        {s.jobs === 0 && <li className="text-ink/40">ยังไม่มีงาน</li>}
                      </ul>
                      {s.lastJob && (
                        <p className="mt-3 text-[11px] text-ink/40">
                          งานล่าสุดเปิดเมื่อ {thDate(s.lastJob.created_at)}
                        </p>
                      )}
                    </div>
                  </ModalButton>
                </Td>
              </tr>
            );
          })}
        </Table>
      </Section>
    </>
  );
}
