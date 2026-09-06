"use client";

import { ActionForm } from "@/components/action-form";
import { saveCompany } from "@/actions/company";

type Company = Record<string, unknown>;

/** อ่านค่าจากฐานข้อมูลแบบไม่ให้ null หลุดไปเป็นคำว่า null ในช่องกรอก */
function v(c: Company, k: string): string {
  const x = c?.[k];
  return x === null || x === undefined ? "" : String(x);
}

// ฟอร์มข้อมูลบริษัท
//
// แบ่งสี่กลุ่มตามเรื่อง คือ ตัวบริษัท ที่ติดต่อ ภาษี แล้วก็บัญชีรับเงิน
// ไม่ได้เรียงตามลำดับคอลัมน์ในฐานข้อมูล เพราะคนกรอกคิดเป็นเรื่อง ไม่ได้คิดเป็นตาราง
export function CompanyForm({ company }: { company: Company }) {
  return (
    <ActionForm
      action={saveCompany}
      submitLabel="บันทึกข้อมูลบริษัท"
      submitting="กำลังบันทึก"
    >
      {/* -------------------------------------------------- ตัวบริษัท */}
      <div className="mb-5">
        <p className="mb-2 text-[11px] uppercase tracking-wide2 text-ink/40">ชื่อและเลขทะเบียน</p>

        <div className="mb-3">
          <label className="label">ชื่อบริษัท ภาษาไทย</label>
          <input name="name_th" className="field" required defaultValue={v(company, "name_th")} />
        </div>

        <div className="mb-3">
          <label className="label">ชื่อบริษัท ภาษาอังกฤษ</label>
          <input name="name" className="field" defaultValue={v(company, "name")} />
        </div>

        <div className="mb-3">
          <label className="label">เลขประจำตัวผู้เสียภาษี 13 หลัก</label>
          <input name="tax_id" className="field tnum" defaultValue={v(company, "tax_id")}
                 placeholder="0105566000000" />
        </div>

        <div>
          <label className="label">ที่อยู่</label>
          <textarea name="address" rows={2} className="field" defaultValue={v(company, "address")} />
        </div>
      </div>

      {/* -------------------------------------------------- ที่ติดต่อ */}
      <div className="mb-5 border-t border-line pt-4">
        <p className="mb-2 text-[11px] uppercase tracking-wide2 text-ink/40">ที่ติดต่อ</p>

        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">โทรศัพท์</label>
            <input name="phone" className="field tnum" defaultValue={v(company, "phone")} />
          </div>
          <div>
            <label className="label">อีเมล</label>
            <input name="email" type="email" className="field" defaultValue={v(company, "email")} />
          </div>
        </div>

        <div className="mb-3">
          <label className="label">เว็บไซต์</label>
          <input name="website" className="field" defaultValue={v(company, "website")} />
        </div>

        <div>
          <label className="label">ลิงก์โลโก้</label>
          <input name="logo_url" className="field" defaultValue={v(company, "logo_url")}
                 placeholder="https://" />
          <p className="mt-1 text-[11px] leading-relaxed text-ink/45">
            ใส่ที่อยู่ไฟล์ภาพแบบเต็ม เว้นว่างไว้ระบบจะใช้โลโก้ตัวอักษรที่มากับระบบ
          </p>
        </div>
      </div>

      {/* -------------------------------------------------- ภาษี */}
      <div className="mb-5 border-t border-line pt-4">
        <p className="mb-2 text-[11px] uppercase tracking-wide2 text-ink/40">ภาษี</p>

        <label className="mb-3 flex items-start gap-2 text-[13px] leading-relaxed">
          <input type="checkbox" name="vat_registered" className="mt-0.5 h-3.5 w-3.5 accent-ink"
                 defaultChecked={company?.vat_registered === true} />
          <span>
            จดทะเบียนภาษีมูลค่าเพิ่มแล้ว
            <span className="block text-[11px] text-ink/45">
              ติ๊กแล้วเอกสารที่ออกตั้งแต่วันที่มีผลจะคิด VAT ให้เอง
            </span>
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">วันที่จดมีผล</label>
            <input name="vat_effective_date" type="date" className="field"
                   defaultValue={v(company, "vat_effective_date").slice(0, 10)} />
          </div>
          <div>
            <label className="label">อัตรา VAT (%)</label>
            <input name="vat_pct" type="number" step="0.01" min="0" max="100" className="field"
                   defaultValue={v(company, "vat_pct") || "7"} />
          </div>
          <div>
            <label className="label">หัก ณ ที่จ่าย (%)</label>
            <input name="wht_pct" type="number" step="0.01" min="0" max="100" className="field"
                   defaultValue={v(company, "wht_pct") || "3"} />
          </div>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink/45">
          หัก ณ ที่จ่ายคิดจากยอดก่อนภาษีเสมอ และหักเฉพาะลูกค้านิติบุคคล
          ระบบดูจากประเภทลูกค้าที่บันทึกไว้แล้วคิดให้เอง
        </p>
      </div>

      {/* -------------------------------------------------- บัญชีรับเงิน */}
      <div className="border-t border-line pt-4">
        <p className="mb-2 text-[11px] uppercase tracking-wide2 text-ink/40">บัญชีรับเงิน</p>

        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">ธนาคาร</label>
            <input name="bank_name" className="field" defaultValue={v(company, "bank_name")} />
          </div>
          <div>
            <label className="label">เลขที่บัญชี</label>
            <input name="bank_account_no" className="field tnum"
                   defaultValue={v(company, "bank_account_no")} />
          </div>
        </div>

        <div className="mb-3">
          <label className="label">ชื่อบัญชี</label>
          <input name="bank_account_name" className="field"
                 defaultValue={v(company, "bank_account_name")} />
        </div>

        <div>
          <label className="label">ข้อความท้ายใบวางบิล</label>
          <textarea name="payment_note" rows={2} className="field"
                    defaultValue={v(company, "payment_note")} />
          <p className="mt-1 text-[11px] leading-relaxed text-ink/45">
            ข้อความนี้พิมพ์อยู่ใต้เลขบัญชีบนใบวางบิลทุกใบ ใช้บอกลูกค้าว่าโอนแล้วให้ทำอะไรต่อ
          </p>
        </div>
      </div>
    </ActionForm>
  );
}
