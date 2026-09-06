"use client";

import { ActionForm } from "@/components/action-form";
import { addProductionLog } from "@/actions/production";

// ฟอร์มบันทึกการผลิตหนึ่งสถานี
//
// ช่องที่ขาดไม่ได้คือ รับเข้า ส่งออก เสีย เพราะสามตัวนี้ต้องบวกกันลงตัว
// ถ้าไม่ลงตัว เซิร์ฟเวอร์จะปฏิเสธและบอกว่าเกินไปกี่ตัว
export function ProductionLogForm({
  jobs,
}: {
  jobs: { id: string; label: string }[];
}) {
  return (
    <ActionForm action={addProductionLog} submitLabel="บันทึกการผลิต" submitting="กำลังบันทึก">
      <div className="mb-3">
        <label className="label">งาน</label>
        <select name="job_id" className="field" required defaultValue="">
          <option value="" disabled>— เลือกงาน —</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>{j.label}</option>
          ))}
        </select>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">สถานี</label>
          <select name="step" className="field" required defaultValue="ตัด">
            <option>ตัด</option>
            <option>เย็บ</option>
            <option>พิมพ์</option>
            <option>ปัก</option>
            <option>รีด</option>
            <option>แพ็ก</option>
            <option>อื่น ๆ</option>
          </select>
        </div>
        <div>
          <label className="label">เครื่อง / คน</label>
          <input name="machine" className="field" placeholder="เช่น เครื่องพิมพ์ 2" />
        </div>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">รับเข้า (ตัว)</label>
          <input name="qty_in" type="number" min="1" className="field" required />
        </div>
        <div>
          <label className="label">ส่งออก (ตัว)</label>
          <input name="qty_out" type="number" min="0" className="field" required />
        </div>
        <div>
          <label className="label">เสีย (ตัว)</label>
          <input name="qty_defect" type="number" min="0" defaultValue={0} className="field" />
        </div>
      </div>

      <div className="mb-4">
        <label className="label">สาเหตุที่เสีย</label>
        <input name="defect_reason" className="field" placeholder="ใส่เมื่อมีของเสีย เช่น สีเพี้ยน ตะเข็บหลุด" />
        <p className="mt-1 text-[11px] leading-relaxed text-ink/45">
          ส่งออกบวกของเสียต้องไม่เกินจำนวนที่รับเข้ามา และถ้ามีของเสียต้องบอกสาเหตุเสมอ
        </p>
      </div>
    </ActionForm>
  );
}
