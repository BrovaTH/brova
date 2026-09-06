import { redirect } from "next/navigation";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { PageHead, Section, Stat, Table, Td, Tag, Note, KV, LinkBtn, Empty } from "@/components/ui";
import { ModalButton } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { FlexPreview } from "@/components/flex-preview";
import {
  saveLineSettings, addLineTarget, removeLineTarget, saveLineEvents, sendLineTest,
} from "@/actions/line";
import {
  cardApprovalNew, cardDailySummary, cardPaymentIn, cardQcFail, cardStockLow,
  cardInvoiceOverdue, cardJobLate, cardApprovalDone,
} from "@/lib/line/flex";
import { thDateTime, ago, num } from "@/lib/format";

export const dynamic = "force-dynamic";

const MASK = "••••••••••••••••••••••••••••••••••••••••";

export default async function LineSettingsPage() {
  const me = await currentProfile();
  if (me?.role !== "owner") redirect("/settings");

  const sb = supabaseServer();
  const [{ data: st }, { data: targets }, { data: events }, { data: health }, { data: logs }] =
    await Promise.all([
      sb.from("line_settings").select("*").eq("id", 1).maybeSingle(),
      sb.from("line_targets").select("*").order("created_at"),
      sb.from("line_events_view").select("*"),
      sb.from("line_health").select("*").maybeSingle(),
      sb.from("line_log").select("*").order("created_at", { ascending: false }).limit(20),
    ]);

  const T = targets ?? [];
  const activeTargets = T.filter((t) => t.active);

  // การ์ดตัวอย่างไว้ให้ดูก่อนเปิดใช้จริง
  const samples = [
    {
      key: "approval_new", th: "มีเรื่องรออนุมัติ",
      alt: "มีเรื่องรออนุมัติ APV-2569-0001",
      bubble: cardApprovalNew({
        code: "APV-2569-0001", kindTh: "เลื่อนกำหนดชำระ / ขอเครดิต",
        title: "ขอเลื่อนกำหนดชำระ INV-2569-0004 ออกไป 15 วัน",
        reason: "ลูกค้าแจ้งว่ารอบวางบิลของเขาปิดไปแล้ว ขอเลื่อนไปรอบหน้า เป็นลูกค้าประจำ",
        amount: 13125, requester: "ฝ่ายขาย", targetCode: "INV-2569-0004",
      }),
    },
    {
      key: "daily_summary", th: "สรุปประจำวัน",
      alt: "สรุปประจำวัน 4 กันยายน 2569",
      bubble: cardDailySummary({
        dateTh: "4 กันยายน 2569",
        openJobs: 3, lateJobs: 1, outstanding: 26950, overdueCount: 2,
        pendingApprovals: 1, pendingAmount: 13125, lowStock: 4, openPo: 1,
        hotJobs: [
          { code: "JOB-2569-0002", title: "เสื้อทีมอีเวนต์", note: "เลย 3 วัน" },
          { code: "JOB-2569-0003", title: "เสื้อโปโลพนักงาน", note: "รอตรวจ QC" },
        ],
      }),
    },
    {
      key: "payment_in", th: "เงินเข้า",
      alt: "รับเงินเข้าแล้ว 1,000 บาท",
      bubble: cardPaymentIn({
        amount: 1000, invoiceCode: "INV-2569-0004", customer: "บริษัท กรีนลีฟ จำกัด",
        method: "โอน", outstanding: 12125, by: "ฝ่ายบัญชี",
      }),
    },
    {
      key: "qc_fail", th: "ตรวจคุณภาพไม่ผ่าน",
      alt: "ตรวจคุณภาพไม่ผ่าน JOB-2569-0003",
      bubble: cardQcFail({
        jobCode: "JOB-2569-0003", jobTitle: "เสื้อโปโลพนักงาน 200 ตัว",
        checked: 40, pass: 34, result: "ส่งซ่อม",
        reasons: "ตะเข็บข้างหลุด 4 ตัว สีสกรีนเพี้ยน 2 ตัว", by: "ฝ่ายตรวจคุณภาพ",
      }),
    },
    {
      key: "stock_low", th: "ของใกล้หมด",
      alt: "ของใกล้หมด 4 รายการ",
      bubble: cardStockLow({
        items: [
          { code: "CB30-BLK-L", name: "Comb 30 ดำ L", available: 12, reorder: 50 },
          { code: "CB30-WHT-M", name: "Comb 30 ขาว M", available: 8, reorder: 50 },
          { code: "OE20-BLK-XL", name: "OE 20 ดำ XL", available: 5, reorder: 30 },
        ],
      }),
    },
    {
      key: "invoice_overdue", th: "ใบวางบิลเลยกำหนด",
      alt: "ใบวางบิลเลยกำหนดชำระ 2 ใบ",
      bubble: cardInvoiceOverdue({
        count: 2, total: 20725,
        items: [
          { code: "INV-2569-0004", name: "บริษัท กรีนลีฟ", days: 11 },
          { code: "INV-2569-0006", name: "ร้านสปอร์ตคลับ", days: 4 },
        ],
      }),
    },
    {
      key: "job_late", th: "งานเลยกำหนดส่ง",
      alt: "งานเลยกำหนดส่ง 1 งาน",
      bubble: cardJobLate({
        jobs: [{ code: "JOB-2569-0002", title: "เสื้อทีมอีเวนต์", days: 3 }],
      }),
    },
    {
      key: "approval_done", th: "ผลอนุมัติ",
      alt: "เจ้าของอนุมัติแล้ว APV-2569-0002",
      bubble: cardApprovalDone({
        code: "APV-2569-0002", kindTh: "ลดราคาเกินเพดาน",
        title: "ขอลดราคา 15 เปอร์เซ็นต์ งานยูนิฟอร์มสาขาใหม่",
        approved: true, decider: "เจ้าของ", hours: 72,
        note: "อนุมัติได้ แต่ต้องได้ใบสั่งซื้อสองสาขาถัดไปภายในเดือนหน้า",
      }),
    },
  ];

  return (
    <>
      <PageHead
        eyebrow="ตั้งค่า · แจ้งเตือนเข้าไลน์"
        title="LINE ALERTS"
        lead="ส่งการ์ดแจ้งเตือนเข้ากลุ่มไลน์ของทีม ผ่านบัญชีทางการและ Messaging API"
        right={<LinkBtn href="/settings">กลับหน้าตั้งค่า</LinkBtn>}
      />

      <Section title="สถานะการเชื่อมต่อ">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="สถานะ" value={health?.enabled ? "เปิดอยู่" : "ปิดอยู่"}
                tone={health?.enabled ? "ok" : "warn"}
                hint={health?.has_token ? "ใส่โทเคนแล้ว" : "ยังไม่ได้ใส่โทเคน"} />
          <Stat label="ปลายทางที่ใช้งาน" value={num(health?.targets ?? 0)} unit="กลุ่ม"
                hint={activeTargets.length ? "พร้อมรับข้อความ" : "ยังไม่มีปลายทาง"}
                tone={activeTargets.length ? undefined : "warn"} />
          <Stat label="ส่งไปแล้ว 7 วัน" value={num(health?.sent_7d ?? 0)} unit="ครั้ง"
                hint={health?.last_ok ? `ล่าสุด ${ago(health.last_ok)}` : "ยังไม่เคยส่ง"} />
          <Stat label="ส่งไม่สำเร็จ 7 วัน" value={num(health?.failed_7d ?? 0)} unit="ครั้ง"
                tone={Number(health?.failed_7d ?? 0) > 0 ? "bad" : undefined}
                hint={Number(health?.failed_7d ?? 0) > 0 ? "ดูสาเหตุที่ประวัติด้านล่าง" : "ไม่มีปัญหา"} />
        </div>
      </Section>

      {/* ---------------------------------------------------------- วิธีตั้งค่า */}
      <Section title="ตั้งค่าครั้งแรก" hint="ทำตามสี่ขั้นนี้ครั้งเดียว">
        <div className="grid gap-3 md:grid-cols-2">
          <Note tone="info" title="ขั้นที่ 1 · สร้างบัญชีทางการและช่องทาง">
            เข้า developers.line.biz เข้าสู่ระบบด้วยบัญชีไลน์ของร้าน
            สร้าง Provider แล้วสร้าง Channel แบบ Messaging API
            ระบบจะสร้างบัญชีทางการให้อัตโนมัติ พร้อมคิวอาร์โค้ดของบอท
          </Note>
          <Note tone="info" title="ขั้นที่ 2 · คัดลอกโทเคนมาใส่ด้านล่าง">
            ในหน้า Channel เลื่อนไปแท็บ Messaging API
            กด Issue ที่ช่อง Channel access token แบบอายุยาว แล้วคัดลอกมาวาง
            ส่วน Channel secret อยู่ในแท็บ Basic settings
          </Note>
          <Note tone="info" title="ขั้นที่ 3 · เชิญบอทเข้ากลุ่ม">
            สแกนคิวอาร์โค้ดเพิ่มบอทเป็นเพื่อน แล้วเชิญเข้ากลุ่มที่ต้องการ
            อย่าลืมเปิด Allow bot to join group chats ในหน้า Console
            ระบบจะจับรหัสกลุ่มให้เองแล้วขึ้นในรายการปลายทางด้านล่าง
          </Note>
          <Note tone="warn" title="ขั้นที่ 4 · ใส่ที่อยู่รับข้อมูลจากไลน์">
            ในแท็บ Messaging API ช่อง Webhook URL ให้ใส่ที่อยู่เว็บของคุณต่อท้ายด้วย
            <span className="mt-1 block break-all font-medium">/api/line/webhook</span>
            แล้วเปิด Use webhook ถ้าไม่ทำขั้นนี้ ระบบจะจับรหัสกลุ่มให้ไม่ได้
            ต้องไปหารหัสกลุ่มเองซึ่งยากมาก
          </Note>
        </div>
      </Section>

      {/* ---------------------------------------------------------- โทเคน */}
      <Section title="โทเคนและการเปิดใช้งาน">
        <div className="card p-5">
          <ActionForm action={saveLineSettings} submitLabel="บันทึกการตั้งค่า">
            <label className="mb-3 block">
              <span className="label">Channel access token</span>
              <input name="channel_token" className="field" autoComplete="off"
                     defaultValue={st?.channel_token ? MASK : ""}
                     placeholder="วางโทเคนแบบอายุยาวจากหน้า Messaging API" />
            </label>
            <label className="mb-3 block">
              <span className="label">Channel secret</span>
              <input name="channel_secret" className="field" autoComplete="off"
                     defaultValue={st?.channel_secret ? MASK : ""}
                     placeholder="ใช้ตรวจว่าข้อมูลที่ส่งเข้ามาจากไลน์จริง" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">เวลาส่งสรุปประจำวัน</span>
                <input name="daily_summary_time" className="field" defaultValue={st?.daily_summary_time ?? "08:30"}
                       placeholder="08:30" />
              </label>
              <label className="flex items-center gap-2 self-end border border-line bg-white px-3 py-2 text-[13px]">
                <input type="checkbox" name="enabled" className="h-3.5 w-3.5 accent-ink"
                       defaultChecked={st?.enabled ?? false} />
                เปิดใช้งานการแจ้งเตือน
              </label>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink/45">
              โทเคนแสดงเป็นจุดเพื่อไม่ให้หลุดตอนแชร์หน้าจอ ถ้าไม่ต้องการเปลี่ยนก็ไม่ต้องแตะช่องนี้
              เก็บไว้ในฐานข้อมูลและอ่านได้เฉพาะเจ้าของเท่านั้น
            </p>
          </ActionForm>
        </div>
      </Section>

      {/* ---------------------------------------------------------- ปลายทาง */}
      <Section
        title={`ปลายทาง ${T.length} รายการ`}
        hint="กลุ่มที่ระบบจับได้จะปิดไว้ก่อน ให้ตรวจว่าใช่กลุ่มที่ต้องการแล้วค่อยเปิด"
        right={
          <ModalButton variant="ghost" label="เพิ่มปลายทางเอง" title="เพิ่มปลายทาง"
                       subtitle="ใช้เมื่อรู้รหัสกลุ่มอยู่แล้ว">
            <ActionForm action={addLineTarget} submitLabel="เพิ่มปลายทาง">
              <label className="mb-3 block">
                <span className="label">ชื่อที่ใช้เรียก</span>
                <input name="name" className="field" required placeholder="เช่น กลุ่มบัญชี" />
              </label>
              <label className="mb-3 block">
                <span className="label">รหัสจากไลน์</span>
                <input name="target_id" className="field" required
                       placeholder="ขึ้นต้นด้วย C สำหรับกลุ่ม หรือ U สำหรับคนเดียว" />
              </label>
              <label className="mb-3 block">
                <span className="label">ชนิด</span>
                <select name="target_type" className="field">
                  <option value="group">กลุ่ม</option>
                  <option value="user">คนเดียว</option>
                  <option value="room">ห้องแชท</option>
                </select>
              </label>
              <label className="block">
                <span className="label">บันทึก</span>
                <input name="note" className="field" />
              </label>
            </ActionForm>
          </ModalButton>
        }
      >
        {T.length === 0 ? (
          <Empty
            title="ยังไม่มีปลายทาง"
            hint="เชิญบอทเข้ากลุ่มที่ต้องการ แล้วพิมพ์อะไรก็ได้ในกลุ่มนั้นหนึ่งครั้ง ระบบจะจับรหัสให้เอง"
          />
        ) : (
          <Table head={["ชื่อ", "ชนิด", "รหัส", "สถานะ", ""]}>
            {T.map((t) => (
              <tr key={t.id} className="border-b border-line-soft last:border-0">
                <Td>
                  {t.name}
                  {t.note && <span className="mt-0.5 block text-[11px] text-ink/45">{t.note}</span>}
                </Td>
                <Td>{t.target_type === "group" ? "กลุ่ม" : t.target_type === "user" ? "คนเดียว" : "ห้องแชท"}</Td>
                <Td><span className="tnum text-[11px] text-ink/45">{t.target_id.slice(0, 14)}…</span></Td>
                <Td><Tag tone={t.active ? "ok" : "mute"}>{t.active ? "ใช้งานอยู่" : "ปิดไว้"}</Tag></Td>
                <Td align="right">
                  <span className="flex justify-end gap-2">
                    <ModalButton label="ส่งทดสอบ" title="ส่งข้อความทดสอบ" subtitle={t.name}>
                      <p className="mb-3 leading-relaxed text-ink/70">
                        ระบบจะส่งการ์ดทดสอบเข้าปลายทางนี้ทันที ถ้าเห็นในไลน์แปลว่าตั้งค่าถูกแล้ว
                      </p>
                      <ActionForm action={sendLineTest} submitLabel="ส่งทดสอบเลย">
                        <input type="hidden" name="target_id" value={t.target_id} />
                      </ActionForm>
                    </ModalButton>
                    <ModalButton label="ลบ" title="ลบปลายทาง" subtitle={t.name}>
                      <p className="mb-4 leading-relaxed">
                        ลบแล้วเหตุการณ์ที่เคยส่งเข้าปลายทางนี้จะไม่ส่งอีก ประวัติการส่งเดิมยังอยู่
                      </p>
                      <ActionForm action={removeLineTarget} submitLabel="ยืนยันลบ" danger>
                        <input type="hidden" name="id" value={t.id} />
                      </ActionForm>
                    </ModalButton>
                  </span>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* ---------------------------------------------------------- เหตุการณ์ */}
      <Section title="เหตุการณ์ที่จะแจ้ง" hint="เลือกได้ว่าเรื่องไหนส่งเข้ากลุ่มไหน ไม่เลือกคือส่งเข้าทุกกลุ่มที่เปิดอยู่">
        <div className="card p-5">
          <ActionForm action={saveLineEvents} submitLabel="บันทึกการแจ้งเตือน">
            <div className="space-y-2">
              {(events ?? []).map((e) => (
                <div key={e.key} className="grid items-center gap-3 border-b border-line-soft pb-2 sm:grid-cols-[auto_minmax(0,1fr)_220px]">
                  <input type="checkbox" name={`on_${e.key}`} defaultChecked={e.enabled}
                         className="h-4 w-4 accent-ink" aria-label={e.th} />
                  <div className="min-w-0">
                    <p className="text-[13.5px]">{e.th}</p>
                    <p className="text-[11.5px] leading-relaxed text-ink/45">{e.hint}</p>
                  </div>
                  <select name={`target_${e.key}`} className="field" defaultValue={e.target_id ?? ""}>
                    <option value="">ทุกกลุ่มที่เปิดอยู่</option>
                    {activeTargets.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </ActionForm>
        </div>
      </Section>

      {/* ---------------------------------------------------------- พรีวิว */}
      <Section
        title="หน้าตาการ์ดที่จะส่ง"
        hint="กดดูได้ทุกแบบ เป็นการ์ดชุดเดียวกับที่ระบบส่งจริง"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {samples.map((s) => (
            <ModalButton
              key={s.key}
              variant="ghost"
              className="justify-start text-left"
              label={s.th}
              title={`การ์ด ${s.th}`}
              subtitle="ตัวอย่างจากข้อมูลจำลอง"
            >
              <div className="flex justify-center">
                <FlexPreview bubble={s.bubble} alt={s.alt} />
              </div>
            </ModalButton>
          ))}
        </div>
      </Section>

      {/* ---------------------------------------------------------- ประวัติ */}
      <Section title="ประวัติการส่งล่าสุด" hint="เก็บทุกครั้งทั้งสำเร็จและล้มเหลว">
        <Table head={["เมื่อ", "เหตุการณ์", "ปลายทาง", "หัวข้อ", "ผล"]} empty="ยังไม่เคยส่ง">
          {(logs ?? []).map((l) => (
            <tr key={l.id} className="border-b border-line-soft last:border-0">
              <Td>{thDateTime(l.created_at)}</Td>
              <Td>{l.event_key}</Td>
              <Td>{l.target_name ?? "—"}</Td>
              <Td>{l.title}</Td>
              <Td align="right">
                {l.ok ? (
                  <Tag tone="ok">ส่งแล้ว</Tag>
                ) : (
                  <ModalButton label="ไม่สำเร็จ" title="สาเหตุที่ส่งไม่สำเร็จ" subtitle={l.title ?? undefined}>
                    <div className="divide-y divide-line-soft">
                      <KV k="เหตุการณ์" v={l.event_key ?? "—"} />
                      <KV k="ปลายทาง" v={l.target_name ?? l.target_id ?? "—"} />
                      <KV k="เมื่อ" v={thDateTime(l.created_at)} mono />
                      <KV k="ลองแล้ว" v={`${l.attempts} ครั้ง`} mono />
                    </div>
                    <p className="mt-4 border border-signal-bad/25 bg-signal-badbg px-3 py-2 text-[12px] leading-relaxed text-signal-bad">
                      {l.error ?? "ไม่ทราบสาเหตุ"}
                    </p>
                    <p className="mt-3 text-[12px] leading-relaxed text-ink/55">
                      สาเหตุที่พบบ่อยคือโทเคนหมดอายุหรือคัดลอกมาไม่ครบ
                      บอทถูกเตะออกจากกลุ่มแล้ว หรือแพ็กเกจไลน์ใช้ข้อความครบโควตาของเดือนนั้น
                    </p>
                  </ModalButton>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
