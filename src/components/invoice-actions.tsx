import { ModalButton } from "./modal";
import { ActionForm } from "./action-form";
import { Note } from "./ui";
import { addPayment, voidInvoice, createCreditNote, extendDueDate } from "@/actions/accounting";
import { requestApproval } from "@/actions/approvals";
import { money, thDate } from "@/lib/format";

// ปุ่มจัดการใบวางบิลหนึ่งใบ
//
// แยกออกมาเป็นชิ้นเดียวเพราะใช้ทั้งที่หน้าใบวางบิลและหน้าอื่นที่อยากทำเรื่องเดียวกัน
// ถ้าปล่อยให้ก๊อบไปวางสองที่ วันหนึ่งจะแก้ที่เดียวแล้วอีกที่ยังทำงานแบบเก่า
export function InvoiceActions({
  inv,
}: {
  inv: Record<string, unknown>;
}) {
  const id = String(inv.id);
  const code = String(inv.code ?? "");
  const status = String(inv.status ?? "");
  const out = Number(inv.outstanding ?? 0);
  const collectable = out > 0 && status !== "Void" && status !== "Draft";

  return (
    <span className="flex justify-end gap-2">
      {collectable && (
        <ModalButton label="รับชำระ" title="รับชำระเงิน"
                     subtitle={`${code} · ค้าง ${money(out)} บาท`}>
          <ActionForm action={addPayment} submitLabel="บันทึกการรับเงิน">
            <input type="hidden" name="invoice_id" value={id} />
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

      {out > 0 && status !== "Void" && (
        <ModalButton label="เลื่อนกำหนด" title="เลื่อนกำหนดชำระ"
                     subtitle={`${code} · เดิม ${thDate(inv.due_date as string)}`}>
          <Note tone="warn" title="เรื่องนี้ต้องได้รับอนุมัติจากเจ้าของ">
            ระบบจะยอมให้เลื่อนก็ต่อเมื่อมีใบอนุมัติที่ยังใช้ได้
            ถ้ายังไม่มี ให้ยื่นเรื่องจากแบบฟอร์มด้านล่างก่อน
          </Note>

          <div className="mt-4">
            <p className="label">ถ้ามีใบอนุมัติแล้ว</p>
            <ActionForm action={extendDueDate} submitLabel="เลื่อนกำหนดชำระ">
              <input type="hidden" name="invoice_id" value={id} />
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
              <input type="hidden" name="target_id" value={id} />
              <input type="hidden" name="target_code" value={code} />
              <input type="hidden" name="title" value={`ขอเลื่อนกำหนดชำระ ${code}`} />
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

      {status !== "Void" && (
        <ModalButton label="ยกเลิก / ลดหนี้" title="ยกเลิกหรือออกใบลดหนี้" subtitle={code} wide>
          <div className="space-y-5">
            <div>
              <p className="label">ยกเลิกทั้งใบ</p>
              <p className="mb-2 text-[12px] leading-relaxed text-ink/55">
                ใช้ได้เฉพาะใบที่ยังไม่มีการรับชำระเลย เลขที่เดิมจะยังอยู่ในระบบเพื่อการตรวจสอบ
              </p>
              <ActionForm action={voidInvoice} submitLabel="ยกเลิกใบนี้" danger
                          confirmTitle="ยืนยันยกเลิกใบวางบิล"
                          confirmText={`ยกเลิก ${code} แล้วย้อนกลับไม่ได้ ถ้าต้องการเรียกเก็บใหม่ต้องออกใบใหม่`}>
                <input type="hidden" name="invoice_id" value={id} />
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
                <input type="hidden" name="invoice_id" value={id} />
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
  );
}
