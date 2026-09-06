import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { PageHead, Section, Table, Td, Tag, Note, KV, LinkBtn } from "@/components/ui";
import { ROLE_TH, type Role } from "@/lib/workflow";
import { thDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const sb = supabaseServer();
  const me = await currentProfile();
  const owner = me?.role === "owner";

  const [{ data: people }, { data: company }, { data: bus }] = await Promise.all([
    sb.from("profiles").select("*").order("created_at"),
    sb.from("company_settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("business_units").select("*").order("code"),
  ]);

  return (
    <>
      <PageHead
        eyebrow="ตั้งค่า"
        title="ทีมและข้อมูลบริษัท"
        lead="ข้อมูลบริษัทตรงนี้จะไปขึ้นบนหัวเอกสารทุกใบที่ออกจากระบบ"
        right={
          owner ? (
            <>
              <LinkBtn href="/settings/users">จัดการผู้ใช้</LinkBtn>
              <LinkBtn href="/settings/line" solid>แจ้งเตือนเข้าไลน์</LinkBtn>
            </>
          ) : null
        }
      />

      <Section title="ข้อมูลบริษัทที่ขึ้นบนเอกสาร">
        <div className="card divide-y divide-line-soft px-4">
          <KV k="ชื่อบริษัท" v={company?.name ?? "ยังไม่ได้ตั้ง"} />
          <KV k="เลขประจำตัวผู้เสียภาษี" v={company?.tax_id ?? "—"} mono />
          <KV k="ที่อยู่" v={company?.address ?? "—"} />
          <KV k="โทรศัพท์" v={company?.phone ?? "—"} mono />
          <KV k="อีเมล" v={company?.email ?? "—"} />
          <KV k="ธนาคาร" v={company?.bank_name ?? "—"} />
          <KV k="เลขบัญชี" v={company?.bank_account ?? "—"} mono />
          <KV k="ชื่อบัญชี" v={company?.bank_account_name ?? "—"} />
        </div>
        <p className="mt-2 text-[11px] text-ink/40">
          แก้ข้อมูลชุดนี้ได้ที่ตาราง company_settings ใน Supabase
          เอกสารที่ออกไปแล้วจะไม่เปลี่ยนตาม เพราะเก็บเป็นภาพนิ่งไว้ตอนออกใบ
        </p>
      </Section>

      <Section
        title={`ทีมงาน ${people?.length ?? 0} คน`}
        right={owner ? <LinkBtn href="/settings/users">เพิ่มหรือแก้ผู้ใช้</LinkBtn> : undefined}
      >
        <Table head={["ชื่อ", "บทบาท", "เห็นต้นทุน", "หน่วยธุรกิจ", "สถานะ", "เข้าร่วมเมื่อ"]}
               empty="ยังไม่มีผู้ใช้ในระบบ">
          {(people ?? []).map((p) => (
            <tr key={p.id} className="border-b border-line-soft last:border-0">
              <Td>
                {p.full_name}
                {p.id === me?.id && <Tag tone="info" className="ml-2">คุณ</Tag>}
              </Td>
              <Td>
                <Tag tone={p.role === "owner" ? "ok" : "mute"}>
                  {ROLE_TH[p.role as Role] ?? p.role}
                </Tag>
              </Td>
              <Td>{p.can_see_cost ? "เห็น" : "ไม่เห็น"}</Td>
              <Td><span className="text-[12px] text-ink/55">{(p.bu_access ?? []).join(" · ")}</span></Td>
              <Td><Tag tone={p.active ? "ok" : "mute"}>{p.active ? "ใช้งานอยู่" : "ปิดใช้งาน"}</Tag></Td>
              <Td align="right">{thDate(p.created_at)}</Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="หน่วยธุรกิจ">
        <Table head={["รหัส", "ชื่อ", "ขอบเขต", "กฎราคาโอน", "เป้าหมายต่อเดือน"]}>
          {(bus ?? []).map((b) => (
            <tr key={b.code} className="border-b border-line-soft last:border-0">
              <Td><span className="tnum">{b.code}</span></Td>
              <Td>{b.name}</Td>
              <Td><span className="text-[12px] text-ink/60">{b.scope ?? "—"}</span></Td>
              <Td><span className="text-[12px] text-ink/60">{b.transfer_price_rule ?? "—"}</span></Td>
              <Td align="right">
                <span className="tnum">
                  {Number(b.target_revenue_month ?? 0).toLocaleString("th-TH")}
                </span>
              </Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="ความปลอดภัยที่ต้องตรวจก่อนขึ้นใช้จริง">
        <div className="space-y-3">
          <Note tone="warn" title="ปิดการสมัครสมาชิกหลังทีมลงทะเบียนครบ">
            ที่ Supabase ไปที่ Authentication แล้วปิด Enable email signup
            ไม่งั้นใครก็ตามที่รู้ที่อยู่เว็บจะสมัครเข้ามาเองได้ คนแรกที่สมัครจะได้สิทธิ์เจ้าของ
            คนถัดไปได้สิทธิ์ฝ่ายขายซึ่งเห็นข้อมูลลูกค้าทั้งหมด
          </Note>
          <Note tone="warn" title="กุญแจ service_role ห้ามมีคำว่า NEXT_PUBLIC นำหน้า">
            กุญแจนั้นข้ามกฎความปลอดภัยระดับแถวได้ทั้งหมด ระบบใช้แค่สามงานที่ทำฝั่งเซิร์ฟเวอร์
            คือสร้างผู้ใช้ รับข้อมูลจากไลน์ และงานสรุปประจำวัน
            ถ้าเผลอเติม NEXT_PUBLIC ข้างหน้า เบราว์เซอร์จะเห็นด้วย แล้วใครก็แก้ข้อมูลลูกค้าได้ทั้งหมด
          </Note>
          <Note tone="info" title="ลิงก์ติดตามงานของลูกค้าเปิดได้โดยไม่ต้องล็อกอิน">
            แต่ละงานมีรหัสสุ่มของตัวเอง เดาลิงก์ของงานอื่นไม่ได้
            และหน้านั้นดึงข้อมูลผ่านฟังก์ชันที่คืนเฉพาะฟิลด์ปลอดภัย ต้นทุนและกำไรไม่มีทางหลุดออกไป
          </Note>
          {owner && (
            <Note tone="bad" title="ตอนพร้อมเริ่มงานจริง">
              รันไฟล์ 11_go_live.sql เพื่อล้างข้อมูลตัวอย่างทิ้ง
              ไฟล์นั้นมีตัวกันไว้ ต้องแก้บรรทัดยืนยันก่อนถึงจะทำงาน สำรองฐานข้อมูลก่อนรันเสมอ
            </Note>
          )}
        </div>
      </Section>
    </>
  );
}
