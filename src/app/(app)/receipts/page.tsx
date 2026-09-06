import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHead, Section, Stat, Table, Td, Tag, Note, LinkBtn, KV } from "@/components/ui";
import { ModalButton } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { issueReceipt } from "@/actions/accounting";
import { money, num, thDate, thDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

// ============================================================================
// หน้าใบเสร็จรับเงิน
//
// ใบเสร็จออกได้ครั้งเดียวต่อการรับเงินหนึ่งครั้ง และล็อกทันทีที่ออก
// เพราะใบนี้คือหลักฐานทางภาษีของทั้งสองฝ่าย ถ้าออกซ้ำหรือแก้ย้อนหลังได้
// ยอดที่ลูกค้ายื่นภาษีกับยอดที่เรายื่นจะไม่ตรงกัน
//
// ส่วนบนของหน้าคือรายการรับเงินที่ยังไม่ได้ออกใบเสร็จ ซึ่งเป็นงานค้างที่แท้จริง
// เพราะเงินเข้าบัญชีแล้วแต่ลูกค้ายังไม่มีหลักฐานไปลงบัญชี
// ============================================================================

export default async function ReceiptsPage() {
  const sb = supabaseServer();
  const [{ data: rcs }, { data: pays }] = await Promise.all([
    sb.from("receipts_view").select("*").not("code", "is", null)
      .order("issue_date", { ascending: false }),
    sb.from("payments").select("*").order("paid_at", { ascending: false }),
  ]);

  const R = rcs ?? [];
  const P = pays ?? [];

  // รับเงินที่นับเป็นรายรับจริง ไม่รวมคืนเงินและค่าปรับ
  const moneyIn = P.filter((p) => p.type === "มัดจำ" || p.type === "ยอดคงเหลือ");
  const done = new Set(R.map((r) => String(r.payment_id ?? "")));
  const pending = moneyIn.filter((p) => !done.has(String(p.id)));

  const received = R.reduce((a, r) => a + Number(r.net_received ?? 0), 0);
  const wht = R.reduce((a, r) => a + Number(r.wht_amount ?? 0), 0);
  const taxInv = R.filter((r) => r.is_tax_invoice);

  // ใบที่หักภาษี ณ ที่จ่ายไว้แต่ยังไม่ได้หนังสือรับรองกลับมา
  // ต้องตามเก็บ เพราะตอนยื่นภาษีต้องใช้ตัวจริงเป็นหลักฐาน
  const waitWht = R.filter((r) => Number(r.wht_amount ?? 0) > 0 && !r.wht_cert_received);

  return (
    <>
      <PageHead
        eyebrow="ใบเสร็จรับเงิน"
        title="RECEIPTS"
        lead="ออกให้ลูกค้าหลังเงินเข้าจริง ออกได้ครั้งเดียวต่อการรับเงินหนึ่งครั้ง และล็อกทันทีที่ออก"
        right={<LinkBtn href="/accounting">ไปหน้าการเงินภาพรวม</LinkBtn>}
      />

      <Section title="ตัวเลขรวม" hint="นับจากใบเสร็จที่ออกเลขแล้วทั้งหมด">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="ออกใบเสร็จแล้ว" value={num(R.length)} unit="ใบ"
                hint={`ในนั้นเป็นใบกำกับภาษี ${taxInv.length} ใบ`} />
          <Stat label="รับเงินจริงรวม" value={money(received, 0)} unit="บาท"
                hint="ยอดหลังหักภาษี ณ ที่จ่ายแล้ว" />
          <Stat label="ถูกหัก ณ ที่จ่ายไว้" value={money(wht, 0)} unit="บาท"
                hint={`รอหนังสือรับรองอีก ${waitWht.length} ใบ`}
                tone={waitWht.length > 0 ? "warn" : undefined} />
          <Stat label="รับเงินแล้วยังไม่ออกใบเสร็จ" value={num(pending.length)} unit="รายการ"
                tone={pending.length > 0 ? "bad" : undefined}
                hint="เงินเข้าแล้วแต่ลูกค้ายังไม่มีหลักฐาน" />
        </div>
      </Section>

      {pending.length > 0 && (
        <Section
          title="รับเงินแล้วแต่ยังไม่ออกใบเสร็จ"
          hint="ออกให้ครบก่อนสิ้นเดือน ลูกค้าต้องใช้ใบนี้ลงบัญชีของเขา"
        >
          <Table head={["เลขรับเงิน", "ประเภท", "วิธี", "ยอด", "รับเมื่อ", "หลักฐาน", ""]}>
            {pending.map((p) => (
              <tr key={String(p.id)} className="border-b border-line-soft last:border-0">
                <Td><span className="tnum">{String(p.code ?? "—")}</span></Td>
                <Td>{String(p.type)}</Td>
                <Td>{String(p.method)}</Td>
                <Td align="right"><span className="tnum">{money(Number(p.amount ?? 0))}</span></Td>
                <Td>{thDateTime(p.paid_at as string)}</Td>
                <Td>
                  {p.slip_url ? (
                    <a href={String(p.slip_url)} target="_blank" rel="noreferrer"
                       className="text-[12px] underline underline-offset-4">ดูสลิป</a>
                  ) : p.slip_ref ? (
                    <span className="tnum text-[12px] text-ink/55">{String(p.slip_ref)}</span>
                  ) : (
                    <Tag tone="bad">ไม่มีสลิป</Tag>
                  )}
                </Td>
                <Td align="right">
                  <ModalButton label="ออกใบเสร็จ" title="ออกใบเสร็จรับเงิน"
                               subtitle={`ยอด ${money(Number(p.amount ?? 0))} บาท`}>
                    <p className="mb-3 leading-relaxed text-ink/70">
                      ใบเสร็จออกได้ครั้งเดียวต่อการรับเงินหนึ่งครั้ง และล็อกทันทีที่ออก
                      ตรวจยอดให้แน่ใจก่อนกด
                    </p>
                    <ActionForm action={issueReceipt} submitLabel="ออกใบเสร็จ">
                      <input type="hidden" name="payment_id" value={String(p.id)} />
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
      )}

      {waitWht.length > 0 && (
        <Section
          title="รอหนังสือรับรองหัก ณ ที่จ่าย"
          hint="ตามจากลูกค้าให้ครบ ตอนยื่นภาษีต้องใช้ตัวจริงเป็นหลักฐาน"
        >
          <Table head={["เลขที่", "ผู้จ่าย", "วันที่", "ยอดที่ถูกหัก", ""]}>
            {waitWht.map((r) => (
              <tr key={String(r.id)} className="border-b border-line-soft last:border-0">
                <Td><span className="tnum">{String(r.code)}</span></Td>
                <Td>{String(r.customer_name ?? r.received_from ?? "—")}</Td>
                <Td>{thDate(r.issue_date as string)}</Td>
                <Td align="right">
                  <span className="tnum text-signal-warn">{money(Number(r.wht_amount ?? 0))}</span>
                </Td>
                <Td align="right">
                  <Link href={`/docs/receipt/${r.id}`} className="text-[12px] underline underline-offset-4">
                    เปิดเอกสาร
                  </Link>
                </Td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      <Section title={`ใบเสร็จทั้งหมด ${num(R.length)} ใบ`} hint="เรียงจากใบใหม่สุด">
        <Table head={["เลขที่", "อ้างถึงบิล", "งาน", "ผู้จ่าย", "วันที่", "ยอดรับจริง", ""]}
               empty="ยังไม่ได้ออกใบเสร็จ">
          {R.map((r) => (
            <tr key={String(r.id)} className="border-b border-line-soft last:border-0">
              <Td>
                <span className="tnum">{String(r.code)}</span>
                {r.is_tax_invoice && <Tag tone="info" className="ml-2">ใบกำกับภาษี</Tag>}
              </Td>
              <Td><span className="tnum text-[12px] text-ink/55">{String(r.invoice_code ?? "—")}</span></Td>
              <Td><span className="tnum text-[12px] text-ink/55">{String(r.job_code ?? "—")}</span></Td>
              <Td>{String(r.customer_name ?? r.received_from ?? "—")}</Td>
              <Td>{thDate(r.issue_date as string)}</Td>
              <Td align="right"><span className="tnum">{money(Number(r.net_received ?? 0))}</span></Td>
              <Td align="right">
                <ModalButton label="ดูรายละเอียด" title={`ใบเสร็จ ${String(r.code)}`}
                             subtitle={String(r.customer_name ?? r.received_from ?? "")}>
                  <div className="divide-y divide-line-soft">
                    <KV k="อ้างถึงใบวางบิล" v={String(r.invoice_code ?? "—")} mono />
                    <KV k="งาน" v={String(r.job_code ?? "—")} mono />
                    <KV k="ยอดก่อนภาษี" v={`${money(Number(r.subtotal ?? 0))} บาท`} mono />
                    <KV k="ภาษีมูลค่าเพิ่ม" v={`${money(Number(r.vat_amount ?? 0))} บาท`} mono />
                    <KV k="ยอดรวม" v={`${money(Number(r.grand_total ?? 0))} บาท`} mono />
                    <KV k="หัก ณ ที่จ่าย" v={`${money(Number(r.wht_amount ?? 0))} บาท`} mono />
                    <KV k="รับจริง" v={`${money(Number(r.net_received ?? 0))} บาท`} mono />
                    <KV k="วิธีรับเงิน" v={String(r.method ?? "—")} />
                    <KV k="หนังสือรับรองหัก ณ ที่จ่าย"
                        v={Number(r.wht_amount ?? 0) === 0 ? "ไม่มีการหัก"
                           : r.wht_cert_received ? "ได้รับแล้ว" : "ยังไม่ได้รับ"} />
                  </div>
                  <div className="mt-4">
                    <Link href={`/docs/receipt/${r.id}`}
                          className="text-[12px] underline underline-offset-4">
                      เปิดเอกสารตัวเต็มเพื่อพิมพ์
                    </Link>
                  </div>
                </ModalButton>
              </Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Note tone="info" title="หัก ณ ที่จ่าย 3% คิดจากอะไร">
        คิดจากยอดก่อนภาษีมูลค่าเพิ่มเสมอ ไม่ใช่จากยอดรวม และหักเฉพาะลูกค้าที่เป็นนิติบุคคล
        ลูกค้าบุคคลธรรมดาไม่ต้องหัก ระบบคิดให้เองตามประเภทลูกค้าที่บันทึกไว้
        แล้วแสดงยอดเต็ม ยอดหัก และยอดรับจริงแยกบรรทัดบนใบเสร็จ
      </Note>
    </>
  );
}
