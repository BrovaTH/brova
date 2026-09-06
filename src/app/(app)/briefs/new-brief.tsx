"use client";

import { ActionForm } from "@/components/action-form";
import { createInquiry } from "@/actions/inquiries";

// ฟอร์มบันทึกบรีฟใหม่
//
// จงใจถามน้อยช่องที่สุดเท่าที่ยังตอบราคาได้ เพราะคนกรอกมักกำลังคุยกับลูกค้าอยู่
// ถ้าฟอร์มยาว เขาจะไม่กรอก แล้วกลับไปจดในแชทเหมือนเดิม
//
// สามช่องบนคือโจทย์สามข้อที่ระบบใช้เป็นด่าน G1 ตอนเปิดงานจริง
// จดตั้งแต่ตอนนี้ พอถึงตอนเปิดงานจะไม่ต้องไล่ถามลูกค้าซ้ำ
export function NewBriefForm({
  customers,
}: {
  customers: { id: string; name: string }[];
}) {
  return (
    <ActionForm action={createInquiry} submitLabel="บันทึกบรีฟ" submitting="กำลังบันทึก">
      <div className="mb-3">
        <label className="label">1. ใครใส่</label>
        <input name="brief_who" className="field" placeholder="เช่น พนักงานหน้าร้าน 60 คน" required />
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">2. ใส่ที่ไหน</label>
          <input name="brief_where" className="field" placeholder="เช่น ออกบูธกลางแจ้ง" />
        </div>
        <div>
          <label className="label">3. ใส่นานแค่ไหน</label>
          <input name="brief_duration" className="field" placeholder="เช่น ใส่ประจำทุกวัน" />
        </div>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">ลูกค้า</label>
          <select name="customer_id" className="field" defaultValue="">
            <option value="">— ยังไม่ระบุ —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">เข้ามาทางไหน</label>
          <select name="channel" className="field" defaultValue="LINE">
            <option>LINE</option>
            <option>Facebook</option>
            <option>Referral</option>
            <option>โทรศัพท์</option>
            <option>หน้าร้าน</option>
            <option>อื่น ๆ</option>
          </select>
        </div>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">จำนวนราว ๆ (ตัว)</label>
          <input name="qty_estimate" type="number" min="0" className="field" placeholder="0" />
        </div>
        <div>
          <label className="label">งบต่อตัว (บาท)</label>
          <input name="budget_per_unit" type="number" min="0" step="0.01" className="field" placeholder="0" />
        </div>
        <div>
          <label className="label">อยากได้ภายใน</label>
          <input name="deadline" type="date" className="field" />
        </div>
      </div>

      <div className="mb-3">
        <label className="label">กลุ่มผ้าที่น่าจะเหมาะ</label>
        <select name="recommended_fabric_group" className="field" defaultValue="">
          <option value="">— ยังไม่ระบุ —</option>
          <option value="A">A · ใช้บ่อย ของพร้อม</option>
          <option value="B">B · ใช้บ่อยรองลงมา</option>
          <option value="C">C · สั่งเป็นครั้ง</option>
          <option value="D">D · นำเข้า ใช้เวลานาน</option>
        </select>
      </div>

      <div className="mb-4">
        <label className="label">บันทึกเพิ่ม</label>
        <textarea name="note" rows={2} className="field" placeholder="สิ่งที่ลูกค้าบอกมาแล้วยังไม่มีช่องให้กรอก" />
      </div>
    </ActionForm>
  );
}
