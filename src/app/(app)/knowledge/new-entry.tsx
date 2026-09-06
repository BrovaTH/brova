"use client";

import { ActionForm } from "@/components/action-form";
import { createKnowledge } from "@/actions/knowledge";

// ฟอร์มบันทึกความรู้หนึ่งเรื่อง
//
// เรียงช่องตามลำดับที่คนเล่าเรื่องจริง คือ เจออะไร เพราะอะไร แก้ยังไง กันยังไง
// ช่องที่บังคับคืออาการกับวิธีป้องกัน สองข้อนี้ขาดแล้วบันทึกไปก็ใช้ต่อไม่ได้
export function NewKnowledgeForm({
  jobs,
}: {
  jobs: { id: string; label: string }[];
}) {
  return (
    <ActionForm action={createKnowledge} submitLabel="บันทึกเข้าคลัง" submitting="กำลังบันทึก">
      <div className="mb-3">
        <label className="label">ชื่อเรื่อง</label>
        <input name="title" className="field" required
               placeholder="เช่น ผ้าป้ายกลุ่ม D หดหลังซัก 2 รอบ" />
      </div>

      <div className="mb-3">
        <label className="label">1. อาการที่เจอ</label>
        <textarea name="symptom" rows={2} className="field" required
                  placeholder="เห็นอะไร วัดได้เท่าไร เกิดตอนไหน" />
      </div>

      <div className="mb-3">
        <label className="label">2. สาเหตุที่แท้จริง</label>
        <textarea name="root_cause" rows={2} className="field"
                  placeholder="ไล่จนถึงต้นตอ ไม่ใช่หยุดที่อาการ" />
      </div>

      <div className="mb-3">
        <label className="label">3. สิ่งที่ทำไป</label>
        <textarea name="action_taken" rows={2} className="field"
                  placeholder="ครั้งนั้นแก้ด้วยวิธีไหน ใช้เวลาเท่าไร" />
      </div>

      <div className="mb-3">
        <label className="label">4. วิธีป้องกันไม่ให้เกิดซ้ำ</label>
        <textarea name="prevention" rows={2} className="field" required
                  placeholder="ต่อไปต้องทำอะไรเพิ่ม หรือเลิกทำอะไร" />
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">แท็ก</label>
          <input name="tags" className="field" placeholder="ผ้า, ซัก, กลุ่ม D" />
          <p className="mt-1 text-[11px] text-ink/45">คั่นด้วยจุลภาค ใช้กรองหาทีหลัง</p>
        </div>
        <div>
          <label className="label">เกิดกับงานไหน</label>
          <select name="job_id" className="field" defaultValue="">
            <option value="">— ไม่ผูกกับงานใดงานหนึ่ง —</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.label}</option>
            ))}
          </select>
        </div>
      </div>
    </ActionForm>
  );
}
