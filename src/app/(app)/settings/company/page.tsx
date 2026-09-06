import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { PageHead, Section, Table, Td, Note, KV, LinkBtn, Tag } from "@/components/ui";
import { CompanyForm } from "./company-form";
import { thDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

// ============================================================================
// หน้าตั้งค่าเอกสาร
//
// ข้อมูลที่พิมพ์บนเอกสารทุกใบแก้ได้จากหน้าเดียว ไม่ต้องไปแก้ในโปรแกรม
// และไม่ต้องเข้าไปแก้ในฐานข้อมูลเอง ซึ่งเป็นวิธีเดิมที่เสี่ยงพิมพ์ผิดโดยไม่มีใครทัก
//
// ด้านขวาคือกติกาที่ระบบบังคับ กับเลขชุดเอกสารที่ใช้อยู่
// ทั้งสองอย่างแก้ไม่ได้จากหน้าจอ เพราะเป็นกฎที่ทำให้เอกสารตรวจสอบย้อนหลังได้
// ============================================================================

const DOC_SERIES = [
  { code: "QT", th: "ใบเสนอราคา", note: "แก้ไม่ได้หลังออกเลข ต้องออก revision ใหม่" },
  { code: "INV", th: "ใบวางบิล", note: "ผูกกับงานเสมอ งานหนึ่งวางบิลได้สองใบ" },
  { code: "RC", th: "ใบเสร็จรับเงิน", note: "ออกอัตโนมัติเมื่อบันทึกรับเงินพร้อมสลิป" },
  { code: "TAX", th: "ใบกำกับภาษี", note: "ใช้เมื่อจด VAT แล้ว เป็นเลขชุดแยกต่างหาก" },
  { code: "CN", th: "ใบลดหนี้", note: "ใช้ลดยอดบิลที่ออกไปแล้ว ไม่ได้ลบใบเดิม" },
  { code: "PAY", th: "รายการรับเงิน", note: "เลขภายใน ไม่ได้พิมพ์บนเอกสารที่ส่งลูกค้า" },
  { code: "JOB", th: "ใบงาน", note: "ออกตอนเปิดงาน ใช้อ้างอิงตลอดสายเอกสาร" },
  { code: "INQ", th: "บรีฟ / คำขอราคา", note: "ออกตอนบันทึกบรีฟ" },
  { code: "KB", th: "คลังความรู้", note: "ออกตอนบันทึกเรื่องเข้าคลัง" },
];

const RULES = [
  {
    t: "เลขที่เอกสารเรียงต่อเนื่อง ห้ามซ้ำ ห้ามข้าม",
    d: "ตัวนับอยู่ที่ฐานข้อมูล ต่อให้มีคนกดออกเอกสารพร้อมกันหลายคนก็ไม่ได้เลขชนกัน",
  },
  {
    t: "ออกเลขแล้วล็อกทันที",
    d: "แก้ย้อนหลังไม่ได้เลย ถ้าผิดต้องยกเลิกแล้วออกใหม่ หรือออกใบลดหนี้",
  },
  {
    t: "ไม่มีสลิป บันทึกรับเงินไม่ได้",
    d: "ด่านนี้อยู่ที่ฐานข้อมูล ไม่ใช่ที่หน้าจอ แก้หน้าเว็บในเบราว์เซอร์ก็ผ่านไม่ได้",
  },
  {
    t: "หัก ณ ที่จ่ายคิดจากยอดก่อนภาษี",
    d: "และหักเฉพาะลูกค้านิติบุคคล ระบบดูจากประเภทลูกค้าแล้วคิดให้เอง",
  },
  {
    t: "เอกสารที่ออกไปแล้วไม่เปลี่ยนตามข้อมูลบริษัท",
    d: "ตอนออกใบ ระบบคัดลอกข้อมูลบริษัท ณ วันนั้นเก็บไว้กับใบนั้น ย้ายที่อยู่แล้วใบเก่าจึงยังเหมือนเดิม",
  },
];

export default async function CompanySettingsPage() {
  const sb = supabaseServer();
  const me = await currentProfile();
  const owner = me?.role === "owner";

  const [{ data: company }, { data: counters }] = await Promise.all([
    sb.from("company_settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("counters").select("*").order("prefix"),
  ]);

  const c = company ?? {};
  const used = new Map<string, { year: number; value: number }>(
    (counters ?? []).map((r) => [
      String(r.prefix),
      { year: Number(r.year), value: Number(r.value) },
    ] as [string, { year: number; value: number }]),
  );

  return (
    <>
      <PageHead
        eyebrow="ตั้งค่าเอกสาร"
        title="COMPANY & TAX"
        lead="ข้อมูลที่พิมพ์บนเอกสารทุกใบแก้ได้จากหน้านี้ ไม่ต้องแก้ในโปรแกรมและไม่ต้องเข้าฐานข้อมูล"
        right={<LinkBtn href="/settings">ตั้งค่าระบบ</LinkBtn>}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* -------------------------------------------------- ฟอร์มแก้ข้อมูล */}
        <div>
          <Section
            title="ข้อมูลที่พิมพ์บนเอกสาร"
            hint={
              c.updated_at
                ? `แก้ล่าสุดเมื่อ ${thDateTime(c.updated_at as string)}`
                : "ยังไม่เคยแก้ตั้งแต่ติดตั้งระบบ"
            }
          >
            {owner ? (
              <div className="card px-4 py-4">
                <CompanyForm company={c} />
              </div>
            ) : (
              <>
                <div className="card divide-y divide-line-soft px-4">
                  <KV k="ชื่อบริษัท" v={String(c.name_th ?? "ยังไม่ได้ตั้ง")} />
                  <KV k="ชื่อภาษาอังกฤษ" v={String(c.name ?? "—")} />
                  <KV k="เลขประจำตัวผู้เสียภาษี" v={String(c.tax_id ?? "—")} mono />
                  <KV k="ที่อยู่" v={String(c.address ?? "—")} />
                  <KV k="โทรศัพท์" v={String(c.phone ?? "—")} mono />
                  <KV k="อีเมล" v={String(c.email ?? "—")} />
                  <KV k="ธนาคาร" v={String(c.bank_name ?? "—")} />
                  <KV k="เลขบัญชี" v={String(c.bank_account_no ?? "—")} mono />
                  <KV k="ชื่อบัญชี" v={String(c.bank_account_name ?? "—")} />
                  <KV
                    k="ภาษีมูลค่าเพิ่ม"
                    v={c.vat_registered ? `จดแล้ว ${String(c.vat_pct ?? 7)}%` : "ยังไม่จด"}
                  />
                </div>
                <p className="mt-2 text-[11px] text-ink/40">
                  ข้อมูลชุดนี้ขึ้นบนเอกสารที่ส่งออกไปข้างนอกทุกใบ จึงให้เจ้าของกิจการแก้ได้คนเดียว
                </p>
              </>
            )}
          </Section>
        </div>

        {/* -------------------------------------------------- กติกาและเลขชุด */}
        <div>
          <Section title="กติกาที่ระบบบังคับ" hint="แก้จากหน้าจอไม่ได้ เพราะเป็นสิ่งที่ทำให้เอกสารเชื่อถือได้">
            <div className="card divide-y divide-line-soft">
              {RULES.map((r) => (
                <div key={r.t} className="px-4 py-3">
                  <p className="text-[13px] font-medium leading-snug">{r.t}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink/50">{r.d}</p>
                </div>
              ))}
            </div>
          </Section>

        </div>
      </div>

      <Section
        title="เลขชุดเอกสารที่ใช้อยู่"
        hint="รูปแบบคือ ตัวย่อ ขีด ปีพุทธศักราช ขีด เลขสี่หลัก เช่น INV-2569-0001"
      >
        <Table head={["ชุด", "เอกสาร", "ใช้ทำอะไร", "ออกไปแล้วถึงเลข"]}>
          {DOC_SERIES.map((d) => {
            const u = used.get(d.code);
            return (
              <tr key={d.code} className="border-b border-line-soft last:border-0">
                <Td><span className="tnum text-[12px]">{d.code}</span></Td>
                <Td><span className="text-[13px]">{d.th}</span></Td>
                <Td>
                  <span className="text-[11px] leading-relaxed text-ink/50">{d.note}</span>
                </Td>
                <Td align="right">
                  {u ? (
                    <span className="tnum text-[12px]">
                      {d.code}-{u.year}-{String(u.value).padStart(4, "0")}
                    </span>
                  ) : (
                    <Tag tone="mute">ยังไม่เคยออก</Tag>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      </Section>

      <Note tone="info" title="แก้ที่อยู่บริษัทแล้วใบเก่าจะเปลี่ยนตามไหม">
        ไม่เปลี่ยน ตอนออกใบระบบคัดลอกข้อมูลบริษัท ณ วันนั้นเก็บไว้กับใบนั้นเลย
        ใบที่ลูกค้าถืออยู่ในมือกับใบในระบบจึงตรงกันเสมอ ต่อให้ผ่านไปหลายปีและย้ายที่อยู่ไปแล้ว
        ข้อมูลที่แก้ในหน้านี้จะมีผลกับใบที่ออกหลังจากกดบันทึกเท่านั้น
      </Note>
    </>
  );
}
