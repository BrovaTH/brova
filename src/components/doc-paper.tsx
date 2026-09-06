import { A4Sheet } from "./a4-sheet";
import { Logo } from "./logo";
import { money, thDateFull, bahtText } from "@/lib/format";
import {
  DOC_TITLE, DOC_TITLE_EN, docTotals, label, type DocModel,
} from "@/lib/doc-model";

export type CompanyInfo = {
  name?: string | null;
  tax_id?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  bank_account_name?: string | null;
};

/**
 * หน้าตาเอกสารจริงที่จะพิมพ์ออกมา
 * ใช้ทั้งในหน้าพรีวิวข้างหน้าแก้ไข และในหน้าพิมพ์
 * เป็นคอมโพเนนต์อ่านอย่างเดียว ไม่มีสถานะของตัวเอง
 */
export function DocPaper({
  doc, company, scale, watermark,
}: {
  doc: DocModel;
  company?: CompanyInfo | null;
  scale?: number;
  /** ข้อความจาง ๆ ทับหน้ากระดาษ เช่นคำว่าร่าง */
  watermark?: string | null;
}) {
  const t = docTotals(doc);
  const L = (k: string) => label(doc, k);

  return (
    <A4Sheet scale={scale}>
      {watermark && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rotate-[-24deg] text-[110px] font-medium tracking-[0.2em] text-ink/[0.055]">
            {watermark}
          </span>
        </div>
      )}

      {/* ---------------------------------------------------------------- หัวกระดาษ */}
      <header className="flex items-start justify-between gap-8 border-b-2 border-ink pb-4">
        <div className="flex items-start gap-3">
          <Logo size={38} />
          <div className="leading-tight">
            <p className="text-[17px] font-medium tracking-[0.14em]">BROVA</p>
            <p className="text-[8.5px] uppercase tracking-wide2 text-ink/45">
              A Creative Manufacturing Company
            </p>
            <div className="mt-2 space-y-[1px] text-[9.5px] leading-[1.5] text-ink/65">
              {company?.name && <p>{company.name}</p>}
              {company?.address && <p className="max-w-[280px]">{company.address}</p>}
              <p>
                {company?.phone && <>โทร {company.phone}</>}
                {company?.email && <> · {company.email}</>}
              </p>
              {company?.tax_id && <p>เลขประจำตัวผู้เสียภาษี {company.tax_id}</p>}
            </div>
          </div>
        </div>

        <div className="text-right leading-tight">
          <p className="text-[21px] font-medium tracking-display">{DOC_TITLE[doc.docType]}</p>
          <p className="text-[9px] uppercase tracking-wide2 text-ink/40">
            {DOC_TITLE_EN[doc.docType]}
          </p>
          <table className="mt-3 ml-auto text-[10px]">
            <tbody>
              <tr>
                <td className="pr-3 text-right text-ink/50">{L("doc_no")}</td>
                <td className="tnum text-right font-medium">{doc.code ?? "— ร่าง —"}</td>
              </tr>
              <tr>
                <td className="pr-3 text-right text-ink/50">{L("doc_date")}</td>
                <td className="tnum text-right">{thDateFull(doc.issueDate)}</td>
              </tr>
              {doc.dueDate && (
                <tr>
                  <td className="pr-3 text-right text-ink/50">{L("due_date")}</td>
                  <td className="tnum text-right">{thDateFull(doc.dueDate)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </header>

      {/* ---------------------------------------------------------------- คู่ค้า */}
      <section className="mt-4 flex gap-6 border-b border-ink/15 pb-4">
        <div className="flex-1">
          <p className="mb-1 text-[8.5px] uppercase tracking-wide2 text-ink/40">{L("party")}</p>
          <p className="text-[12.5px] font-medium leading-snug">{doc.party.name || "—"}</p>
          {doc.party.address && (
            <p className="mt-0.5 max-w-[330px] whitespace-pre-line text-[10px] leading-[1.55] text-ink/70">
              {doc.party.address}
            </p>
          )}
          <div className="mt-1 space-y-[1px] text-[10px] text-ink/60">
            {doc.party.tax_id && <p>เลขประจำตัวผู้เสียภาษี {doc.party.tax_id}</p>}
            {doc.party.contact && (
              <p>
                ผู้ติดต่อ {doc.party.contact}
                {doc.party.phone && <> · {doc.party.phone}</>}
              </p>
            )}
          </div>
        </div>

        <div className="w-[210px] shrink-0 space-y-[3px] text-[10px]">
          {doc.projectName && (
            <Row k={L("project")} v={doc.projectName} />
          )}
          {doc.poNumber && <Row k={L("po")} v={doc.poNumber} />}
          {doc.creditDays !== null && doc.creditDays !== undefined && (
            <Row k={L("credit")} v={`${doc.creditDays} วัน`} />
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------------- รายการ */}
      <table className="mt-4 w-full border-collapse text-[10.5px]">
        <thead>
          <tr className="border-b border-ink bg-ink/[0.04]">
            <Th w={34} center>{L("col_seq")}</Th>
            <Th>{L("col_desc")}</Th>
            <Th w={54} right>{L("col_qty")}</Th>
            <Th w={48} center>{L("col_unit")}</Th>
            <Th w={74} right>{L("col_price")}</Th>
            <Th w={84} right>{L("col_amount")}</Th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-[10px] text-ink/35">
                ยังไม่มีรายการ
              </td>
            </tr>
          )}
          {doc.lines.map((l, i) => (
            <tr key={l.id ?? i} className="border-b border-ink/10 align-top">
              <Td center>{i + 1}</Td>
              <Td>
                <span className="text-[11px]">{l.description || "—"}</span>
                {l.detail && (
                  <span className="mt-[1px] block text-[9px] leading-[1.5] text-ink/50">
                    {l.detail}
                  </span>
                )}
              </Td>
              <Td right mono>{money(l.qty, 0)}</Td>
              <Td center>{l.unit}</Td>
              <Td right mono>{money(l.unit_price)}</Td>
              <Td right mono>{money(l.qty * l.unit_price)}</Td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ---------------------------------------------------------------- ท้ายกระดาษ */}
      <section className="mt-4 flex items-start justify-between gap-8">
        <div className="flex-1 pt-1">
          <p className="text-[8.5px] uppercase tracking-wide2 text-ink/40">{L("baht_text")}</p>
          <p className="mt-0.5 border border-ink/20 bg-ink/[0.03] px-2.5 py-1.5 text-[10.5px]">
            {bahtText(t.netPayable)}
          </p>

          {doc.terms && (
            <div className="mt-3">
              <p className="text-[8.5px] uppercase tracking-wide2 text-ink/40">{L("terms")}</p>
              <p className="mt-0.5 whitespace-pre-line text-[9.5px] leading-[1.6] text-ink/70">
                {doc.terms}
              </p>
            </div>
          )}

          {company?.bank_name && (
            <div className="mt-3">
              <p className="text-[8.5px] uppercase tracking-wide2 text-ink/40">การชำระเงิน</p>
              <p className="mt-0.5 text-[9.5px] leading-[1.6] text-ink/70">
                {company.bank_name} · {company.bank_account}
                {company.bank_account_name && <> · {company.bank_account_name}</>}
              </p>
            </div>
          )}
        </div>

        <table className="w-[290px] shrink-0 border-collapse text-[10.5px]">
          <tbody>
            <Sum k={L("subtotal")} v={t.subtotal} />
            {t.discount > 0 && <Sum k={L("discount")} v={-t.discount} />}
            {t.discount > 0 && <Sum k={L("before_vat")} v={t.beforeVat} />}
            {t.vatPct > 0 && <Sum k={`${L("vat")} ${t.vatPct}%`} v={t.vatAmount} />}
            <Sum k={L("grand_total")} v={t.grandTotal} bold />
            {t.whtPct > 0 && <Sum k={`${L("wht")} ${t.whtPct}%`} v={-t.whtAmount} />}
            {t.whtPct > 0 && <Sum k={L("net")} v={t.netPayable} bold strong />}
          </tbody>
        </table>
      </section>

      {/* ---------------------------------------------------------------- ลายเซ็น */}
      <section className="mt-9 flex justify-between gap-10 text-[9.5px]">
        <Sign role="ผู้รับเอกสาร" />
        <Sign role="ผู้มีอำนาจลงนาม" />
      </section>

      <p className="absolute bottom-6 left-[52px] right-[52px] border-t border-ink/10 pt-2 text-[8px] uppercase tracking-wide2 text-ink/30">
        BROVA · {DOC_TITLE_EN[doc.docType]} {doc.code ?? "DRAFT"} · เอกสารนี้ออกจากระบบ ไม่ต้องประทับตรา
      </p>
    </A4Sheet>
  );
}

// ---------------------------------------------------------------- ชิ้นส่วนย่อย
function Th({ children, w, right, center }: {
  children: React.ReactNode; w?: number; right?: boolean; center?: boolean;
}) {
  return (
    <th
      style={w ? { width: w } : undefined}
      className={`px-2 py-1.5 text-[8.5px] font-normal uppercase tracking-wide2 text-ink/55 ${
        right ? "text-right" : center ? "text-center" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children, right, center, mono }: {
  children: React.ReactNode; right?: boolean; center?: boolean; mono?: boolean;
}) {
  return (
    <td
      className={`px-2 py-1.5 ${right ? "text-right" : center ? "text-center" : "text-left"} ${
        mono ? "tnum" : ""
      }`}
    >
      {children}
    </td>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-ink/10 pb-[3px]">
      <span className="text-ink/45">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

function Sum({ k, v, bold, strong }: {
  k: string; v: number; bold?: boolean; strong?: boolean;
}) {
  return (
    <tr className={strong ? "border-t-2 border-ink" : "border-t border-ink/12"}>
      <td className={`py-[5px] pr-3 text-right ${bold ? "font-medium" : "text-ink/60"}`}>{k}</td>
      <td className={`tnum w-[110px] py-[5px] text-right ${bold ? "font-medium" : ""} ${
        strong ? "text-[12px]" : ""
      }`}>
        {money(v)}
      </td>
    </tr>
  );
}

function Sign({ role }: { role: string }) {
  return (
    <div className="flex-1 text-center">
      <div className="mx-auto mb-1 h-9" />
      <div className="mx-auto w-[170px] border-t border-ink/35" />
      <p className="mt-1 text-ink/55">{role}</p>
      <p className="mt-2 text-ink/35">วันที่ ......... / ......... / .........</p>
    </div>
  );
}
