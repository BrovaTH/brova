import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHead, Section, Stat, Table, Td, Tag, Note } from "@/components/ui";
import { ModalButton } from "@/components/modal";
import { money, num, thDate, thDateTime, toISODate, daysBetween } from "@/lib/format";
import { statusTh } from "@/lib/workflow";

export const dynamic = "force-dynamic";

export default async function ShipmentsPage() {
  const sb = supabaseServer();
  const [{ data: ships }, { data: jobs }] = await Promise.all([
    sb.from("shipments").select("*").order("shipped_at", { ascending: false }),
    sb.from("jobs_view").select("id, code, title, customer_name, status, due_date, track_token, ship_cost"),
  ]);

  const S = ships ?? [];
  const jobMap = new Map((jobs ?? []).map((j) => [j.id, j]));

  // ตรงเวลาคือส่งภายในหรือก่อนวันกำหนด เทียบเป็นวันที่ทั้งคู่ ไม่ใช่เทียบเวลา
  const withDue = S.filter((s) => {
    const j = jobMap.get(s.job_id);
    return !!(j?.due_date && s.shipped_at);
  });
  const onTime = withDue.filter((s) => {
    const j = jobMap.get(s.job_id)!;
    return toISODate(s.shipped_at) <= toISODate(j.due_date);
  });
  const rate = withDue.length ? (onTime.length / withDue.length) * 100 : 0;

  const inTransit = S.filter((s) => s.status === "ส่งแล้ว");
  const problems = S.filter((s) => s.status === "ตีกลับ" || s.status === "สูญหาย");
  const shipCost = S.reduce((a, s) => a + Number(s.cost ?? 0), 0);

  return (
    <>
      <PageHead
        eyebrow="จัดส่ง"
        title="รอบจัดส่งทั้งหมด"
        lead="ตรงเวลาคือส่งภายในวันกำหนดหรือก่อนหน้า นับเป็นวัน ไม่นับเป็นชั่วโมง"
      />

      <Section title="ภาพรวมการส่ง">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="ส่งไปแล้ว" value={num(S.length)} unit="รอบ" hint={`ยังอยู่ระหว่างทาง ${inTransit.length}`} />
          <Stat label="ส่งตรงเวลา" value={rate.toFixed(0)} unit="%"
                tone={rate < 80 && withDue.length > 0 ? "warn" : undefined}
                hint={`${onTime.length} จาก ${withDue.length} รอบที่มีกำหนด`} />
          <Stat label="ค่าส่งรวม" value={money(shipCost, 0)} unit="บาท" hint="ทุกรอบรวมกัน" />
          <Stat label="มีปัญหา" value={num(problems.length)} unit="รอบ"
                tone={problems.length ? "bad" : undefined}
                hint={problems.length ? "ตีกลับหรือสูญหาย" : "ไม่มีปัญหา"} />
        </div>
      </Section>

      {problems.length > 0 && (
        <Section title="ต้องตามด่วน">
          <Note tone="bad" title={`${problems.length} รอบมีปัญหา`}>
            พัสดุที่ตีกลับหรือสูญหายต้องรีบตามภายในเวลาที่ขนส่งกำหนด ไม่งั้นเคลมไม่ได้
          </Note>
        </Section>
      )}

      <Section title={`รายการจัดส่ง ${num(S.length)} รอบ`}>
        <Table
          head={["เลขที่", "งาน", "ลูกค้า", "ขนส่ง", "เลขพัสดุ", "ส่งเมื่อ", "กำหนด", "สถานะ", ""]}
          empty="ยังไม่มีรอบจัดส่ง"
        >
          {S.map((s) => {
            const j = jobMap.get(s.job_id);
            const lateDays =
              j?.due_date && s.shipped_at ? daysBetween(s.shipped_at, j.due_date) : 0;
            return (
              <tr key={s.id} className="border-b border-line-soft last:border-0">
                <Td><span className="tnum text-[12px]">{s.code ?? "—"}</span></Td>
                <Td>
                  {j ? (
                    <Link href={`/jobs/${j.id}`} className="tnum underline decoration-line-hard underline-offset-4">
                      {j.code}
                    </Link>
                  ) : "—"}
                  {j && <span className="mt-0.5 block text-[12px] text-ink/50">{j.title}</span>}
                </Td>
                <Td>{j?.customer_name ?? "—"}</Td>
                <Td>{s.carrier ?? "—"}</Td>
                <Td><span className="tnum text-[12px]">{s.tracking_no ?? "—"}</span></Td>
                <Td>{s.shipped_at ? thDate(s.shipped_at) : "—"}</Td>
                <Td>
                  {j?.due_date ? (
                    <span className={lateDays > 0 ? "text-signal-bad" : "text-signal-ok"}>
                      {thDate(j.due_date)}
                      {lateDays > 0 && <span className="ml-1 text-[11px]">ช้า {lateDays} วัน</span>}
                    </span>
                  ) : "—"}
                </Td>
                <Td>
                  <Tag tone={
                    s.status === "ถึงแล้ว" ? "ok"
                    : s.status === "ส่งแล้ว" ? "info"
                    : s.status === "เตรียมส่ง" ? "warn"
                    : "bad"
                  }>
                    {s.status}
                  </Tag>
                </Td>
                <Td align="right">
                  <span className="flex justify-end gap-2">
                    <ModalButton label="รายละเอียด" title={`รอบจัดส่ง ${s.code ?? ""}`}
                                 subtitle={j ? `${j.code} · ${j.title}` : undefined}>
                      <div className="divide-y divide-line-soft">
                        <Row k="ขนส่ง" v={s.carrier ?? "—"} />
                        <Row k="เลขพัสดุ" v={s.tracking_no ?? "—"} mono />
                        <Row k="จำนวนกล่อง" v={num(s.boxes)} mono />
                        <Row k="น้ำหนัก" v={s.weight_kg ? `${s.weight_kg} กก.` : "—"} mono />
                        <Row k="ค่าส่ง" v={`${money(s.cost)} บาท`} mono />
                        <Row k="ส่งเมื่อ" v={s.shipped_at ? thDateTime(s.shipped_at) : "—"} mono />
                        <Row k="ถึงเมื่อ" v={s.delivered_at ? thDateTime(s.delivered_at) : "ยังไม่ยืนยัน"} mono />
                        <Row k="สถานะงาน" v={j ? statusTh(j.status) : "—"} />
                      </div>
                      {s.note && (
                        <>
                          <p className="label mt-4">บันทึก</p>
                          <p className="leading-relaxed">{s.note}</p>
                        </>
                      )}
                      {s.photo_url && (
                        <div className="mt-4 border border-line bg-bone-200/50 p-3">
                          <p className="mb-2 text-[11px] uppercase tracking-wide2 text-ink/40">รูปตอนส่ง</p>
                          <a href={s.photo_url} target="_blank" rel="noreferrer"
                             className="break-all text-[12px] underline underline-offset-4">
                            {s.photo_url}
                          </a>
                        </div>
                      )}
                    </ModalButton>

                    {j && (
                      <Link href={`/track/${j.track_token}`} target="_blank"
                            className="text-[12px] underline underline-offset-4">
                        หน้าลูกค้า
                      </Link>
                    )}
                  </span>
                </Td>
              </tr>
            );
          })}
        </Table>
      </Section>
    </>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <span className="text-[12px] text-ink/45">{k}</span>
      <span className={`text-right text-[13px] ${mono ? "tnum" : ""}`}>{v}</span>
    </div>
  );
}
