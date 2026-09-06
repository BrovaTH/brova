import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { PageHead, Section, Table, Td, Tag, KV, Note, Stat, statusTone, LinkBtn, Empty } from "@/components/ui";
import { ModalButton } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { StepBar } from "@/components/step-art";
import {
  moveStatus, saveBrief, saveConfirmation, addMockup, approveMockup,
  addQc, addShipment, markDelivered, checkGate,
} from "@/actions/jobs";
import { requestApproval } from "@/actions/approvals";
import { createInvoiceFromJob } from "@/actions/accounting";
import { reserveStock } from "@/actions/purchasing";
import { money, num, thDate, thDateTime, ago, daysBetween, todayISO } from "@/lib/format";
import {
  statusTh, statusPhase, publicStep, nextStatuses, gateFor, isClosed, GATES,
} from "@/lib/workflow";

export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const me = await currentProfile();

  const { data: job } = await sb.from("jobs_view").select("*").eq("id", params.id).maybeSingle();
  if (!job) notFound();

  const [
    { data: logs }, { data: items }, { data: mockups }, { data: qcs },
    { data: pays }, { data: invs }, { data: apvs }, { data: skus },
  ] = await Promise.all([
    sb.from("status_logs").select("*").eq("job_id", job.id).order("created_at", { ascending: false }),
    sb.from("job_items").select("*").eq("job_id", job.id),
    sb.from("mockups").select("*").eq("job_id", job.id).order("rev_no", { ascending: false }),
    sb.from("qc_records").select("*").eq("job_id", job.id).order("created_at", { ascending: false }),
    sb.from("payments").select("*").eq("job_id", job.id).order("paid_at", { ascending: false }),
    sb.from("invoices_view").select("*").eq("job_id", job.id).order("issue_date", { ascending: false }),
    sb.from("approvals_view").select("*").eq("target_id", job.id).order("requested_at", { ascending: false }),
    sb.from("skus_view").select("code, fabric_name, color_name, size, qty_available").gt("qty_available", 0).limit(80),
  ]);

  const moves = nextStatuses(job.status);
  const late = job.due_date && !isClosed(job.status) ? daysBetween(todayISO(), job.due_date) : 0;
  const canSeeCost = me?.can_see_cost === true;

  // ตรวจประตูของทุกปลายทางที่ไปได้ เพื่อบอกล่วงหน้าว่าจะติดอะไร
  const gateResults = await Promise.all(
    moves.map(async (m) => {
      const g = gateFor(m.code);
      if (!g) return { code: m.code, gate: null, pass: true, why: "" };
      const r = await checkGate(g.id, job.id);
      return { code: m.code, gate: g, pass: r.pass, why: r.why };
    }),
  );
  const gateOf = Object.fromEntries(gateResults.map((g) => [g.code, g]));

  const trackUrl = `/track/${job.track_token}`;

  return (
    <>
      <PageHead
        eyebrow={`ใบงาน · ${statusPhase(job.status)}`}
        title={job.title}
        lead={`${job.code} · ${job.customer_name ?? "ยังไม่ระบุลูกค้า"}`}
        right={
          <>
            <LinkBtn href={trackUrl} target="_blank">เปิดหน้าที่ลูกค้าเห็น</LinkBtn>
            <LinkBtn href="/jobs">กลับรายการงาน</LinkBtn>
          </>
        }
      />

      {/* ------------------------------------------------------------ แถบขั้น */}
      <div className="card mb-7 px-5 py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Tag tone={statusTone(job.status)}>{statusTh(job.status)}</Tag>
          <span className="text-[12px] text-ink/45">
            ลูกค้าเห็นเป็นขั้นที่ {publicStep(job.status)} จาก 7
          </span>
        </div>
        <StepBar current={publicStep(job.status)} />
      </div>

      {job.hold_reason && job.status === "97" && (
        <div className="mb-6">
          <Note tone="bad" title="งานนี้ถูกพักไว้">{job.hold_reason}</Note>
        </div>
      )}
      {job.cancel_reason && job.status === "98" && (
        <div className="mb-6">
          <Note tone="mute" title="งานนี้ถูกยกเลิก">{job.cancel_reason}</Note>
        </div>
      )}

      {/* ------------------------------------------------------------ ตัวเลข */}
      <Section title="ตัวเลขของงานนี้">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="ยอดงาน" value={money(job.total_amount, 0)} unit="บาท"
                hint={`${num(job.qty_total)} ตัว`} />
          <Stat label="รับเงินแล้ว" value={money(job.paid_amount, 0)} unit="บาท"
                hint={Number(job.outstanding ?? 0) > 0 ? `ค้าง ${money(job.outstanding, 0)} บาท` : "เก็บครบแล้ว"}
                tone={Number(job.outstanding ?? 0) > 0 ? "warn" : undefined} />
          <Stat label="กำหนดส่ง" value={job.due_date ? thDate(job.due_date) : "—"}
                hint={late > 0 ? `เลยมาแล้ว ${late} วัน` : "ยังอยู่ในกำหนด"}
                tone={late > 0 ? "bad" : undefined} />
          {canSeeCost ? (
            <Stat label="กำไรขั้นต้น" value={money(job.gross_profit, 0)} unit="บาท"
                  hint={`อัตรา ${Number(job.gross_margin_pct ?? 0).toFixed(1)}%`} />
          ) : (
            <Stat label="แก้แบบไปแล้ว" value={num(job.revision_count)} unit="ครั้ง"
                  hint="เกินสองครั้งควรคิดเงินเพิ่ม" />
          )}
        </div>
      </Section>

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div>
          {/* -------------------------------------------------- ย้ายสถานะ */}
          {!isClosed(job.status) && (
            <Section
              title="ขั้นถัดไป"
              hint="ประตูที่ติดจะบอกไว้ตรงปุ่ม กดเข้าไปดูได้ว่าติดเพราะอะไร"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {moves.map((m) => {
                  const g = gateOf[m.code];
                  const blocked = g?.gate && !g.pass;
                  return (
                    <div
                      key={m.code}
                      className={`card p-4 ${blocked ? "border-signal-warn/40 bg-signal-warnbg/30" : ""}`}
                    >
                      <p className="text-[14px] font-medium">{m.th}</p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-ink/55">{m.hint}</p>

                      {g?.gate && (
                        <p
                          className={`mt-2 text-[11px] leading-relaxed ${
                            g.pass ? "text-signal-ok" : "text-signal-warn"
                          }`}
                        >
                          {g.gate.id} {g.gate.th} — {g.why}
                        </p>
                      )}

                      <div className="mt-3">
                        <ModalButton
                          variant={blocked ? "ghost" : "solid"}
                          label={blocked ? "ดูว่าติดอะไร" : `ย้ายไป ${m.th}`}
                          title={`ย้ายไป ${m.th}`}
                          subtitle={`${job.code} · จาก ${statusTh(job.status)}`}
                        >
                          {blocked && g?.gate ? (
                            <div className="space-y-4">
                              <Note tone="warn" title={`ติดประตู ${g.gate.id} ${g.gate.th}`}>
                                {g.why}
                                <span className="mt-2 block text-ink/70">
                                  เหตุผลของประตูนี้คือ {g.gate.why}
                                </span>
                              </Note>

                              {g.gate.overridable ? (
                                <>
                                  <p className="leading-relaxed">
                                    ถ้าจำเป็นต้องข้ามจริง ต้องให้เจ้าของอนุมัติก่อน
                                    ระบบจะปลดล็อกให้ทำได้ครั้งเดียว
                                  </p>
                                  <ActionForm action={requestApproval} submitLabel="ยื่นขออนุมัติข้ามประตู">
                                    <input type="hidden" name="kind"
                                           value={m.code === "85" ? "ship_unpaid" : "gate_skip"} />
                                    <input type="hidden" name="target_type" value="job" />
                                    <input type="hidden" name="target_id" value={job.id} />
                                    <input type="hidden" name="target_code" value={job.code} />
                                    <input type="hidden" name="title"
                                           value={`ขอข้ามประตู ${g.gate.id} ${g.gate.th} ของงาน ${job.code}`} />
                                    <input type="hidden" name="p_ประตู" value={`${g.gate.id} ${g.gate.th}`} />
                                    <input type="hidden" name="p_ปลายทาง" value={m.th} />
                                    <input type="hidden" name="amount"
                                           value={m.code === "85" ? String(job.outstanding ?? 0) : ""} />
                                    <label className="block">
                                      <span className="label">เหตุผลที่ต้องข้าม</span>
                                      <textarea name="reason" rows={4} className="field" required
                                                placeholder="เขียนให้เจ้าของเห็นภาพว่าถ้าไม่ข้ามจะเกิดอะไรขึ้น" />
                                    </label>
                                  </ActionForm>
                                </>
                              ) : (
                                <Note tone="bad" title="ประตูนี้ข้ามไม่ได้">
                                  ไม่ว่าใครก็ข้ามไม่ได้ รวมถึงเจ้าของ ต้องทำให้ผ่านเงื่อนไขจริงก่อน
                                </Note>
                              )}
                            </div>
                          ) : (
                            <ActionForm action={moveStatus} submitLabel={`ยืนยันย้ายไป ${m.th}`}>
                              <input type="hidden" name="job_id" value={job.id} />
                              <input type="hidden" name="to" value={m.code} />
                              {m.code === "97" && (
                                <label className="mb-3 block">
                                  <span className="label">พักเพราะอะไร</span>
                                  <textarea name="hold_reason" rows={3} className="field" required />
                                </label>
                              )}
                              {m.code === "98" && (
                                <>
                                  <Note tone="warn" title="ยกเลิกงานต้องมีใบอนุมัติจากเจ้าของ">
                                    ถ้ายังไม่มีใบอนุมัติที่ใช้ได้ ระบบจะไม่ให้ยกเลิก
                                  </Note>
                                  <label className="mb-3 mt-3 block">
                                    <span className="label">ยกเลิกเพราะอะไร</span>
                                    <textarea name="cancel_reason" rows={3} className="field" required />
                                  </label>
                                </>
                              )}
                              <label className="block">
                                <span className="label">บันทึกเพิ่มเติม (ถ้ามี)</span>
                                <input name="note" className="field" />
                              </label>
                            </ActionForm>
                          )}
                        </ModalButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* -------------------------------------------------- ประตูทั้งแปด */}
          <Section title="ประตูทั้งแปดของงานนี้" hint="สรุปว่าตอนนี้ผ่านอะไรไปแล้วบ้าง">
            <div className="card divide-y divide-line-soft">
              {await Promise.all(
                GATES.map(async (g) => {
                  const r = await checkGate(g.id, job.id);
                  return (
                    <div key={g.id} className="flex items-start gap-3 px-4 py-3">
                      <span
                        className={`mt-0.5 h-3 w-3 shrink-0 ${
                          r.pass ? "bg-signal-ok" : "bg-bone-300"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px]">
                          <span className="tnum mr-2 text-ink/40">{g.id}</span>
                          {g.th}
                          {!g.overridable && (
                            <Tag tone="bad" className="ml-2">ข้ามไม่ได้</Tag>
                          )}
                        </p>
                        <p className={`text-[12px] ${r.pass ? "text-ink/45" : "text-signal-warn"}`}>
                          {r.why}
                        </p>
                      </div>
                    </div>
                  );
                }),
              )}
            </div>
          </Section>

          {/* -------------------------------------------------- รายการในงาน */}
          <Section title="รายการในงาน">
            <Table
              head={["รายการ", "งานพิมพ์", "S", "M", "L", "XL", "2XL", "3XL", "รวมตัว", "ราคา/ตัว", "รวมเงิน"]}
              empty="ยังไม่ได้ใส่รายการ"
            >
              {(items ?? []).map((it) => {
                const q = [it.qty_s, it.qty_m, it.qty_l, it.qty_xl, it.qty_2xl, it.qty_3xl].map(
                  (x) => Number(x ?? 0),
                );
                const total = q.reduce((a, b) => a + b, 0);
                return (
                  <tr key={it.id} className="border-b border-line-soft last:border-0">
                    <Td>{it.description ?? it.sku_code ?? "—"}</Td>
                    <Td>
                      <span className="text-[12px] text-ink/55">
                        {it.technique ?? "—"}
                        {it.colors ? ` · ${it.colors} สี` : ""}
                      </span>
                    </Td>
                    {q.map((x, k) => (
                      <Td key={k} align="right">
                        <span className={`tnum ${x === 0 ? "text-ink/25" : ""}`}>{x || "—"}</span>
                      </Td>
                    ))}
                    <Td align="right"><span className="tnum">{num(total)}</span></Td>
                    <Td align="right"><span className="tnum">{money(it.unit_price)}</span></Td>
                    <Td align="right"><span className="tnum">{money(total * Number(it.unit_price))}</span></Td>
                  </tr>
                );
              })}
            </Table>
          </Section>

          {/* -------------------------------------------------- ไทม์ไลน์ */}
          <Section
            title="ประวัติงาน"
            hint="ทุกการเปลี่ยนสถานะถูกบันทึกไว้ ลบไม่ได้"
            right={
              <ModalButton
                label={`ดูทั้งหมด ${logs?.length ?? 0} รายการ`}
                title="ประวัติงานฉบับเต็ม"
                subtitle={`${job.code} · ${job.title}`}
                wide
              >
                <ol className="space-y-3">
                  {(logs ?? []).map((l) => (
                    <li key={l.id} className="border-l-2 border-line pl-3">
                      <p className="text-[12px] text-ink/40">
                        {thDateTime(l.created_at)} · {l.by_user ?? "ระบบ"}
                      </p>
                      <p className="text-[13px]">
                        {l.from_status && l.from_status !== l.to_status ? (
                          <>
                            {statusTh(l.from_status)} <span className="text-ink/35">→</span>{" "}
                            {statusTh(l.to_status)}
                          </>
                        ) : (
                          statusTh(l.to_status)
                        )}
                        {l.gate_passed && (
                          <Tag tone="ok" className="ml-2">ผ่าน {l.gate_passed}</Tag>
                        )}
                        {l.gate_override && (
                          <Tag tone="warn" className="ml-2">ข้าม {l.gate_override}</Tag>
                        )}
                      </p>
                      {l.note && <p className="text-[12px] leading-relaxed text-ink/60">{l.note}</p>}
                    </li>
                  ))}
                </ol>
              </ModalButton>
            }
          >
            <ol className="card divide-y divide-line-soft">
              {(logs ?? []).slice(0, 6).map((l) => (
                <li key={l.id} className="flex gap-3 px-4 py-2.5">
                  <span className="w-28 shrink-0 text-[11px] text-ink/40">{ago(l.created_at)}</span>
                  <span className="min-w-0 flex-1 text-[13px]">
                    {statusTh(l.to_status)}
                    {l.note && <span className="block text-[12px] text-ink/55">{l.note}</span>}
                  </span>
                  <span className="shrink-0 text-[11px] text-ink/40">{l.by_user ?? "ระบบ"}</span>
                </li>
              ))}
              {(logs ?? []).length === 0 && (
                <li className="px-4 py-8 text-center text-[13px] text-ink/40">ยังไม่มีประวัติ</li>
              )}
            </ol>
          </Section>
        </div>

        {/* ------------------------------------------------------------ คอลัมน์ขวา */}
        <div className="space-y-7">
          {/* โจทย์สามข้อ */}
          <Section title="โจทย์สามข้อ" hint="ประตู G1 ดูตรงนี้">
            <div className="card p-4">
              <ActionForm action={saveBrief} submitLabel="บันทึกโจทย์">
                <input type="hidden" name="job_id" value={job.id} />
                <label className="mb-3 block">
                  <span className="label">ใครใส่</span>
                  <input name="brief_who" className="field" defaultValue={job.brief_who ?? ""}
                         placeholder="เช่น พนักงานหน้าร้าน อายุ 20–35" />
                </label>
                <label className="mb-3 block">
                  <span className="label">ใส่ที่ไหน</span>
                  <input name="brief_where" className="field" defaultValue={job.brief_where ?? ""}
                         placeholder="เช่น ในร้านติดแอร์ ออกไปข้างนอกบ้าง" />
                </label>
                <label className="mb-3 block">
                  <span className="label">ใส่นานแค่ไหน</span>
                  <input name="brief_duration" className="field" defaultValue={job.brief_duration ?? ""}
                         placeholder="เช่น ใส่ทุกวัน ซักบ่อย ต้องอยู่ได้เป็นปี" />
                </label>
                <label className="block">
                  <span className="label">รายละเอียดสินค้า</span>
                  <textarea name="item_description" rows={3} className="field"
                            defaultValue={job.item_description ?? ""} />
                </label>
              </ActionForm>
            </div>
          </Section>

          {/* หลักฐานยืนยัน */}
          <Section title="หลักฐานที่ลูกค้าตกลง" hint="ประตู G2 ดูตรงนี้">
            <div className="card p-4">
              {job.confirmed_at && (
                <p className="mb-3 border border-signal-ok/25 bg-signal-okbg px-3 py-2 text-[12px] text-signal-ok">
                  ยืนยันแล้วโดย {job.confirmed_by} เมื่อ {thDateTime(job.confirmed_at)}
                </p>
              )}
              <ActionForm action={saveConfirmation} submitLabel="บันทึกหลักฐาน">
                <input type="hidden" name="job_id" value={job.id} />
                <label className="mb-3 block">
                  <span className="label">ใครเป็นคนยืนยัน</span>
                  <input name="confirmed_by" className="field" defaultValue={job.confirmed_by ?? ""} />
                </label>
                <label className="block">
                  <span className="label">หลักฐาน</span>
                  <textarea name="confirm_evidence" rows={3} className="field"
                            defaultValue={job.confirm_evidence ?? ""}
                            placeholder="วางข้อความที่ลูกค้าตอบกลับ หรือลิงก์ไฟล์" />
                </label>
              </ActionForm>
            </div>
          </Section>

          {/* แบบร่าง */}
          <Section title="แบบร่าง" hint="ประตู G4 ดูตรงนี้">
            <div className="card divide-y divide-line-soft">
              {(mockups ?? []).map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="tnum w-12 shrink-0 text-[12px] text-ink/45">รอบ {m.rev_no}</span>
                  <span className="min-w-0 flex-1 text-[12px]">
                    {m.note ?? "—"}
                    {m.size_cm && <span className="block text-ink/45">ขนาด {m.size_cm}</span>}
                  </span>
                  {m.approved ? (
                    <Tag tone="ok">เคาะแล้ว</Tag>
                  ) : (
                    <ActionForm action={approveMockup} submitLabel="ลูกค้าเคาะแล้ว" compact
                                className="shrink-0">
                      <input type="hidden" name="mockup_id" value={m.id} />
                      <input type="hidden" name="job_id" value={job.id} />
                    </ActionForm>
                  )}
                </div>
              ))}
              {(mockups ?? []).length === 0 && (
                <p className="px-4 py-6 text-center text-[12px] text-ink/40">ยังไม่มีแบบร่าง</p>
              )}
              <div className="p-4">
                <ModalButton variant="ghost" label="เพิ่มรอบแก้แบบ" title="เพิ่มแบบร่าง"
                             subtitle={`${job.code} · แก้มาแล้ว ${job.revision_count} ครั้ง`}>
                  {job.revision_count >= 2 && (
                    <Note tone="warn" title="แก้เกินสองรอบแล้ว">
                      รอบถัดไปควรคิดค่าแก้แบบเพิ่ม ไม่งั้นกำไรงานนี้จะหายไปกับเวลาออกแบบ
                    </Note>
                  )}
                  <div className="mt-3">
                    <ActionForm action={addMockup} submitLabel="บันทึกแบบร่าง">
                      <input type="hidden" name="job_id" value={job.id} />
                      <label className="mb-3 block">
                        <span className="label">ลิงก์ไฟล์แบบ</span>
                        <input name="file_url" className="field" placeholder="https://" />
                      </label>
                      <label className="mb-3 block">
                        <span className="label">ขนาดงานพิมพ์</span>
                        <input name="size_cm" className="field" placeholder="เช่น 25 × 30 ซม." />
                      </label>
                      <label className="block">
                        <span className="label">บันทึก</span>
                        <textarea name="note" rows={3} className="field" />
                      </label>
                    </ActionForm>
                  </div>
                </ModalButton>
              </div>
            </div>
          </Section>

          {/* จองผ้า */}
          <Section title="จองผ้า" hint="ประตู G5 ดูตรงนี้">
            <div className="card p-4">
              <ActionForm action={reserveStock} submitLabel="จองผ้าให้งานนี้">
                <input type="hidden" name="job_code" value={job.code} />
                <label className="mb-3 block">
                  <span className="label">รหัสสินค้า</span>
                  <select name="sku_code" className="field">
                    {(skus ?? []).map((k) => (
                      <option key={k.code} value={k.code}>
                        {k.code} · {k.fabric_name} {k.color_name} {k.size} · ว่าง {k.qty_available}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label">จำนวนที่จอง</span>
                  <input name="qty" type="number" min={1} className="field" defaultValue={job.qty_total || 1} />
                </label>
              </ActionForm>
            </div>
          </Section>

          {/* ตรวจคุณภาพ */}
          <Section title="ผลตรวจคุณภาพ" hint="ประตู G6 ดูตรงนี้ · ประตูนี้ข้ามไม่ได้">
            <div className="card divide-y divide-line-soft">
              {(qcs ?? []).map((q) => (
                <div key={q.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <Tag tone={q.result === "ผ่าน" ? "ok" : q.result === "ส่งซ่อม" ? "warn" : "bad"}>
                      {q.result}
                    </Tag>
                    <span className="tnum text-[12px] text-ink/50">
                      ตรวจ {q.checked_qty} ผ่าน {q.pass_qty}
                    </span>
                  </div>
                  {q.fail_reasons && (
                    <p className="mt-1 text-[12px] leading-relaxed text-ink/60">{q.fail_reasons}</p>
                  )}
                  <p className="mt-1 text-[11px] text-ink/35">
                    {thDateTime(q.created_at)} · {q.by_user ?? "—"}
                  </p>
                </div>
              ))}
              {(qcs ?? []).length === 0 && (
                <p className="px-4 py-6 text-center text-[12px] text-ink/40">ยังไม่มีผลตรวจ</p>
              )}
              <div className="p-4">
                <ModalButton variant="ghost" label="บันทึกผลตรวจ" title="บันทึกผลตรวจคุณภาพ"
                             subtitle={job.code}>
                  <ActionForm action={addQc} submitLabel="บันทึกผลตรวจ">
                    <input type="hidden" name="job_id" value={job.id} />
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="label">จำนวนที่ตรวจ</span>
                        <input name="checked_qty" type="number" min={1} className="field" required />
                      </label>
                      <label className="block">
                        <span className="label">จำนวนที่ผ่าน</span>
                        <input name="pass_qty" type="number" min={0} className="field" required />
                      </label>
                    </div>
                    <label className="mt-3 block">
                      <span className="label">สาเหตุที่ไม่ผ่าน (ถ้ามี)</span>
                      <textarea name="fail_reasons" rows={3} className="field" />
                    </label>
                    <label className="mt-3 flex items-center gap-2 text-[13px]">
                      <input type="checkbox" name="wash_test_done" className="h-3.5 w-3.5 accent-ink" />
                      ทดสอบการซักแล้ว
                    </label>
                    <p className="mt-2 text-[11px] leading-relaxed text-ink/45">
                      ผ่านทุกตัวจะบันทึกเป็นผ่าน · ผ่านตั้งแต่ 90% ขึ้นไปเป็นส่งซ่อม · ต่ำกว่านั้นเป็นไม่ผ่าน
                    </p>
                  </ActionForm>
                </ModalButton>
              </div>
            </div>
          </Section>

          {/* จัดส่ง */}
          <Section title="การจัดส่ง" hint="ประตู G8 ดูตรงนี้">
            <div className="card p-4">
              {job.tracking_no ? (
                <div className="divide-y divide-line-soft">
                  <KV k="ขนส่ง" v={job.carrier ?? "—"} />
                  <KV k="เลขพัสดุ" v={job.tracking_no} mono />
                  <KV k="จำนวนกล่อง" v={num(job.boxes)} mono />
                  <KV k="ส่งเมื่อ" v={thDateTime(job.shipped_at)} mono />
                  <KV k="ถึงเมื่อ" v={job.delivered_at ? thDateTime(job.delivered_at) : "ยังไม่ยืนยัน"} mono />
                </div>
              ) : (
                <p className="mb-3 text-[12px] text-ink/45">ยังไม่มีข้อมูลการส่ง</p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <ModalButton variant="ghost" label="บันทึกการส่ง" title="บันทึกการจัดส่ง"
                             subtitle={job.code}>
                  <ActionForm action={addShipment} submitLabel="บันทึกการส่ง">
                    <input type="hidden" name="job_id" value={job.id} />
                    <label className="mb-3 block">
                      <span className="label">ขนส่ง</span>
                      <input name="carrier" className="field" required placeholder="เช่น Kerry, Flash, ส่งเอง" />
                    </label>
                    <label className="mb-3 block">
                      <span className="label">เลขพัสดุ</span>
                      <input name="tracking_no" className="field" />
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      <label className="block">
                        <span className="label">กล่อง</span>
                        <input name="boxes" type="number" min={1} defaultValue={1} className="field" />
                      </label>
                      <label className="block">
                        <span className="label">น้ำหนัก (กก.)</span>
                        <input name="weight_kg" type="number" step="0.1" className="field" />
                      </label>
                      <label className="block">
                        <span className="label">ค่าส่ง</span>
                        <input name="cost" type="number" className="field" defaultValue={0} />
                      </label>
                    </div>
                    <label className="mt-3 block">
                      <span className="label">ลิงก์รูปตอนส่ง</span>
                      <input name="photo_url" className="field" placeholder="https://" />
                    </label>
                    <p className="mt-2 text-[11px] leading-relaxed text-ink/45">
                      ต้องมีเลขพัสดุหรือรูปอย่างน้อยหนึ่งอย่าง ไว้ยืนยันกับลูกค้าถ้ามีปัญหา
                    </p>
                  </ActionForm>
                </ModalButton>

                {job.shipped_at && !job.delivered_at && (
                  <ActionForm action={markDelivered} submitLabel="ลูกค้ารับของแล้ว" compact>
                    <input type="hidden" name="job_id" value={job.id} />
                  </ActionForm>
                )}
              </div>
            </div>
          </Section>

          {/* การเงินของงาน */}
          <Section title="การเงินของงานนี้">
            <div className="card divide-y divide-line-soft">
              {(invs ?? []).map((i) => (
                <div key={i.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/invoices/${i.id}`} className="tnum text-[13px] underline decoration-line-hard underline-offset-4">
                      {i.code}
                    </Link>
                    <span className="tnum text-[13px]">{money(i.net_payable)}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink/45">
                    {i.type} · ครบกำหนด {thDate(i.due_date)} ·{" "}
                    {Number(i.outstanding ?? 0) > 0 ? (
                      <span className="text-signal-warn">ค้าง {money(i.outstanding, 0)}</span>
                    ) : (
                      <span className="text-signal-ok">ชำระครบ</span>
                    )}
                  </p>
                </div>
              ))}
              {(invs ?? []).length === 0 && (
                <p className="px-4 py-6 text-center text-[12px] text-ink/40">ยังไม่ได้วางบิล</p>
              )}

              {(pays ?? []).map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-[12px] text-ink/50">{p.type}</span>
                  <span className="tnum ml-auto text-[13px]">{money(p.amount)}</span>
                  {p.slip_url ? (
                    <ModalButton label="ดูสลิป" title="สลิปการโอนเงิน"
                                 subtitle={`${p.code} · ${money(p.amount)} บาท`}>
                      <div className="space-y-3">
                        <KV k="วิธีชำระ" v={p.method} />
                        <KV k="ยอด" v={`${money(p.amount)} บาท`} mono />
                        <KV k="เมื่อ" v={thDateTime(p.paid_at)} mono />
                        <KV k="เลขอ้างอิง" v={p.slip_ref ?? "—"} mono />
                        <div className="border border-line bg-bone-200/50 p-3">
                          <p className="mb-2 text-[11px] uppercase tracking-wide2 text-ink/40">ไฟล์สลิป</p>
                          <a href={p.slip_url} target="_blank" rel="noreferrer"
                             className="break-all text-[12px] underline underline-offset-4">
                            {p.slip_url}
                          </a>
                        </div>
                      </div>
                    </ModalButton>
                  ) : (
                    <span className="text-[11px] text-signal-warn">ไม่มีสลิป</span>
                  )}
                </div>
              ))}

              <div className="p-4">
                <ModalButton variant="ghost" label="ออกใบวางบิล" title="ออกใบวางบิลจากงานนี้"
                             subtitle={`${job.code} · ${job.customer_name ?? ""}`}>
                  <ActionForm action={createInvoiceFromJob} submitLabel="ออกใบวางบิล">
                    <input type="hidden" name="job_id" value={job.id} />
                    <label className="mb-3 block">
                      <span className="label">ประเภท</span>
                      <select name="type" className="field">
                        <option value="มัดจำ">มัดจำ</option>
                        <option value="ยอดคงเหลือ">ยอดคงเหลือ</option>
                        <option value="เต็มจำนวน">เต็มจำนวน</option>
                      </select>
                    </label>
                    <label className="mb-3 block">
                      <span className="label">ยอดก่อนภาษี</span>
                      <input name="amount" type="number" step="0.01" className="field" required
                             defaultValue={Number(job.outstanding ?? job.total_amount ?? 0)} />
                    </label>
                    <label className="flex items-center gap-2 text-[13px]">
                      <input type="checkbox" name="vat" className="h-3.5 w-3.5 accent-ink" />
                      คิดภาษีมูลค่าเพิ่ม 7%
                    </label>
                    <p className="mt-2 text-[11px] leading-relaxed text-ink/45">
                      ถ้าลูกค้าเป็นนิติบุคคล ระบบจะหักภาษี ณ ที่จ่าย 3% จากยอดก่อนภาษีให้อัตโนมัติ
                    </p>
                  </ActionForm>
                </ModalButton>
              </div>
            </div>
          </Section>

          {/* ใบขออนุมัติของงานนี้ */}
          {(apvs ?? []).length > 0 && (
            <Section title="ใบขออนุมัติที่เกี่ยวกับงานนี้">
              <div className="card divide-y divide-line-soft">
                {(apvs ?? []).map((a) => (
                  <div key={a.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="tnum text-[11px] text-ink/40">{a.code}</span>
                      <Tag tone={a.status === "approved" || a.status === "used" ? "ok" : a.status === "rejected" ? "bad" : "warn"}>
                        {a.status_th}
                      </Tag>
                    </div>
                    <p className="mt-1 text-[13px] leading-snug">{a.title}</p>
                    {a.decision_note && (
                      <p className="mt-1 text-[12px] leading-relaxed text-ink/55">{a.decision_note}</p>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
