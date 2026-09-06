import { redirect } from "next/navigation";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { PageHead, Section, Table, Td, Tag, Note, LinkBtn, Stat } from "@/components/ui";
import { ModalButton } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { UserForm, PasswordForm } from "./user-forms";
import { setUserRole, setUserActive } from "@/actions/users";
import { thDate, num } from "@/lib/format";
import { ROLE_TH, type Role } from "@/lib/workflow";

export const dynamic = "force-dynamic";

const ROLE_NOTE: Record<string, string> = {
  owner: "เห็นทุกอย่าง อนุมัติได้คนเดียว ตั้งค่าระบบได้",
  sales: "เปิดงาน ทำใบเสนอราคา ดูแลลูกค้า",
  design: "ทำแบบร่างและรอบแก้แบบ",
  production: "รับงานเข้าไลน์ผลิตและบันทึกความคืบหน้า",
  qc: "ตรวจคุณภาพและบันทึกผล",
  warehouse: "รับของ จองผ้า นับสต็อก และแพ็กของ",
  finance: "วางบิล รับเงิน ออกใบเสร็จ เห็นต้นทุน",
  affiliate: "พาร์ตเนอร์แนะนำลูกค้า เห็นเฉพาะงานของตัวเอง",
};

export default async function UsersPage() {
  const me = await currentProfile();
  if (me?.role !== "owner") redirect("/settings");

  const sb = supabaseServer();
  const { data: people } = await sb.from("team_view").select("*").order("created_at");

  const P = people ?? [];
  const owners = P.filter((p) => p.role === "owner" && p.active);
  const active = P.filter((p) => p.active);

  return (
    <>
      <PageHead
        eyebrow="ตั้งค่า · ผู้ใช้"
        title="จัดการผู้ใช้"
        lead="สร้างบัญชีให้คนในทีม กำหนดบทบาท และตั้งรหัสผ่านใหม่ให้คนที่ลืม"
        right={
          <>
            <LinkBtn href="/settings">กลับหน้าตั้งค่า</LinkBtn>
            <ModalButton variant="solid" label="เพิ่มผู้ใช้" title="เพิ่มผู้ใช้ใหม่"
                         subtitle="ระบบจะสร้างบัญชีให้ใช้งานได้ทันที ไม่ต้องรอยืนยันอีเมล" wide>
              <UserForm />
            </ModalButton>
          </>
        }
      />

      <Section title="ภาพรวมทีม">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="ผู้ใช้ทั้งหมด" value={num(P.length)} unit="คน" hint={`ใช้งานอยู่ ${active.length} คน`} />
          <Stat label="เจ้าของ" value={num(owners.length)} unit="คน"
                hint="อนุมัติเรื่องนอกกรอบได้" tone={owners.length === 0 ? "bad" : undefined} />
          <Stat label="เห็นต้นทุน" value={num(P.filter((p) => p.can_see_cost).length)} unit="คน"
                hint="เห็นกำไรรายงาน" />
          <Stat label="ปิดใช้งาน" value={num(P.length - active.length)} unit="คน"
                hint="เข้าระบบไม่ได้แล้ว" />
        </div>
      </Section>

      <Section title={`ผู้ใช้ ${num(P.length)} คน`}>
        <Table head={["ชื่อ", "อีเมล", "บทบาท", "เห็นต้นทุน", "สถานะ", "เข้าร่วมเมื่อ", ""]}
               empty="ยังไม่มีผู้ใช้">
          {P.map((p) => (
            <tr key={p.id} className="border-b border-line-soft last:border-0">
              <Td>
                {p.full_name}
                {p.id === me?.id && <Tag tone="info" className="ml-2">คุณ</Tag>}
              </Td>
              <Td><span className="text-[12px] text-ink/55">{p.email ?? "—"}</span></Td>
              <Td>
                <Tag tone={p.role === "owner" ? "ok" : "mute"}>{p.role_th ?? p.role}</Tag>
                <span className="mt-0.5 block text-[11px] text-ink/40">{ROLE_NOTE[p.role]}</span>
              </Td>
              <Td>{p.can_see_cost ? "เห็น" : "ไม่เห็น"}</Td>
              <Td><Tag tone={p.active ? "ok" : "mute"}>{p.active ? "ใช้งานอยู่" : "ปิดใช้งาน"}</Tag></Td>
              <Td>{thDate(p.created_at)}</Td>
              <Td align="right">
                <span className="flex justify-end gap-2">
                  <ModalButton label="แก้บทบาท" title={`แก้บทบาทของ ${p.full_name}`}
                               subtitle="มีผลทันทีที่บันทึก">
                    <ActionForm action={setUserRole} submitLabel="บันทึกบทบาท">
                      <input type="hidden" name="id" value={p.id} />
                      <label className="mb-3 block">
                        <span className="label">บทบาท</span>
                        <select name="role" className="field" defaultValue={p.role}>
                          {(Object.keys(ROLE_TH) as Role[]).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_TH[r]} — {ROLE_NOTE[r]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-2 text-[13px]">
                        <input type="checkbox" name="can_see_cost" className="h-3.5 w-3.5 accent-ink"
                               defaultChecked={p.can_see_cost} />
                        ให้เห็นต้นทุนและกำไร
                      </label>
                      <p className="mt-3 text-[11px] leading-relaxed text-ink/45">
                        ระบบต้องมีเจ้าของที่ใช้งานอยู่อย่างน้อยหนึ่งคนเสมอ
                        ถ้าลดบทบาทเจ้าของคนสุดท้าย ระบบจะไม่ยอมให้บันทึก
                      </p>
                    </ActionForm>
                  </ModalButton>

                  <ModalButton label="ตั้งรหัสใหม่" title={`ตั้งรหัสผ่านใหม่ให้ ${p.full_name}`}
                               subtitle="ใช้เมื่อเจ้าตัวลืมรหัสผ่าน">
                    <PasswordForm id={p.id} name={p.full_name} />
                  </ModalButton>

                  {p.id !== me?.id && (
                    <ModalButton label={p.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                                 title={p.active ? `ปิดใช้งาน ${p.full_name}` : `เปิดใช้งาน ${p.full_name}`}>
                      <p className="mb-4 leading-relaxed">
                        {p.active
                          ? "ปิดแล้วคนนี้จะเข้าระบบไม่ได้ แต่ประวัติการทำงานที่ผ่านมายังอยู่ครบ เปิดกลับได้ทุกเมื่อ"
                          : "เปิดแล้วคนนี้จะเข้าระบบได้อีกครั้งด้วยรหัสผ่านเดิม"}
                      </p>
                      <ActionForm action={setUserActive}
                                  submitLabel={p.active ? "ยืนยันปิดใช้งาน" : "ยืนยันเปิดใช้งาน"}
                                  danger={p.active}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="active" value={p.active ? "off" : "on"} />
                      </ActionForm>
                    </ModalButton>
                  )}
                </span>
              </Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="เรื่องที่ต้องรู้">
        <div className="space-y-3">
          <Note tone="warn" title="ปิดการสมัครสมาชิกที่ Supabase ให้เรียบร้อย">
            เมื่อสร้างผู้ใช้จากหน้านี้ได้แล้ว ไม่จำเป็นต้องเปิดให้สมัครเองอีก
            ไปที่ Supabase แล้ว Authentication แล้ว Providers แล้ว Email
            ปิด Enable Sign Up ทิ้งไว้ตลอด
          </Note>
          <Note tone="info" title="ทำไมสร้างผู้ใช้จากหน้านี้ได้">
            การสร้างบัญชีต้องใช้กุญแจระดับผู้ดูแลของ Supabase
            กุญแจนั้นเก็บไว้ในตัวแปรฝั่งเซิร์ฟเวอร์ ไม่มีคำว่า NEXT_PUBLIC นำหน้า
            จึงไม่ถูกส่งไปที่เบราว์เซอร์ และเรียกได้เฉพาะบัญชีที่เป็นเจ้าของเท่านั้น
          </Note>
          <Note tone="mute" title="ลบผู้ใช้ทิ้งไม่ได้ตั้งใจให้ทำ">
            เพราะชื่อผู้ใช้ผูกอยู่กับประวัติงาน ใบขออนุมัติ และการรับเงินที่ผ่านมา
            ถ้าลบทิ้งประวัติจะอ่านไม่รู้เรื่อง ให้ปิดใช้งานแทน ผลเหมือนกันคือเข้าระบบไม่ได้
          </Note>
        </div>
      </Section>
    </>
  );
}
