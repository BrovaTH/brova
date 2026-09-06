import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHead, Section, Stat, Table, Td, Tag, KV, Note, LinkBtn } from "@/components/ui";
import { ModalButton } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { issueReceipt } from "@/actions/accounting";
import { money, num, thDate, thDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

// ============================================================================
// หน้าการเงินภาพรวม
//
// หน้านี้ตอบคำถามเดียว คือ "เงินเข้าออกครบไหม"
// ไม่ใช่ที่สำหรับจัดการใบวางบิลทีละใบ อันนั้นอยู่ที่หน้าใบวางบิล
// และไม่ใช่ที่สำหรับออกใบเสร็จทีละใบ อันนั้นอยู่ที่หน้าใบเสร็จ
//
// ที่นี่ดูสามอย่าง คือ ยอดรวมทั้งกิจการ · รายการที่ยังไม่มีหลักฐาน · เงินที่เพิ่งเข้า
// ============================================================================

export default async function AccountingPage() {
  const sb = supabaseServer();

  const [{ data: invs }, { data: pays }, { data: rcs }, { data: missing }] = await Promise.all([
    sb.from("invoices_view").select("*").order("issue_date", { ascending: false }),
    sb.from("payments").select("*").order("paid_at", { ascending: false }).limit(30),
    sb.from("receipts_view").select("*").not("code", "is", null)
      .order("issue_date", { ascending: false }),
    sb.from("payments_missing_slip").select("*"),
  ]);

  const I = (invs ?? []).filter((i) => i.status !== "Void");
  const R = rcs ?? [];
  const outstanding = I.reduce((a, i) => a + Number(i.outstanding ?? 0), 0);
  const overdue = I.filter((i) => Number(i.overdue_days ?? 0) > 0 && Number(i.outstanding ?? 0) > 0);
  const overdueAmt = overdue.reduce((a, i) => a + Number(i.outstanding ?? 0), 0);
  const billed = I.reduce((a, i) => a + Number(i.grand_total ?? 0), 0);
  const collected = billed - outstanding;

  // รับเงินที่ยังไม่ได้ออกใบเสร็จให้ลูกค้า ถือเป็นงานค้างของฝ่ายบัญชี
  const moneyIn = (pays ?? []).filter((p) => p.type === "มัดจำ" || p.type === "ยอดคงเหลือ");
  const receipted = new Set(R.map((r) => String(r.payment_id ?? "")));
  const noReceipt = moneyIn.filter((p) => !receipted.has(String(p.id)));

  // อายุหนี้ แบ่งเป็นช่วงตามที่ใช้กันในงานบัญชี
  // แบ่งช่วงเพราะหนี้ที่เลยมา 60 วันกับเลยมา 3 วัน ต้องใช้วิธีตามคนละแบบ
  const buckets = [
    { label: "ยังไม่ถึงกำหนด", test: (d: number) => d <= 0 },
    { label: "เลยมา 1-7 วัน", test: (d: number) => d >= 1 && d <= 7 },
    { label: "เลยมา 8-15 วัน", test: (d: number) => d >= 8 && d <= 15 },
    { label: "เลยมา 16-30 วัน", test: (d: number) => d >= 16 && d <= 30 },
    { label: "เลยมาเกิน 30 วัน", test: (d: number) => d > 30 },
  ].map((b) => {
    const rows = I.filter(
      (i) => Number(i.outstanding ?? 0) > 0 && b.test(Number(i.overdue_days ?? 0)),
    );
    return {
      label: b.label,
      count: rows.length,
      amount: rows.reduce((a, i) => a + Number(i.outstanding ?? 0), 0),
    };
  });

  return (
    <>
      <PageHead
        eyebrow="การเงินภาพรวม"
        title="FINANCE"
        lead="เงินเข้าออกทั้งกิจการอยู่ในหน้าเดียว จัดการใบทีละใบให้ไปที่หน้าใบวางบิลและใบเสร็จ"
        right={
          <>
            <LinkBtn href="/invoices">ใบวางบิล</LinkBtn>
            <LinkBtn href="/receipts">ใบเสร็จ</LinkBtn>
          </>
        }
      />

      <Section title="สถานะเงิน" hint="ไม่นับใบวางบิลที่ยกเลิกไปแล้ว">
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

      <Section title="อายุหนี้" hint="หนี้ที่เลยมานานต้องใช้วิธีตามคนละแบบกับหนี้ที่เพิ่งเลย">
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {buckets.map((b) => (
            <Stat
              key={b.label}
              label={b.label}
              value={money(b.amount, 0)}
              unit="บาท"
              tone={b.label.includes("เกิน 30") && b.amount > 0 ? "bad" : undefined}
              hint={`${b.count} ใบ`}
            />
          ))}
        </div>
      </Section>

      {((missing ?? []).length > 0 || noReceipt.length > 0) && (
        <Section title="ต้องตามให้ครบ" hint="สองเรื่องนี้ค้างแล้วจะกระทบตอนปิดบัญชี">
          <div className="space-y-3">
            {(missing ?? []).length > 0 && (
              <Note tone="bad" title={`${missing?.length} รายการชำระเงินที่ยังไม่มีสลิป`}>
                การรับเงินทุกครั้งต้องมีหลักฐาน ไม่งั้นเวลากระทบยอดกับธนาคารจะหาไม่เจอว่าเงินก้อนไหนคือก้อนไหน
              </Note>
            )}
            {noReceipt.length > 0 && (
              <Note tone="warn" title={`${noReceipt.length} รายการรับเงินที่ยังไม่ได้ออกใบเสร็จ`}>
                เงินเข้าบัญชีแล้วแต่ลูกค้ายังไม่มีหลักฐานไปลงบัญชีของเขา{" "}
                <Link href="/receipts" className="underline underline-offset-4">
                  ไปออกใบเสร็จที่หน้าใบเสร็จรับเงิน
                </Link>
              </Note>
            )}
          </div>
        </Section>
      )}

      <Section
        title="ใบที่ยังเก็บเงินไม่ครบ"
        hint="แสดงสิบใบที่ค้างมากที่สุด กดที่เลขที่เพื่อเปิดเอกสาร"
        right={<LinkBtn href="/invoices">ดูและจัดการทุกใบ</LinkBtn>}
      >
        <Table head={["เลขที่", "ลูกค้า", "งาน", "ครบกำหนด", "ค้างชำระ", "สถานะ"]}
               empty="เก็บเงินครบทุกใบแล้ว">
          {I.filter((i) => Number(i.outstanding ?? 0) > 0)
            .sort((a, b) => Number(b.outstanding ?? 0) - Number(a.outstanding ?? 0))
            .slice(0, 10)
            .map((i) => {
              const od = Number(i.overdue_days ?? 0);
              return (
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
                    <span className={od > 0 ? "text-signal-bad" : ""}>
                      {thDate(i.due_date as string)}
                      {od > 0 && <span className="ml-1 text-[11px]">เลย {od} วัน</span>}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="tnum text-signal-warn">{money(Number(i.outstanding ?? 0))}</span>
                  </Td>
                  <Td><Tag tone={od > 0 ? "bad" : "warn"}>{od > 0 ? "เลยกำหนด" : "ยังไม่ถึงกำหนด"}</Tag></Td>
                </tr>
              );
            })}
        </Table>
      </Section>

      <Section title="การรับเงินล่าสุด" hint="สามสิบรายการหลังสุด กดดูสลิปได้ทุกรายการ">
        <Table head={["เลขที่", "ประเภท", "วิธี", "ยอด", "เมื่อ", "หลักฐาน", "ใบเสร็จ"]}
               empty="ยังไม่มีการรับเงิน">
          {(pays ?? []).map((p) => (
            <tr key={String(p.id)} className="border-b border-line-soft last:border-0">
              <Td><span className="tnum">{String(p.code ?? "—")}</span></Td>
              <Td>{String(p.type)}</Td>
              <Td>{String(p.method)}</Td>
              <Td align="right"><span className="tnum">{money(Number(p.amount ?? 0))}</span></Td>
              <Td>{thDateTime(p.paid_at as string)}</Td>
              <Td>
                {p.slip_url ? (
                  <ModalButton label="ดูสลิป" title="หลักฐานการชำระเงิน"
                               subtitle={`${String(p.code ?? "")} · ${money(Number(p.amount ?? 0))} บาท`}>
                    <div className="divide-y divide-line-soft">
                      <KV k="วิธีชำระ" v={String(p.method)} />
                      <KV k="ยอด" v={`${money(Number(p.amount ?? 0))} บาท`} mono />
                      <KV k="หัก ณ ที่จ่าย" v={`${money(Number(p.wht_amount ?? 0))} บาท`} mono />
                      <KV k="รับเมื่อ" v={thDateTime(p.paid_at as string)} mono />
                      <KV k="ผู้บันทึก" v={String(p.by_user ?? "—")} />
                      <KV k="เลขอ้างอิง" v={String(p.slip_ref ?? "—")} mono />
                    </div>
                    <div className="mt-4 border border-line bg-bone-200/50 p-3">
                      <p className="mb-2 text-[11px] uppercase tracking-wide2 text-ink/40">ไฟล์สลิป</p>
                      <a href={String(p.slip_url)} target="_blank" rel="noreferrer"
                         className="break-all text-[12px] underline underline-offset-4">
                        {String(p.slip_url)}
                      </a>
                    </div>
                  </ModalButton>
                ) : p.slip_ref ? (
                  <span className="tnum text-[12px] text-ink/55">{String(p.slip_ref)}</span>
                ) : (
                  <Tag tone="bad">ไม่มีสลิป</Tag>
                )}
              </Td>
              <Td align="right">
                {receipted.has(String(p.id)) ? (
                  <span className="text-[12px] text-ink/40">ออกแล้ว</span>
                ) : p.type === "คืนเงิน" || p.type === "ค่าปรับ" ? (
                  <span className="text-[12px] text-ink/30">—</span>
                ) : (
                  <ModalButton label="ออกใบเสร็จ" title="ออกใบเสร็จรับเงิน"
                               subtitle={`ยอด ${money(Number(p.amount ?? 0))} บาท`}>
                    <p className="mb-3 leading-relaxed text-ink/70">
                      ใบเสร็จออกได้ครั้งเดียวต่อการรับเงินหนึ่งครั้ง และล็อกทันทีที่ออก
                    </p>
                    <ActionForm action={issueReceipt} submitLabel="ออกใบเสร็จ">
                      <input type="hidden" name="payment_id" value={String(p.id)} />
                      <label className="flex items-center gap-2 text-[13px]">
                        <input type="checkbox" name="is_tax_invoice" className="h-3.5 w-3.5 accent-ink" />
                        ออกเป็นใบกำกับภาษี ใช้เลขชุด TAX แยกต่างหาก
                      </label>
                    </ActionForm>
                  </ModalButton>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Note tone="info" title="ทำไมไม่มีสลิปแล้วบันทึกรับเงินไม่ได้">
        เพราะด่านนี้อยู่ที่ฐานข้อมูล ไม่ได้อยู่ที่หน้าจอ ต่อให้แก้หน้าเว็บในเบราว์เซอร์ก็ยังบันทึกไม่ได้
        เหตุผลคือตอนกระทบยอดกับธนาคารปลายเดือน ถ้ามีรายการที่ไม่มีหลักฐาน จะพิสูจน์ไม่ได้ว่าเงินก้อนนั้นมาจากไหน
      </Note>
    </>
  );
}
