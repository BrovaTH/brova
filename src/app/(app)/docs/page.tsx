import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHead, Section, Table, Td, Tag, Note, Empty } from "@/components/ui";
import { ModalButton } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { deleteDraft } from "@/actions/docs";
import { NewDraftForm } from "./new-draft";
import { money, thDate, ago } from "@/lib/format";

export const dynamic = "force-dynamic";

const TH: Record<string, string> = {
  quotation: "ใบเสนอราคา",
  invoice: "ใบวางบิล",
  receipt: "ใบเสร็จรับเงิน",
};

export default async function DocsPage() {
  const sb = supabaseServer();
  const [{ data: drafts }, { data: customers }, { data: quotes }] = await Promise.all([
    sb.from("draft_docs").select("*").order("created_at", { ascending: false }),
    sb.from("customers").select("id, name").order("name"),
    sb.from("quotations").select("id, code, status, party_name, issued_at, grand_total")
      .not("code", "is", null).order("issued_at", { ascending: false }).limit(20),
  ]);

  return (
    <>
      <PageHead
        eyebrow="เอกสาร"
        title="ร่างและเอกสารที่ออกแล้ว"
        lead="ร่างแก้ได้ไม่จำกัด และไม่กินเลขที่เอกสาร เลขจะออกตอนกดออกเอกสารเท่านั้น"
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

      <Section title="ร่างที่ค้างอยู่" hint="ร่างที่ทิ้งไว้นานควรลบทิ้ง จะได้ไม่สับสนว่าใบไหนของจริง">
        {(drafts ?? []).length === 0 ? (
          <Empty
            title="ไม่มีร่างค้างอยู่"
            hint="เอกสารทุกใบออกเลขและล็อกเรียบร้อยแล้ว"
          />
        ) : (
          <Table head={["ชนิด", "ลูกค้า", "ยอดรวม", "สร้างเมื่อ", ""]}>
            {(drafts ?? []).map((d) => (
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

      <Section title="ใบเสนอราคาที่ออกแล้ว" hint="ออกเลขแล้วล็อก แก้ไม่ได้ ดูและพิมพ์ได้อย่างเดียว">
        <Table head={["เลขที่", "ลูกค้า", "วันที่", "ยอดรวม", "สถานะ", ""]} empty="ยังไม่มีใบเสนอราคาที่ออกแล้ว">
          {(quotes ?? []).map((q) => (
            <tr key={q.id} className="border-b border-line-soft last:border-0">
              <Td><span className="tnum">{q.code}</span></Td>
              <Td>{q.party_name ?? "—"}</Td>
              <Td>{thDate(q.issued_at)}</Td>
              <Td align="right"><span className="tnum">{money(q.grand_total)}</span></Td>
              <Td><Tag tone={q.status === "Accepted" ? "ok" : "info"}>{q.status}</Tag></Td>
              <Td align="right">
                <Link href={`/docs/quotation/${q.id}`} className="text-[12px] underline underline-offset-4">
                  เปิดเอกสาร
                </Link>
              </Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Note tone="info" title="ทำไมเอกสารที่ออกแล้วถึงแก้ไม่ได้">
        เพราะเลขที่เอกสารต้องเรียงและห้ามซ้ำ ถ้าแก้ย้อนหลังได้ ใบที่ลูกค้าถืออยู่กับใบในระบบจะไม่ตรงกัน
        เวลาตรวจสอบย้อนหลังจะพิสูจน์ไม่ได้ว่าอันไหนจริง ถ้าออกผิดให้ยกเลิกแล้วออกใหม่ หรือออกใบลดหนี้
      </Note>
    </>
  );
}
