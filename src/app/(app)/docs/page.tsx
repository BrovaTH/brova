import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHead, Section, Table, Td, Tag, Note, Empty } from "@/components/ui";
import { ModalButton } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { deleteDraft } from "@/actions/docs";
import { NewDraftForm } from "./new-draft";
import { DocFlow, type FlowStage } from "@/components/doc-flow";
import { money, thDate, ago } from "@/lib/format";

export const dynamic = "force-dynamic";

// ============================================================================
// หน้าร่างเอกสารและสายเอกสาร
//
// สองเรื่องอยู่หน้าเดียวกันเพราะมันคือต้นทางเดียวกัน
// ด้านบนคือแผนที่ว่าเอกสารเดินไปถึงไหนแล้ว ด้านล่างคือร่างที่ยังไม่ได้ออกเลข
//
// ร่างแก้ได้ไม่จำกัดและไม่กินเลขที่เอกสาร เลขจะออกตอนกดออกเอกสารเท่านั้น
// ใบที่ออกเลขแล้วย้ายไปอยู่หน้าของตัวเอง เพื่อไม่ให้ปนกับของที่ยังแก้ได้
// ============================================================================

const TH: Record<string, string> = {
  quotation: "ใบเสนอราคา",
  invoice: "ใบวางบิล",
  receipt: "ใบเสร็จรับเงิน",
};

export default async function DocsPage() {
  const sb = supabaseServer();
  const [
    { data: drafts },
    { data: customers },
    { data: quotes },
    { data: invoices },
    { data: payments },
    { data: receipts },
    { data: creditNotes },
    { data: jobs },
  ] = await Promise.all([
    sb.from("draft_docs").select("*").order("created_at", { ascending: false }),
    sb.from("customers").select("id, name").order("name"),
    sb.from("quotations").select("id, code, status, grand_total").not("code", "is", null),
    sb.from("invoices_view")
      .select("id, code, status, job_id, grand_total, outstanding, overdue_days")
      .not("code", "is", null),
    sb.from("payments").select("id, amount, type, slip_url"),
    sb.from("receipts_view").select("id, code, grand_total, payment_id").not("code", "is", null),
    sb.from("credit_notes").select("id, code, amount, reason, issue_date, invoice_id")
      .order("issue_date", { ascending: false }),
    sb.from("jobs_view").select("id, status, total_amount"),
  ]);

  // ---------------------------------------------------------------- นับตามขั้น
  const Q = quotes ?? [];
  const I = invoices ?? [];
  const P = payments ?? [];
  const R = receipts ?? [];
  const CN = creditNotes ?? [];
  const J = jobs ?? [];

  const sum = (rows: Record<string, unknown>[], key: string) =>
    rows.reduce((a, r) => a + Number(r[key] ?? 0), 0);

  // ใบเสนอราคาที่ส่งไปแล้วแต่ลูกค้ายังไม่ตอบ คือเงินที่ยังไม่รู้ว่าจะได้หรือไม่ได้
  const quotesWaiting = Q.filter((q) => q.status === "Sent").length;

  // ใบงานที่เดินอยู่แต่ยังไม่เคยวางบิล คืองานที่ทำให้ฟรีอยู่ตอนนี้
  const billedJobIds = new Set(I.map((i) => String(i.job_id ?? "")));
  const liveJobs = J.filter((j) => j.status !== "99" && j.status !== "00");
  const jobsUnbilled = liveJobs.filter((j) => !billedJobIds.has(String(j.id))).length;

  // บิลที่ยังไม่ได้เงินครบ และในนั้นกี่ใบที่เลยกำหนดชำระแล้ว
  const invOutstanding = I.filter((i) => i.status !== "Void" && Number(i.outstanding ?? 0) > 0.01);
  const invOverdue = invOutstanding.filter((i) => Number(i.overdue_days ?? 0) > 0).length;

  // รับเงินที่ยังไม่แนบสลิป กับรับเงินที่ยังไม่ได้ออกใบเสร็จให้ลูกค้า
  const moneyIn = P.filter((p) => p.type === "มัดจำ" || p.type === "ยอดคงเหลือ");
  const noSlip = moneyIn.filter((p) => !p.slip_url || String(p.slip_url).trim() === "").length;
  const receiptedPaymentIds = new Set(R.map((r) => String(r.payment_id ?? "")));
  const payNoReceipt = moneyIn.filter((p) => !receiptedPaymentIds.has(String(p.id))).length;

  const stages: FlowStage[] = [
    {
      step: 1, th: "ใบเสนอราคา", abbr: "QT",
      count: Q.length, amount: sum(Q as Record<string, unknown>[], "grand_total"),
      href: "/quotations",
      what: "เสนอราคาให้ลูกค้า ยังไม่ผูกมัดอะไร แก้ได้จนกว่าจะออกเลข",
      stuck: { n: quotesWaiting, label: "ใบส่งไปแล้วลูกค้ายังไม่ตอบ", href: "/quotations" },
    },
    {
      step: 2, th: "ใบงาน", abbr: "JOB",
      count: J.length, amount: sum(J as Record<string, unknown>[], "total_amount"),
      href: "/jobs",
      what: "ลูกค้าตกลงแล้ว เปิดเป็นงานผลิต ตั้งแต่นี้ต้นทุนเริ่มเดิน",
      stuck: { n: jobsUnbilled, label: "งานที่เดินอยู่แต่ยังไม่เคยวางบิล", href: "/jobs", bad: true },
    },
    {
      step: 3, th: "ใบวางบิล", abbr: "INV",
      count: I.length, amount: sum(I as Record<string, unknown>[], "grand_total"),
      href: "/invoices",
      what: "เรียกเก็บเงินจากลูกค้า ออกเลขแล้วล็อก แก้ไม่ได้",
      stuck: {
        n: invOutstanding.length,
        label: invOverdue > 0 ? `ใบที่ยังไม่ได้เงิน (เลยกำหนด ${invOverdue})` : "ใบที่ยังไม่ได้เงิน",
        href: "/invoices",
        bad: invOverdue > 0,
      },
    },
    {
      step: 4, th: "รับเงิน", abbr: "PAY",
      count: moneyIn.length, amount: sum(moneyIn as Record<string, unknown>[], "amount"),
      href: "/accounting",
      what: "เงินเข้าบัญชีจริง ต้องแนบสลิปทุกครั้ง ระบบไม่รับถ้าไม่มีหลักฐาน",
      stuck: { n: noSlip, label: "รายการที่ยังไม่มีสลิป", href: "/accounting", bad: true },
    },
    {
      step: 5, th: "ใบเสร็จรับเงิน", abbr: "RC",
      count: R.length, amount: sum(R as Record<string, unknown>[], "grand_total"),
      href: "/receipts",
      what: "ออกให้ลูกค้าหลังเงินเข้า ใบนี้คือหลักฐานทางภาษีของทั้งสองฝ่าย",
      stuck: { n: payNoReceipt, label: "เงินที่รับแล้วแต่ยังไม่ออกใบเสร็จ", href: "/receipts" },
    },
  ];

  const drafted = drafts ?? [];

  return (
    <>
      <PageHead
        eyebrow="ร่างเอกสารและสายเอกสาร"
        title="DRAFTS"
        lead="เอกสารทุกใบต่อกันเป็นสาย ใบไหนขาดแปลว่ามีงานค้างอยู่ตรงนั้น หน้านี้บอกว่าค้างที่ขั้นไหน"
        right={
          <ModalButton
            variant="solid"
            label="สร้างร่างใหม่"
            title="สร้างร่างเอกสาร"
            subtitle="เลือกชนิดเอกสารและลูกค้า แล้วไปแก้รายละเอียดในหน้าถัดไป"
          >
            <NewDraftForm customers={(customers ?? []).map((c) => ({ id: c.id, name: c.name }))} />
          </ModalButton>
        }
      />

      {/* ------------------------------------------------------------ สายเอกสาร */}
      <Section
        title="สายเอกสาร ตั้งแต่เสนอราคาจนได้เงิน"
        hint="กดที่ตัวเลขสีแดงหรือสีส้มเพื่อไปดูว่าค้างใบไหน"
      >
        <DocFlow stages={stages} />
      </Section>

      {/* ------------------------------------------------------------ ร่าง */}
      <Section
        title="ร่างที่ค้างอยู่"
        hint="ร่างแก้ได้ไม่จำกัดและไม่กินเลขที่เอกสาร เลขจะออกตอนกดออกเอกสารเท่านั้น"
      >
        {drafted.length === 0 ? (
          <Empty title="ไม่มีร่างค้างอยู่" hint="เอกสารทุกใบออกเลขและล็อกเรียบร้อยแล้ว" />
        ) : (
          <Table head={["ชนิด", "ลูกค้า", "ยอดรวม", "สร้างเมื่อ", ""]}>
            {drafted.map((d) => (
              <tr key={`${d.doc_type}-${d.id}`} className="border-b border-line-soft last:border-0">
                <Td><Tag tone="warn">ร่าง {TH[d.doc_type]}</Tag></Td>
                <Td>{d.party_name ?? "ยังไม่ระบุ"}</Td>
                <Td align="right"><span className="tnum">{money(d.total)}</span></Td>
                <Td>{ago(d.created_at)}</Td>
                <Td align="right">
                  <span className="flex justify-end gap-2">
                    <Link
                      href={`/docs/${d.doc_type}/${d.id}`}
                      className="text-[12px] underline underline-offset-4"
                    >
                      เปิดแก้ไข
                    </Link>
                    <ModalButton label="ลบ" title="ลบร่างนี้"
                                 subtitle={`ร่าง${TH[d.doc_type]} ของ ${d.party_name ?? "—"}`}>
                      <p className="mb-4 leading-relaxed">
                        ลบร่างแล้วเอาคืนไม่ได้ แต่ไม่กระทบเลขที่เอกสารใด ๆ เพราะร่างยังไม่เคยกินเลข
                      </p>
                      <ActionForm action={deleteDraft} submitLabel="ยืนยันลบร่าง" danger>
                        <input type="hidden" name="doc_type" value={d.doc_type} />
                        <input type="hidden" name="id" value={d.id} />
                      </ActionForm>
                    </ModalButton>
                  </span>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* ------------------------------------------------------------ ใบลดหนี้ */}
      {CN.length > 0 && (
        <Section
          title="ใบลดหนี้"
          hint="ใช้เมื่อออกบิลผิดหรือลดยอดให้ลูกค้า ไม่ได้ลบบิลเดิม แต่หักออกจากยอดค้าง"
        >
          <Table head={["เลขที่", "หักจากบิล", "วันที่", "จำนวน", "เหตุผล"]}>
            {CN.map((c) => (
              <tr key={String(c.id)} className="border-b border-line-soft last:border-0">
                <Td><span className="tnum">{String(c.code ?? "ร่าง")}</span></Td>
                <Td>
                  <span className="tnum text-ink/60">
                    {I.find((i) => i.id === c.invoice_id)?.code ?? "—"}
                  </span>
                </Td>
                <Td>{thDate(c.issue_date as string)}</Td>
                <Td align="right"><span className="tnum">{money(Number(c.amount ?? 0))}</span></Td>
                <Td>{String(c.reason)}</Td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      <Note tone="info" title="ทำไมเอกสารที่ออกแล้วถึงแก้ไม่ได้">
        เพราะเลขที่เอกสารต้องเรียงและห้ามซ้ำ ถ้าแก้ย้อนหลังได้ ใบที่ลูกค้าถืออยู่กับใบในระบบจะไม่ตรงกัน
        เวลาตรวจสอบย้อนหลังจะพิสูจน์ไม่ได้ว่าอันไหนจริง ถ้าออกผิดให้ยกเลิกแล้วออกใหม่ หรือออกใบลดหนี้
      </Note>
    </>
  );
}
