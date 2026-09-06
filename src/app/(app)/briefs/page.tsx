import { supabaseServer } from "@/lib/supabase/server";
import { PageHead, Section, Table, Td, Tag, Stat, Note, Empty } from "@/components/ui";
import { ModalButton } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { setInquiryStatus, quoteFromInquiry } from "@/actions/inquiries";
import { NewBriefForm } from "./new-brief";
import { money, num, thDate, ago } from "@/lib/format";

export const dynamic = "force-dynamic";

// ============================================================================
// หน้าบรีฟ หรือคำขอราคา
//
// ขั้นแรกสุดของสายงาน ก่อนที่จะมีเอกสารใด ๆ เกิดขึ้น
// ทุกช่องทางที่ลูกค้าทักมา ถูกจดไว้ที่เดียวกันหมด ไม่หายไปในแชท
//
// ที่หน้านี้ทำได้สามอย่าง คือ จดบรีฟใหม่ · เปลี่ยนสถานะ · ออกใบเสนอราคาต่อ
// ============================================================================

const TONE: Record<string, "info" | "warn" | "ok" | "mute"> = {
  "ใหม่": "info",
  "กำลังเสนอราคา": "warn",
  "ปิดการขาย": "ok",
  "ไม่สนใจ": "mute",
};

const NEXT: Record<string, string[]> = {
  "ใหม่": ["กำลังเสนอราคา", "ไม่สนใจ"],
  "กำลังเสนอราคา": ["ปิดการขาย", "ไม่สนใจ"],
  "ปิดการขาย": [],
  "ไม่สนใจ": ["ใหม่"],
};

export default async function BriefsPage() {
  const sb = supabaseServer();
  const [{ data: briefs }, { data: customers }] = await Promise.all([
    sb.from("inquiries").select("*").order("created_at", { ascending: false }),
    sb.from("customers").select("id, name").order("name"),
  ]);

  const B = briefs ?? [];
  const cusName = new Map<string, string>(
    (customers ?? []).map((c) => [String(c.id), String(c.name)] as [string, string]),
  );

  const open = B.filter((b) => b.status === "ใหม่" || b.status === "กำลังเสนอราคา");
  const won = B.filter((b) => b.status === "ปิดการขาย");
  const lost = B.filter((b) => b.status === "ไม่สนใจ");

  // มูลค่าที่ยังไม่รู้ผล คือจำนวนคูณงบต่อตัวของบรีฟที่ยังเปิดอยู่
  // เป็นตัวเลขคร่าว ๆ จากปากลูกค้า ไม่ใช่ยอดจริง จึงเขียนกำกับไว้ให้ชัด
  const pipeline = open.reduce(
    (a, b) => a + Number(b.qty_estimate ?? 0) * Number(b.budget_per_unit ?? 0),
    0,
  );

  // ปิดการขายได้กี่เปอร์เซ็นต์ นับเฉพาะบรีฟที่รู้ผลแล้ว
  // บรีฟที่ยังค้างอยู่ไม่เอามาหาร เพราะยังไม่แพ้และยังไม่ชนะ
  const decided = won.length + lost.length;
  const winPct = decided > 0 ? (won.length / decided) * 100 : 0;

  return (
    <>
      <PageHead
        eyebrow="บรีฟ / คำขอราคา"
        title="BRIEFS"
        lead="ทุกช่องทางที่ลูกค้าทักมา จดไว้ที่เดียวกัน บรีฟที่ยังไม่ตอบจะค้างให้เห็น ไม่หายไปในแชท"
        right={
          <ModalButton
            variant="solid"
            label="บันทึกบรีฟใหม่"
            title="บันทึกบรีฟใหม่"
            subtitle="กรอกเท่าที่ลูกค้าบอกมา ที่เหลือเติมทีหลังได้"
          >
            <NewBriefForm customers={(customers ?? []).map((c) => ({ id: String(c.id), name: String(c.name) }))} />
          </ModalButton>
        }
      />

      <Section title="ตัวเลขรวม" hint="นับจากบรีฟทั้งหมดที่บันทึกไว้ในระบบ">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="บรีฟที่ยังไม่รู้ผล" value={num(open.length)} unit="เรื่อง"
                hint="ยังต้องตามต่อ" />
          <Stat label="มูลค่าที่ยังไม่รู้ผล" value={money(pipeline, 0)} unit="บาท"
                hint="ประมาณจากจำนวนคูณงบต่อตัวที่ลูกค้าบอก" />
          <Stat label="ปิดการขายได้" value={money(winPct, 1)} unit="%"
                hint={`ชนะ ${won.length} จากที่รู้ผลแล้ว ${decided} เรื่อง`} />
          <Stat label="บรีฟทั้งหมด" value={num(B.length)} unit="เรื่อง"
                hint="รวมทุกสถานะตั้งแต่เปิดระบบ" />
        </div>
      </Section>

      <Section
        title="บรีฟที่ยังต้องตาม"
        hint="เรียงจากที่เข้ามาใหม่สุด เรื่องที่ค้างนานควรตามก่อน"
      >
        {open.length === 0 ? (
          <Empty
            title="ไม่มีบรีฟค้างอยู่"
            hint="ทุกเรื่องที่ลูกค้าถามมา ตอบไปหมดแล้ว"
          />
        ) : (
          <Table head={["เลขที่", "ลูกค้า", "โจทย์", "จำนวน", "งบ/ตัว", "อยากได้ภายใน", "ทาง", "สถานะ", ""]}>
            {open.map((b) => (
              <BriefRow key={String(b.id)} b={b} cusName={cusName} />
            ))}
          </Table>
        )}
      </Section>

      <Section title="บรีฟที่รู้ผลแล้ว" hint="เก็บไว้ให้ครบ เพราะเรื่องที่ไม่ได้งานคือตัวหารของอัตราปิดการขาย">
        <Table head={["เลขที่", "ลูกค้า", "โจทย์", "จำนวน", "งบ/ตัว", "เข้ามาเมื่อ", "ทาง", "สถานะ", ""]}
               empty="ยังไม่มีบรีฟที่รู้ผล">
          {[...won, ...lost].map((b) => (
            <BriefRow key={String(b.id)} b={b} cusName={cusName} showAge />
          ))}
        </Table>
      </Section>

      <Note tone="info" title="ทำไมต้องจดบรีฟที่ลูกค้าไม่เอาด้วย">
        เพราะอัตราปิดการขายคำนวณจากเรื่องที่รู้ผลทั้งหมด ถ้าจดแต่เรื่องที่ได้งาน
        ตัวเลขในหน้ารายงานจะสวยเกินจริงจนใช้ตัดสินใจไม่ได้
        และจำนวนเรื่องที่ไม่ได้งานยังบอกด้วยว่าราคาหรือระยะเวลาของเราหลุดจากตลาดตรงไหน
      </Note>
    </>
  );
}

function BriefRow({
  b, cusName, showAge,
}: {
  b: Record<string, unknown>;
  cusName: Map<string, string>;
  showAge?: boolean;
}) {
  const status = String(b.status ?? "ใหม่");
  const id = String(b.id);
  const brief = [b.brief_who, b.brief_where, b.brief_duration].filter(Boolean).join(" · ");
  const moves = NEXT[status] ?? [];

  return (
    <tr className="border-b border-line-soft last:border-0">
      <Td><span className="tnum">{String(b.code ?? "—")}</span></Td>
      <Td>{b.customer_id ? cusName.get(String(b.customer_id)) ?? "—" : "ยังไม่ระบุ"}</Td>
      <Td>
        <span className="block max-w-[280px] truncate" title={brief}>
          {brief || "—"}
        </span>
      </Td>
      <Td align="right"><span className="tnum">{num(Number(b.qty_estimate ?? 0))}</span></Td>
      <Td align="right"><span className="tnum">{money(Number(b.budget_per_unit ?? 0), 0)}</span></Td>
      <Td>{showAge ? ago(b.created_at as string) : thDate(b.deadline as string)}</Td>
      <Td><span className="text-[12px] text-ink/55">{String(b.channel ?? "—")}</span></Td>
      <Td><Tag tone={TONE[status] ?? "mute"}>{status}</Tag></Td>
      <Td align="right">
        <span className="flex justify-end gap-2">
          {status !== "ปิดการขาย" && (
            <ModalButton
              label="ออกใบเสนอราคา"
              title="ออกร่างใบเสนอราคาจากบรีฟนี้"
              subtitle={brief || String(b.code ?? "")}
            >
              <p className="mb-4 leading-relaxed">
                ระบบจะสร้างร่างใบเสนอราคาพร้อมข้อมูลลูกค้าและโจทย์ที่จดไว้ให้เลย
                ร่างยังไม่กินเลขที่เอกสาร ไปเติมรายการและราคาต่อได้ที่หน้าร่างเอกสาร
              </p>
              <ActionForm action={quoteFromInquiry} submitLabel="สร้างร่างใบเสนอราคา">
                <input type="hidden" name="id" value={id} />
              </ActionForm>
            </ModalButton>
          )}
          {moves.length > 0 && (
            <ModalButton label="เปลี่ยนสถานะ" title="เปลี่ยนสถานะบรีฟ" subtitle={brief}>
              <p className="mb-4 leading-relaxed">
                ตอนนี้อยู่ที่ <b>{status}</b> เลือกสถานะถัดไป
              </p>
              <ActionForm action={setInquiryStatus} submitLabel="บันทึกสถานะ">
                <input type="hidden" name="id" value={id} />
                <select name="status" className="field mb-3" defaultValue={moves[0]}>
                  {moves.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </ActionForm>
            </ModalButton>
          )}
        </span>
      </Td>
    </tr>
  );
}
