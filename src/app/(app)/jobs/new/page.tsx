import { supabaseServer } from "@/lib/supabase/server";
import { PageHead, Note, LinkBtn } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { createJob } from "@/actions/jobs";
import { BUS } from "@/lib/workflow";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const sb = supabaseServer();
  const { data: customers } = await sb.from("customers").select("id, code, name").order("name");

  return (
    <>
      <PageHead
        eyebrow="เปิดงานใหม่"
        title="NEW JOB"
        lead="เปิดงานได้เลยแม้ยังไม่รู้ทุกอย่าง แต่ถ้าเก็บโจทย์สามข้อได้ตั้งแต่ตอนนี้ งานจะเดินต่อได้เร็วกว่า"
        right={<LinkBtn href="/jobs">ยกเลิก</LinkBtn>}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="card p-5">
          <ActionForm action={createJob} submitLabel="เปิดใบงาน">
            <label className="mb-4 block">
              <span className="label">ชื่องาน</span>
              <input name="title" className="field" required
                     placeholder="เช่น เสื้อโปโลพนักงานสาขาใหม่ 120 ตัว" />
            </label>

            <div className="mb-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label">ลูกค้า</span>
                <select name="customer_id" className="field">
                  <option value="">ยังไม่ระบุ</option>
                  {(customers ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">หน่วยธุรกิจ</span>
                <select name="bu_code" className="field">
                  {BUS.map((b) => (
                    <option key={b.code} value={b.code}>{b.th}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">จำนวนตัว</span>
                <input name="qty_total" type="number" min={0} className="field" defaultValue={0} />
              </label>
              <label className="block">
                <span className="label">ยอดงานโดยประมาณ</span>
                <input name="total_amount" type="number" step="0.01" className="field" defaultValue={0} />
              </label>
              <label className="block sm:col-span-2">
                <span className="label">กำหนดส่ง</span>
                <input name="due_date" type="date" className="field" />
              </label>
            </div>

            <div className="rule mb-4 pt-4">
              <p className="mb-1 text-[13px] font-medium">โจทย์สามข้อ</p>
              <p className="mb-3 text-[12px] leading-relaxed text-ink/50">
                กรอกตอนนี้หรือทีหลังก็ได้ แต่ถ้ายังไม่ครบ ระบบจะไม่ให้ทำใบเสนอราคา
              </p>
              <label className="mb-3 block">
                <span className="label">ใครใส่</span>
                <input name="brief_who" className="field" />
              </label>
              <label className="mb-3 block">
                <span className="label">ใส่ที่ไหน</span>
                <input name="brief_where" className="field" />
              </label>
              <label className="block">
                <span className="label">ใส่นานแค่ไหน</span>
                <input name="brief_duration" className="field" />
              </label>
            </div>
          </ActionForm>
        </div>

        <div className="space-y-4">
          <Note tone="info" title="ทำไมต้องถามสามข้อนี้">
            คำตอบสามข้อนี้ตัดสินเรื่องผ้าเกือบทั้งหมด คนใส่ในห้องแอร์กับคนใส่กลางแดดต้องใช้ผ้าคนละแบบ
            งานที่ใส่ครั้งเดียวกับงานที่ใส่ทุกวันก็คนละราคา ถ้าไม่ถามตั้งแต่ต้น
            จะไปรู้ตอนลูกค้าบ่นว่าร้อนหรือยืด ซึ่งตอนนั้นแก้ไม่ทันแล้ว
          </Note>
          <Note tone="mute" title="ใบงานเปิดแล้วลบไม่ได้">
            ถ้าเปิดผิดให้ยกเลิกงานแทน ซึ่งต้องขออนุมัติจากเจ้าของ
            ระบบออกแบบให้ทุกใบงานมีร่องรอย เพื่อให้ย้อนดูได้ว่าเกิดอะไรขึ้นบ้าง
          </Note>
        </div>
      </div>
    </>
  );
}
