import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHead, Section, Stat, Table, Td, Tag, KV, Note, LinkBtn } from "@/components/ui";
import { ModalButton } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { addPayment, issueReceipt, voidInvoice, createCreditNote, extendDueDate } from "@/actions/accounting";
import { requestApproval } from "@/actions/approvals";
import { money, num, thDate, thDateTime } from "@/lib/format";
import { INVOICE_STATUS_TH } from "@/lib/accounting";

export const dynamic = "force-dynamic";

export default async function AccountingPage() {
  const sb = supabaseServer();

  const [{ data: invs }, { data: pays }, { data: rcs }, { data: missing }] = await Promise.all([
    sb.from("invoices_view").select("*").order("issue_date", { ascending: false }),
    sb.from("payments").select("*").order("paid_at", { ascending: false }).limit(30),
    sb.from("receipts_view").select("*").order("issue_date", { ascending: false }).limit(20),
    sb.from("payments_missing_slip").select("*"),
  ]);

  const I = (invs ?? []).filter((i) => i.status !== "Void");
  const outstanding = I.reduce((a, i) => a + Number(i.outstanding ?? 0), 0);
  const overdue = I.filter((i) => Number(i.overdue_days ?? 0) > 0 && Number(i.outstanding ?? 0) > 0);
  const overdueAmt = overdue.reduce((a, i) => a + Number(i.outstanding ?? 0), 0);
  const billed = I.reduce((a, i) => a + Number(i.grand_total ?? 0), 0);
  const collected = billed - outstanding;

  return (
    <>
      <PageHead
        eyebrow="การเงิน"
        title="เก็บเงินและออกเอกสาร"
        lead="เอกสารที่ออกเลขแล้วแก้ไม่ได้ ถ้าผิดต้องยกเลิกแล้วออกใหม่ หรือออกใบลดหนี้"
        right={<LinkBtn href="/docs">ร่างเอกสาร</LinkBtn>}
      />

      <Section title="สถานะเงิน">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="วางบิลไปแล้ว" value={money(billed, 0)} unit="บาท" hint={`${I.length} ใบ`} />
          <Stat label="เก็บได้แล้ว" value={money(collected, 0)} unit="บาท"
                hint={billed > 0 ? `คิดเป็น ${((collected / billed) * 100).toFixed(0)}%` : "—"} />
          <Stat label="ยังเก็บไม่ได้" value={money(outstanding, 0)} unit="บาท"
                tone={outstanding > 0 ? "warn" : undefined} hint="รวมทุกใบที่ยังไม่ครบ" />
          <Stat label="เลยกำหนดชำระ" value={money(overdueAmt, 0)} unit="บาท"
                tone={overdue.length ? "bad" : undefined} hint={`${overdue.length} ใบ`} />
        </div>
      </Section>

      {(missing ?? []).length > 0 && (
        <Section title="ต้องตามให้ครบ">
          <Note tone="bad" title={`${missing?.length} รายการชำระเงินที่ยังไม่มีสลิป`}>
            การรับเงินทุกครั้งต้องมีหลักฐาน ไม่งั้นเวลากระทบยอดกับธนาคารจะหาไม่เจอว่าเงินก้อนไหนคือก้อนไหน
          </Note>
        </Section>
      )}

      {/* ------------------------------------------------------------ ใบวางบิล */}
      <Section title={`ใบวางบิล ${num((invs ?? []).length)} ใบ`}>
        <Table
          head={["เลขที่", "ลูกค้า", "งาน", "ครบกำหนด", "ยอดสุทธิ", "ค้าง", "สถานะ", ""]}
          empty="ยังไม่มีใบวางบิล"
        >
          {(invs ?? []).map((i) => {
            const od = Number(i.overdue_days ?? 0);
            const out = Number(i.outstanding ?? 0);
            return (
              <tr key={i.id} className="border-b border-line-soft last:border-0">
                <Td>
                  <Link href={`/invoices/${i.id}`} className="tnum underline decoration-line-hard underline-offset-4">
                    {i.code}
                  </Link>
                </Td>
                <Td>{i.bill_to_name ?? "—"}</Td>
                <Td>
                  {i.job_code ? (
                    <span className="tnum text-[12px] text-ink/55">{i.job_code}</span>
                  ) : "—"}
                </Td>
                <Td>
                  <span className={od > 0 && out > 0 ? "text-signal-bad" : ""}>
                    {thDate(i.due_date)}
                    {od > 0 && out > 0 && <span className="ml-1 text-[11px]">เลย {od} วัน</span>}
                  </span>
                </Td>
                <Td align="right"><span className="tnum">{money(i.net_payable)}</span></Td>
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
                    {INVOICE_STATUS_TH[i.status] ?? i.status}
                  </Tag>
                </Td>
                <Td align="right">
                  <span className="flex justify-end gap-2">
                    {out > 0 && i.status !== "Void" && i.status !== "Draft" && (
                      <ModalButton label="รับชำระ" title="รับชำระเงิน"
                                   subtitle={`${i.code} · ค้าง ${money(out)} บาท`}>
                        <ActionForm action={addPayment} submitLabel="บันทึกการรับเงิน">
                          <input type="hidden" name="invoice_id" value={i.id} />
                          <div className="grid grid-cols-2 gap-3">
                            <label className="block">
                              <span className="label">ยอดที่รับ</span>
                              <input name="amount" type="number" step="0.01" className="field"
                                     defaultValue={out} required />
                            </label>
                            <label className="block">
                              <span className="label">วิธีชำระ</span>
                              <select name="method" className="field">
                                <option>โอน</option>
                                <option>เงินสด</option>
                                <option>บัตรเครดิต</option>
                                <option>เช็ค</option>
                              </select>
                            </label>
                          </div>
                          <label className="mt-3 block">
                            <span className="label">ลิงก์สลิป</span>
                            <input name="slip_url" className="field" placeholder="https://" />
                          </label>
                          <label className="mt-3 block">
                            <span className="label">เลขอ้างอิง</span>
                            <input name="slip_ref" className="field" />
                          </label>
                          <label className="mt-3 block">
                            <span className="label">ประเภท</span>
                            <select name="type" className="field">
                              <option value="ยอดคงเหลือ">ยอดคงเหลือ</option>
                              <option value="มัดจำ">มัดจำ</option>
                            </select>
                          </label>
                          <p className="mt-2 text-[11px] leading-relaxed text-ink/45">
                            ต้องมีสลิปหรือเลขอ้างอิงอย่างน้อยหนึ่งอย่าง ยกเว้นรับเป็นเงินสด
                          </p>
                        </ActionForm>
                      </ModalButton>
                    )}

                    {out > 0 && i.status !== "Void" && (
                      <ModalButton label="เลื่อนกำหนด" title="เลื่อนกำหนดชำระ"
                                   subtitle={`${i.code} · เดิม ${thDate(i.due_date)}`}>
                        <Note tone="warn" title="เรื่องนี้ต้องได้รับอนุมัติจากเจ้าของ">
                          ระบบจะยอมให้เลื่อนก็ต่อเมื่อมีใบอนุมัติที่ยังใช้ได้
                          ถ้ายังไม่มี ให้ยื่นเรื่องจากแบบฟอร์มด้านล่างก่อน
                        </Note>

                        <div className="mt-4">
                          <p className="label">ถ้ามีใบอนุมัติแล้ว</p>
                          <ActionForm action={extendDueDate} submitLabel="เลื่อนกำหนดชำระ">
                            <input type="hidden" name="invoice_id" value={i.id} />
                            <label className="block">
                              <span className="label">วันครบกำหนดใหม่</span>
                              <input name="due_date" type="date" className="field" required />
                            </label>
                          </ActionForm>
                        </div>

                        <div className="rule mt-5 pt-4">
                          <p className="label">ยังไม่มีใบอนุมัติ ยื่นเรื่องที่นี่</p>
                          <ActionForm action={requestApproval} submitLabel="ยื่นขออนุมัติ">
                            <input type="hidden" name="kind" value="credit_extend" />
                            <input type="hidden" name="target_type" value="invoice" />
                            <input type="hidden" name="target_id" value={i.id} />
                            <input type="hidden" name="target_code" value={i.code} />
                            <input type="hidden" name="title" value={`ขอเลื่อนกำหนดชำระ ${i.code}`} />
                            <input type="hidden" name="amount" value={String(out)} />
                            <label className="mb-3 block">
                              <span className="label">ขอเลื่อนไปเป็นวันที่</span>
                              <input name="p_วันครบกำหนดใหม่" type="date" className="field" />
                            </label>
                            <label className="block">
                              <span className="label">เหตุผล</span>
                              <textarea name="reason" rows={3} className="field" required />
                            </label>
                          </ActionForm>
                        </div>
                      </ModalButton>
                    )}

                    {i.status !== "Void" && (
                      <ModalButton label="ยกเลิก / ลดหนี้" title="ยกเลิกหรือออกใบลดหนี้"
                                   subtitle={i.code} wide>
                        <div className="space-y-5">
                          <div>
                            <p className="label">ยกเลิกทั้งใบ</p>
                            <p className="mb-2 text-[12px] leading-relaxed text-ink/55">
                              ใช้ได้เฉพาะใบที่ยังไม่มีการรับชำระเลย เลขที่เดิมจะยังอยู่ในระบบเพื่อการตรวจสอบ
                            </p>
                            <ActionForm action={voidInvoice} submitLabel="ยกเลิกใบนี้" danger
                                        confirmTitle="ยืนยันยกเลิกใบวางบิล"
                                        confirmText={`ยกเลิก ${i.code} แล้วย้อนกลับไม่ได้ ถ้าต้องการเรียกเก็บใหม่ต้องออกใบใหม่`}>
                              <input type="hidden" name="invoice_id" value={i.id} />
                              <label className="block">
                                <span className="label">เหตุผล</span>
                                <textarea name="reason" rows={2} className="field" required />
                              </label>
                            </ActionForm>
                          </div>

                          <div className="rule pt-4">
                            <p className="label">ออกใบลดหนี้</p>
                            <p className="mb-2 text-[12px] leading-relaxed text-ink/55">
                              ใช้เมื่อเก็บเงินไปแล้วแต่ต้องลดยอด เช่นของมีตำหนิบางส่วน
                            </p>
                            <ActionForm action={createCreditNote} submitLabel="ออกใบลดหนี้">
                              <input type="hidden" name="invoice_id" value={i.id} />
                              <label className="mb-3 block">
                                <span className="label">ยอดที่ลด</span>
                                <input name="amount" type="number" step="0.01" className="field" required />
                              </label>
                              <label className="block">
                                <span className="label">เหตุผล</span>
                                <textarea name="reason" rows={2} className="field" required />
                              </label>
                            </ActionForm>
                          </div>
                        </div>
                      </ModalButton>
                    )}
                  </span>
                </Td>
              </tr>
            );
          })}
        </Table>
      </Section>

      {/* ------------------------------------------------------------ การรับเงิน */}
      <Section title="การรับเงินล่าสุด" hint="กดดูสลิปได้ทุกรายการ">
        <Table head={["เลขที่", "ประเภท", "วิธี", "ยอด", "เมื่อ", "หลักฐาน", ""]} empty="ยังไม่มีการรับเงิน">
          {(pays ?? []).map((p) => (
            <tr key={p.id} className="border-b border-line-soft last:border-0">
              <Td><span className="tnum">{p.code ?? "—"}</span></Td>
              <Td>{p.type}</Td>
              <Td>{p.method}</Td>
              <Td align="right"><span className="tnum">{money(p.amount)}</span></Td>
              <Td>{thDateTime(p.paid_at)}</Td>
              <Td>
                {p.slip_url ? (
                  <ModalButton label="ดูสลิป" title="หลักฐานการชำระเงิน"
                               subtitle={`${p.code ?? ""} · ${money(p.amount)} บาท`}>
                    <div className="divide-y divide-line-soft">
                      <KV k="วิธีชำระ" v={p.method} />
                      <KV k="ยอด" v={`${money(p.amount)} บาท`} mono />
                      <KV k="หัก ณ ที่จ่าย" v={`${money(p.wht_amount)} บาท`} mono />
                      <KV k="รับเมื่อ" v={thDateTime(p.paid_at)} mono />
                      <KV k="ผู้บันทึก" v={p.by_user ?? "—"} />
                      <KV k="เลขอ้างอิง" v={p.slip_ref ?? "—"} mono />
                    </div>
                    <div className="mt-4 border border-line bg-bone-200/50 p-3">
                      <p className="mb-2 text-[11px] uppercase tracking-wide2 text-ink/40">ไฟล์สลิป</p>
                      <a href={p.slip_url} target="_blank" rel="noreferrer"
                         className="break-all text-[12px] underline underline-offset-4">
                        {p.slip_url}
                      </a>
                    </div>
                  </ModalButton>
                ) : p.slip_ref ? (
                  <span className="tnum text-[12px] text-ink/55">{p.slip_ref}</span>
                ) : (
                  <Tag tone="bad">ไม่มีสลิป</Tag>
                )}
              </Td>
              <Td align="right">
                <ModalButton label="ออกใบเสร็จ" title="ออกใบเสร็จรับเงิน"
                             subtitle={`ยอด ${money(p.amount)} บาท`}>
                  <p className="mb-3 leading-relaxed text-ink/70">
                    ใบเสร็จออกได้ครั้งเดียวต่อการรับเงินหนึ่งครั้ง และล็อกทันทีที่ออก
                  </p>
                  <ActionForm action={issueReceipt} submitLabel="ออกใบเสร็จ">
                    <input type="hidden" name="payment_id" value={p.id} />
                    <label className="flex items-center gap-2 text-[13px]">
                      <input type="checkbox" name="is_tax_invoice" className="h-3.5 w-3.5 accent-ink" />
                      ออกเป็นใบกำกับภาษี ใช้เลขชุด TAX แยกต่างหาก
                    </label>
                  </ActionForm>
                </ModalButton>
              </Td>
            </tr>
          ))}
        </Table>
      </Section>

      {/* ------------------------------------------------------------ ใบเสร็จ */}
      <Section title="ใบเสร็จที่ออกไปแล้ว">
        <Table head={["เลขที่", "รับจาก", "ยอดรับ", "วันที่", ""]} empty="ยังไม่ได้ออกใบเสร็จ">
          {(rcs ?? []).map((r) => (
            <tr key={r.id} className="border-b border-line-soft last:border-0">
              <Td>
                <span className="tnum">{r.code}</span>
                {r.is_tax_invoice && <Tag tone="info" className="ml-2">ใบกำกับภาษี</Tag>}
              </Td>
              <Td>{r.received_from ?? "—"}</Td>
              <Td align="right"><span className="tnum">{money(r.net_received)}</span></Td>
              <Td>{thDate(r.issue_date)}</Td>
              <Td align="right">
                <Link href={`/receipts/${r.id}`} className="text-[12px] underline underline-offset-4">
                  เปิดเอกสาร
                </Link>
              </Td>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
