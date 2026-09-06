import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHead, Section, Table, Td, Tag, Stat, Note, LinkBtn } from "@/components/ui";
import { money, num, thDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// ============================================================================
// หน้าใบเสนอราคาที่ออกเลขแล้ว
//
// แยกจากหน้าร่างเอกสารโดยตั้งใจ เพราะสองอย่างนี้คนละสถานะทางกฎหมาย
// ร่างคือของที่ยังคุยกันได้ ใบที่ออกเลขแล้วคือของที่ส่งออกไปแล้วและแก้ไม่ได้
// เอามาปนกันเมื่อไร คนใช้จะเผลอคิดว่าใบที่ส่งไปแล้วยังแก้ได้
// ============================================================================

const TONE: Record<string, "ok" | "warn" | "bad" | "info" | "mute"> = {
  Draft: "mute",
  Sent: "warn",
  Accepted: "ok",
  Rejected: "bad",
  Expired: "mute",
  Superseded: "mute",
};

const TH_STATUS: Record<string, string> = {
  Sent: "ส่งให้ลูกค้าแล้ว",
  Accepted: "ลูกค้าตกลง",
  Rejected: "ลูกค้าไม่เอา",
  Expired: "หมดอายุ",
  Superseded: "ถูกใบใหม่แทน",
};

export default async function QuotationsPage() {
  const sb = supabaseServer();
  const { data: quotes } = await sb
    .from("quotations")
    .select("id, code, status, party_name, issued_at, valid_until, grand_total, rev_no, deposit_pct")
    .not("code", "is", null)
    .order("issued_at", { ascending: false });

  const Q = quotes ?? [];
  const total = Q.reduce((a, q) => a + Number(q.grand_total ?? 0), 0);
  const waiting = Q.filter((q) => q.status === "Sent");
  const won = Q.filter((q) => q.status === "Accepted");
  const wonValue = won.reduce((a, q) => a + Number(q.grand_total ?? 0), 0);

  // ปิดการขายได้กี่เปอร์เซ็นต์ นับเฉพาะใบที่รู้ผลแล้ว
  // ใบที่ยังรอลูกค้าตอบไม่เอามาหาร เพราะยังไม่แพ้และยังไม่ชนะ
  const decided = Q.filter((q) => q.status === "Accepted" || q.status === "Rejected").length;
  const winPct = decided > 0 ? (won.length / decided) * 100 : 0;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHead
        eyebrow="ใบเสนอราคา"
        title="QUOTATIONS"
        lead="ใบที่ออกเลขแล้วทั้งหมด ออกเลขแล้วล็อกทันที ดูและพิมพ์ได้อย่างเดียว อยากแก้ต้องออกใบใหม่"
        right={<LinkBtn href="/docs">ไปหน้าร่างเอกสาร</LinkBtn>}
      />

      <Section title="ตัวเลขรวม" hint="นับจากใบเสนอราคาที่ออกเลขแล้วทั้งหมด">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="ออกไปแล้ว" value={num(Q.length)} unit="ใบ"
                hint={`มูลค่ารวม ${money(total, 0)} บาท`} />
          <Stat label="รอลูกค้าตอบ" value={num(waiting.length)} unit="ใบ"
                hint="ส่งไปแล้วแต่ยังไม่ตอบกลับ ควรตามต่อ" />
          <Stat label="ลูกค้าตกลง" value={num(won.length)} unit="ใบ"
                hint={`คิดเป็นเงิน ${money(wonValue, 0)} บาท`} />
          <Stat label="ปิดการขายได้" value={money(winPct, 1)} unit="%"
                hint={`นับจากใบที่รู้ผลแล้ว ${decided} ใบ · เป้าไม่ต่ำกว่า 40%`} />
        </div>
      </Section>

      <Section
        title="ใบที่ยังรอลูกค้าตอบ"
        hint="ใบที่เลยวันยืนราคาแล้วขึ้นสีแดง ราคานั้นไม่ผูกมัดเราแล้ว"
      >
        <Table head={["เลขที่", "ลูกค้า", "วันที่ออก", "ยืนราคาถึง", "มัดจำ", "ยอดรวม", ""]}
               empty="ไม่มีใบที่ค้างรอลูกค้าตอบ">
          {waiting.map((q) => {
            const expired = q.valid_until && String(q.valid_until).slice(0, 10) < today;
            return (
              <tr key={String(q.id)} className="border-b border-line-soft last:border-0">
                <Td>
                  <span className="tnum">{String(q.code)}</span>
                  {Number(q.rev_no ?? 1) > 1 && (
                    <span className="ml-1.5 text-[11px] text-ink/45">แก้ครั้งที่ {String(q.rev_no)}</span>
                  )}
                </Td>
                <Td>{String(q.party_name ?? "—")}</Td>
                <Td>{thDate(q.issued_at as string)}</Td>
                <Td>
                  {thDate(q.valid_until as string)}
                  {expired && <span className="ml-1.5 text-[11px] text-signal-bad">เลยแล้ว</span>}
                </Td>
                <Td align="right"><span className="tnum">{String(q.deposit_pct ?? 50)}%</span></Td>
                <Td align="right"><span className="tnum">{money(Number(q.grand_total ?? 0))}</span></Td>
                <Td align="right">
                  <Link href={`/docs/quotation/${q.id}`} className="text-[12px] underline underline-offset-4">
                    เปิดเอกสาร
                  </Link>
                </Td>
              </tr>
            );
          })}
        </Table>
      </Section>

      <Section title="ใบเสนอราคาทั้งหมด" hint="เรียงจากใบใหม่สุด">
        <Table head={["เลขที่", "ลูกค้า", "วันที่ออก", "ยืนราคาถึง", "ยอดรวม", "สถานะ", ""]}
               empty="ยังไม่มีใบเสนอราคาที่ออกเลขแล้ว">
          {Q.map((q) => (
            <tr key={String(q.id)} className="border-b border-line-soft last:border-0">
              <Td>
                <span className="tnum">{String(q.code)}</span>
                {Number(q.rev_no ?? 1) > 1 && (
                  <span className="ml-1.5 text-[11px] text-ink/45">แก้ครั้งที่ {String(q.rev_no)}</span>
                )}
              </Td>
              <Td>{String(q.party_name ?? "—")}</Td>
              <Td>{thDate(q.issued_at as string)}</Td>
              <Td>{thDate(q.valid_until as string)}</Td>
              <Td align="right"><span className="tnum">{money(Number(q.grand_total ?? 0))}</span></Td>
              <Td>
                <Tag tone={TONE[String(q.status)] ?? "mute"}>
                  {TH_STATUS[String(q.status)] ?? String(q.status)}
                </Tag>
              </Td>
              <Td align="right">
                <Link href={`/docs/quotation/${q.id}`} className="text-[12px] underline underline-offset-4">
                  เปิดเอกสาร
                </Link>
              </Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Note tone="info" title="แก้ราคาหลังส่งใบไปแล้วต้องทำยังไง">
        ออกใบใหม่เป็นการแก้ครั้งถัดไป ไม่ใช่แก้ทับใบเดิม ใบเก่าจะถูกทำเครื่องหมายว่าถูกใบใหม่แทน
        แต่ยังเปิดดูย้อนหลังได้ เพราะลูกค้าอาจถือใบเก่าอยู่ในมือ ถ้าลบทิ้งจะพิสูจน์ไม่ได้ว่าเคยเสนออะไรไป
      </Note>
    </>
  );
}
