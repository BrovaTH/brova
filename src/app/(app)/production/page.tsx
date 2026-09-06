import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHead, Section, Table, Td, Tag, Stat, Note, Empty } from "@/components/ui";
import { ModalButton } from "@/components/modal";
import { ChartFrame, HBars } from "@/components/chart";
import { ProductionLogForm } from "./log-form";
import { money, num, thDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

// ============================================================================
// หน้าผลิตและตรวจคุณภาพ
//
// สองเรื่องนี้อยู่หน้าเดียวกันเพราะมันคือคำถามเดียวกัน คือ
// "ของที่ทำอยู่ตอนนี้ ดีพอส่งลูกค้าหรือยัง"
//
// ตัวเลขของเสียแยกตามสาเหตุคือหัวใจของหน้านี้
// เพราะรู้ว่าเสียเท่าไรไม่ช่วยอะไร ต้องรู้ว่าเสียเพราะอะไรถึงจะแก้ได้
// ============================================================================

/** งานที่ยังไม่ปิดและไม่ถูกยกเลิก คืองานที่ยังบันทึกการผลิตได้ */
const CLOSED = ["99", "98", "97"];

export default async function ProductionPage() {
  const sb = supabaseServer();
  const [{ data: jobs }, { data: logs }, { data: qc }] = await Promise.all([
    sb.from("jobs_view").select("id, code, title, status, customer_name, qty_total")
      .order("created_at", { ascending: false }),
    sb.from("production_logs").select("*").order("created_at", { ascending: false }),
    sb.from("qc_records").select("*").order("created_at", { ascending: false }),
  ]);

  const J = jobs ?? [];
  const L = logs ?? [];
  const Q = qc ?? [];
  const jobLabel = new Map<string, string>(
    J.map((j) => [String(j.id), `${j.code} · ${j.title}`] as [string, string]),
  );

  const live = J.filter((j) => !CLOSED.includes(String(j.status)));

  // ------------------------------------------------------------ ตัวเลขรวม
  //
  // ระวังเรื่องการนับซ้ำ  เสื้อหนึ่งตัวเดินผ่านหลายสถานี ตัด เย็บ พิมพ์ แพ็ก
  // ถ้าเอา qty_out ของทุกสถานีมาบวกกัน เสื้อ 300 ตัวที่ผ่าน 3 สถานีจะกลายเป็น 900
  // ตัวเลขข้างล่างจึงเรียกว่า "ครั้งที่ผ่านสถานี" ไม่ใช่ "จำนวนเสื้อ"
  // ส่วนจำนวนเสื้อจริงของแต่ละงาน ดูจากสถานีล่าสุดของงานนั้นในตารางด้านล่าง
  const passIn = L.reduce((a, r) => a + Number(r.qty_in ?? 0), 0);
  const passOut = L.reduce((a, r) => a + Number(r.qty_out ?? 0), 0);
  const qtyDefect = L.reduce((a, r) => a + Number(r.qty_defect ?? 0), 0);
  const defectPct = passIn > 0 ? (qtyDefect / passIn) * 100 : 0;

  /**
   * เสื้อที่ออกจากสถานีล่าสุดของงานนี้
   *
   * ใช้บันทึกล่าสุดของงานเป็นตัวแทน เพราะมันคือปลายทางที่ของเดินมาถึงตอนนี้
   * ไม่เอาทุกสถานีมาบวกกัน ไม่งั้นจะได้ตัวเลขมากกว่าจำนวนเสื้อที่สั่งจริง
   */
  function latestOut(jobId: string): { out: number; step: string } | null {
    const mine = L.filter((r) => String(r.job_id) === jobId);
    if (mine.length === 0) return null;
    // L เรียงจากใหม่ไปเก่ามาแล้วตั้งแต่ตอนดึงข้อมูล ตัวแรกจึงคือล่าสุด
    return { out: Number(mine[0].qty_out ?? 0), step: String(mine[0].step ?? "—") };
  }

  const checked = Q.reduce((a, r) => a + Number(r.checked_qty ?? 0), 0);
  const passed = Q.reduce((a, r) => a + Number(r.pass_qty ?? 0), 0);
  const qcPct = checked > 0 ? (passed / checked) * 100 : 0;

  // ------------------------------------------------------------ ของเสียแยกตามสาเหตุ
  // เรียงจากมากไปน้อย เพราะสาเหตุอันดับหนึ่งคือที่ที่แก้แล้วคุ้มที่สุด
  const byReason = new Map<string, number>();
  for (const r of L) {
    const d = Number(r.qty_defect ?? 0);
    if (d <= 0) continue;
    const key = String(r.defect_reason ?? "ไม่ระบุสาเหตุ");
    byReason.set(key, (byReason.get(key) ?? 0) + d);
  }
  const reasonRows = Array.from(byReason.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // ------------------------------------------------------------ ของเสียแยกตามสถานี
  const byStep = new Map<string, number>();
  for (const r of L) {
    const d = Number(r.qty_defect ?? 0);
    if (d <= 0) continue;
    const key = String(r.step ?? "ไม่ระบุ");
    byStep.set(key, (byStep.get(key) ?? 0) + d);
  }
  const stepRows = Array.from(byStep.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  return (
    <>
      <PageHead
        eyebrow="ผลิตและตรวจคุณภาพ"
        title="PRODUCTION & QC"
        lead="เข้าเท่าไร ออกเท่าไร เสียเท่าไร เพราะอะไร เครื่องไหน บันทึกทุกครั้งที่ผ่านสถานี"
        right={
          <ModalButton
            variant="solid"
            label="บันทึกการผลิต"
            title="บันทึกการผลิตหนึ่งสถานี"
            subtitle="กรอกตอนของออกจากสถานี ไม่ใช่ตอนจบงานทั้งใบ"
          >
            <ProductionLogForm
              jobs={live.map((j) => ({ id: String(j.id), label: `${j.code} · ${j.title}` }))}
            />
          </ModalButton>
        }
      />

      <Section title="ตัวเลขรวม" hint="นับจากบันทึกการผลิตและผลตรวจทั้งหมดในระบบ">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="งานที่ยังเดินอยู่" value={num(live.length)} unit="งาน"
                hint="งานที่ยังไม่ปิดและยังไม่ถูกยกเลิก" />
          <Stat label="ผ่านสถานีไปแล้ว" value={num(passOut)} unit="ครั้ง"
                hint={`รับเข้าสถานีรวม ${num(passIn)} ครั้ง · เสื้อตัวเดียวนับหลายครั้งได้ถ้าผ่านหลายสถานี`} />
          <Stat label="ของเสีย" value={num(qtyDefect)} unit="ตัว"
                tone={defectPct > 3 ? "bad" : undefined}
                hint={`คิดเป็น ${money(defectPct, 1)}% ของครั้งที่เข้าสถานี · เป้าไม่เกิน 3%`} />
          <Stat label="ผ่านตรวจคุณภาพ" value={money(qcPct, 1)} unit="%"
                tone={qcPct < 95 && checked > 0 ? "bad" : undefined}
                hint={`ตรวจไปแล้ว ${num(checked)} ตัว ผ่าน ${num(passed)} ตัว · เป้าไม่ต่ำกว่า 95%`} />
        </div>
      </Section>

      <Section title="ของเสียมาจากไหน" hint="แก้ที่แถวบนสุดก่อน เพราะเป็นจุดที่แก้แล้วคุ้มที่สุด">
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartFrame
            title="สาเหตุที่ทำให้เสีย"
            hint="รวมทุกงานทุกสถานี เรียงจากที่เสียมากที่สุด"
          >
            <HBars rows={reasonRows} unit="ตัว" />
          </ChartFrame>
          <ChartFrame
            title="สถานีที่เสีย"
            hint="ถ้ากระจุกอยู่สถานีเดียว ปัญหามักอยู่ที่เครื่องหรือวิธีทำ ไม่ใช่ที่คน"
          >
            <HBars rows={stepRows} unit="ตัว" />
          </ChartFrame>
        </div>
      </Section>

      <Section
        title="งานที่กำลังอยู่ในสายการผลิต"
        hint="กดที่ชื่องานเพื่อเข้าไปดูรายละเอียดและขยับสถานะ"
      >
        {live.length === 0 ? (
          <Empty title="ไม่มีงานเดินอยู่ในไลน์" hint="งานทุกใบปิดหรือยกเลิกไปหมดแล้ว" />
        ) : (
          <Table head={["เลขที่งาน", "ชื่องาน", "ลูกค้า", "สั่งไว้", "สถานีล่าสุด", "ออกมาแล้ว", "เสียสะสม", "สถานะ"]}>
            {live.map((j) => {
              const mine = L.filter((r) => String(r.job_id) === String(j.id));
              const bad = mine.reduce((a, r) => a + Number(r.qty_defect ?? 0), 0);
              const last = latestOut(String(j.id));
              return (
                <tr key={String(j.id)} className="border-b border-line-soft last:border-0">
                  <Td><span className="tnum">{String(j.code)}</span></Td>
                  <Td>
                    <Link href={`/jobs/${j.id}`} className="underline underline-offset-4">
                      {String(j.title)}
                    </Link>
                  </Td>
                  <Td>{String(j.customer_name ?? "—")}</Td>
                  <Td align="right"><span className="tnum">{num(Number(j.qty_total ?? 0))}</span></Td>
                  <Td>
                    <span className="text-[12px] text-ink/55">{last ? last.step : "ยังไม่เข้าไลน์"}</span>
                  </Td>
                  <Td align="right">
                    <span className="tnum">{last ? num(last.out) : "—"}</span>
                  </Td>
                  <Td align="right">
                    <span className={`tnum ${bad > 0 ? "text-signal-bad" : "text-ink/35"}`}>
                      {num(bad)}
                    </span>
                  </Td>
                  <Td><Tag tone="warn">{String(j.status)}</Tag></Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <Section title="บันทึกการผลิตล่าสุด" hint="ยี่สิบรายการหลังสุด">
        <Table head={["งาน", "สถานี", "เครื่อง", "เข้า", "ออก", "เสีย", "สาเหตุ", "ใครบันทึก", "เมื่อ"]}
               empty="ยังไม่มีบันทึกการผลิต กดปุ่มบันทึกการผลิตด้านบนเพื่อเริ่ม">
          {L.slice(0, 20).map((r) => (
            <tr key={String(r.id)} className="border-b border-line-soft last:border-0">
              <Td>
                <span className="tnum text-[12px]">
                  {jobLabel.get(String(r.job_id))?.split(" · ")[0] ?? "—"}
                </span>
              </Td>
              <Td>{String(r.step ?? "—")}</Td>
              <Td><span className="text-[12px] text-ink/55">{String(r.machine ?? "—")}</span></Td>
              <Td align="right"><span className="tnum">{num(Number(r.qty_in ?? 0))}</span></Td>
              <Td align="right"><span className="tnum">{num(Number(r.qty_out ?? 0))}</span></Td>
              <Td align="right">
                <span className={`tnum ${Number(r.qty_defect ?? 0) > 0 ? "text-signal-bad" : "text-ink/35"}`}>
                  {num(Number(r.qty_defect ?? 0))}
                </span>
              </Td>
              <Td><span className="text-[12px]">{String(r.defect_reason ?? "—")}</span></Td>
              <Td><span className="text-[12px] text-ink/55">{String(r.by_user ?? "—")}</span></Td>
              <Td><span className="text-[12px] text-ink/45">{thDateTime(r.created_at as string)}</span></Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="ผลตรวจคุณภาพล่าสุด" hint="บันทึกผลตรวจทำที่หน้ารายละเอียดงาน เพราะเป็นด่าน G6 ของงานนั้น">
        <Table head={["งาน", "ตรวจ", "ผ่าน", "ไม่ผ่าน", "ผล", "สาเหตุ", "ทดสอบซัก", "ใครตรวจ", "เมื่อ"]}
               empty="ยังไม่มีผลตรวจคุณภาพ">
          {Q.slice(0, 20).map((r) => {
            const c = Number(r.checked_qty ?? 0);
            const p = Number(r.pass_qty ?? 0);
            const result = String(r.result ?? "—");
            return (
              <tr key={String(r.id)} className="border-b border-line-soft last:border-0">
                <Td>
                  <span className="tnum text-[12px]">
                    {jobLabel.get(String(r.job_id))?.split(" · ")[0] ?? "—"}
                  </span>
                </Td>
                <Td align="right"><span className="tnum">{num(c)}</span></Td>
                <Td align="right"><span className="tnum">{num(p)}</span></Td>
                <Td align="right">
                  <span className={`tnum ${c - p > 0 ? "text-signal-bad" : "text-ink/35"}`}>
                    {num(c - p)}
                  </span>
                </Td>
                <Td>
                  <Tag tone={result === "ผ่าน" ? "ok" : result === "ส่งซ่อม" ? "warn" : "bad"}>
                    {result}
                  </Tag>
                </Td>
                <Td><span className="text-[12px]">{String(r.fail_reasons ?? "—")}</span></Td>
                <Td>
                  <span className="text-[12px] text-ink/55">
                    {r.wash_test_done ? "ทดสอบแล้ว" : "—"}
                  </span>
                </Td>
                <Td><span className="text-[12px] text-ink/55">{String(r.by_user ?? "—")}</span></Td>
                <Td><span className="text-[12px] text-ink/45">{thDateTime(r.created_at as string)}</span></Td>
              </tr>
            );
          })}
        </Table>
      </Section>

      <Note tone="info" title="ทำไมต้องบันทึกทีละสถานี">
        เพราะรู้ว่าทั้งงานเสียหกตัวแล้วแก้อะไรไม่ได้
        แต่ถ้ารู้ว่าหกตัวนั้นเสียที่สถานีพิมพ์ทั้งหมด และเสียเพราะสีเพี้ยนเหมือนกันทุกตัว
        จะรู้ทันทีว่าต้องไปดูเครื่องไหนและตั้งค่าอะไรใหม่ ตัวเลขจึงต้องละเอียดพอที่จะชี้จุดได้
      </Note>
    </>
  );
}
