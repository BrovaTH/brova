import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHead, Section, Table, Td, Tag, Note, Stat } from "@/components/ui";
import { ModalButton } from "@/components/modal";
import { money, num, priceTag } from "@/lib/format";
import { FABRIC_GROUPS, sizeRank } from "@/lib/workflow";

export const dynamic = "force-dynamic";

const GRADE_TONE: Record<string, "ok" | "info" | "warn" | "mute"> = {
  A: "ok",
  B: "info",
  C: "warn",
};

export default async function FabricsPage() {
  const sb = supabaseServer();
  const [{ data: fabrics }, { data: sizes }] = await Promise.all([
    sb.from("fabric_catalog_view").select("*").order("sort_order"),
    sb.from("fabric_sizes").select("*"),
  ]);

  const F = fabrics ?? [];
  const byFabric = new Map<string, typeof sizes>();
  for (const s of sizes ?? []) {
    const arr = byFabric.get(s.fabric_code) ?? [];
    arr.push(s);
    byFabric.set(s.fabric_code, arr as never);
  }

  const cheapest = F.reduce(
    (m, f) => (Number(f.price_min) < m ? Number(f.price_min) : m),
    Infinity,
  );
  const totalStock = F.reduce((a, f) => a + Number(f.qty_on_hand ?? 0), 0);

  return (
    <>
      <PageHead
        eyebrow="คลังผ้า"
        title="ผ้าที่รับทำและราคาตามไซส์"
        lead="ราคาต่อตัวตามตารางจริง กดที่ชื่อผ้าเพื่อดูข้อดี ข้อเสีย และงานที่เหมาะ"
      />

      <Section title="ภาพรวม">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="ชนิดผ้าที่รับทำ" value={num(F.length)} unit="ชนิด" hint="ตามตารางราคาจริง" />
          <Stat label="ราคาเริ่มต้น" value={priceTag(cheapest)} unit="บาท/ตัว" hint="ไซส์เล็กสุดของผ้าถูกสุด" />
          <Stat label="ของในคลัง" value={num(totalStock)} unit="ตัว" hint="รวมทุกไซส์ทุกสี" />
          <Stat label="ไซส์ที่ทำได้" value="6" unit="ไซส์" hint="S ถึง 3XL · 3XL ต้องขอราคา" />
        </div>
      </Section>

      <Section
        title="ตารางราคาตามไซส์"
        hint="ราคาไซส์ 3XL ยังไม่ได้ยืนราคา ต้องเช็กกับโรงงานก่อนเสนอลูกค้า"
      >
        <Table
          head={["ผ้า", "เกรด", "กลุ่มสต็อก", "แกรม", "S", "M", "L", "XL", "2XL", "3XL", "ในคลัง", ""]}
          empty="ยังไม่มีข้อมูลผ้า"
        >
          {F.map((f) => {
            const ss = ((byFabric.get(f.code) ?? []) as {
              size: string; chest_in: number; length_in: number; price: number; is_quoted: boolean;
            }[])
              .slice()
              .sort((a, b) => sizeRank(a.size) - sizeRank(b.size));
            const bySize = Object.fromEntries(ss.map((s) => [s.size, s]));
            return (
              <tr key={f.code} className="border-b border-line-soft last:border-0">
                <Td>
                  <span className="block">{f.name_th ?? f.name}</span>
                  <span className="tnum text-[11px] text-ink/35">{f.code}</span>
                </Td>
                <Td><Tag tone={GRADE_TONE[f.grade] ?? "mute"}>{f.grade}</Tag></Td>
                <Td><span className="text-[12px] text-ink/55">{f.stock_group}</span></Td>
                <Td align="right"><span className="tnum text-ink/55">{f.gsm ?? "—"}</span></Td>
                {["S", "M", "L", "XL", "2XL", "3XL"].map((sz) => {
                  const cell = bySize[sz];
                  return (
                    <Td key={sz} align="right">
                      {cell ? (
                        <span className={`tnum ${cell.is_quoted ? "" : "text-ink/35"}`}>
                          {priceTag(cell.price)}
                          {!cell.is_quoted && <span className="ml-0.5 text-[10px]">*</span>}
                        </span>
                      ) : (
                        <span className="text-ink/20">—</span>
                      )}
                    </Td>
                  );
                })}
                <Td align="right"><span className="tnum">{num(f.qty_on_hand)}</span></Td>
                <Td align="right">
                  <ModalButton
                    label="ดูรายละเอียด"
                    title={f.name_th ?? f.name}
                    subtitle={`${f.code} · เกรด ${f.grade} · ${f.gsm ?? "—"} แกรม`}
                    wide
                  >
                    <FabricDetail f={f} sizes={ss} />
                  </ModalButton>
                </Td>
              </tr>
            );
          })}
        </Table>
        <p className="mt-2 text-[11px] text-ink/40">
          * ราคาที่ยังไม่ได้ยืน ใช้เป็นราคาประมาณเท่านั้น ต้องยืนยันกับโรงงานก่อนเสนอลูกค้า
        </p>
      </Section>

      <Section
        title="กลุ่มนโยบายสต็อก"
        hint="คนละเรื่องกับเกรดผ้า กลุ่มนี้บอกว่าเราเก็บของแบบไหนและใช้เวลาเตรียมนานเท่าไร"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FABRIC_GROUPS.map((g) => (
            <div key={g.code} className="card p-4">
              <p className="text-[13px] font-medium">
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center bg-ink text-[11px] text-bone">
                  {g.code}
                </span>
                {g.th}
              </p>
              <p className="mt-2 text-[12px] text-ink/55">นโยบาย {g.policy}</p>
              <p className="text-[12px] text-ink/55">เตรียมของ {g.lead}</p>
            </div>
          ))}
        </div>
      </Section>

      <Note tone="info" title="เกรดผ้ากับกลุ่มสต็อกไม่ใช่เรื่องเดียวกัน">
        เกรด A B C บอกคุณภาพเนื้อผ้าตามตารางราคา ส่วนกลุ่ม A ถึง D บอกว่าเราเก็บสต็อกแบบไหน
        ผ้าเกรดดีบางตัวอยู่ในกลุ่มที่ต้องสั่งล่วงหน้า เพราะไม่ได้เก็บของไว้ประจำ
      </Note>
    </>
  );
}

function FabricDetail({
  f, sizes,
}: {
  f: Record<string, unknown>;
  sizes: { size: string; chest_in: number; length_in: number; price: number; is_quoted: boolean }[];
}) {
  const pros = (f.pros as string[]) ?? [];
  const cons = (f.cons as string[]) ?? [];

  return (
    <div className="space-y-5">
      {f.intro ? <p className="leading-relaxed">{String(f.intro)}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="label">เหมาะกับงานแบบไหน</p>
          <p className="leading-relaxed">{String(f.usage_th ?? "—")}</p>
        </div>
        <div>
          <p className="label">ส่วนผสม</p>
          <p className="leading-relaxed">{String(f.composition ?? "—")}</p>
        </div>
      </div>

      <div>
        <p className="label">ราคาและขนาดตามไซส์</p>
        <div className="overflow-x-auto border border-line">
          <table className="w-full min-w-[420px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-line bg-bone-200/60">
                {["ไซส์", "รอบอก (นิ้ว)", "ความยาว (นิ้ว)", "ราคา/ตัว"].map((h, i) => (
                  <th key={i} className={`px-3 py-2 text-[10px] font-normal uppercase tracking-wide2 text-ink/45 ${i ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sizes.map((s) => (
                <tr key={s.size} className="border-b border-line-soft last:border-0">
                  <td className="px-3 py-1.5">{s.size}</td>
                  <td className="tnum px-3 py-1.5 text-right">{s.chest_in}</td>
                  <td className="tnum px-3 py-1.5 text-right">{s.length_in}</td>
                  <td className={`tnum px-3 py-1.5 text-right ${s.is_quoted ? "" : "text-ink/40"}`}>
                    {money(s.price, 0)}
                    {!s.is_quoted && <span className="ml-1 text-[10px]">ยังไม่ยืนราคา</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(pros.length > 0 || cons.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {pros.length > 0 && (
            <div>
              <p className="label">ข้อดี</p>
              <ul className="space-y-1.5">
                {pros.map((p, i) => (
                  <li key={i} className="flex gap-2 leading-relaxed">
                    <span className="mt-[7px] h-1 w-1 shrink-0 bg-signal-ok" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {cons.length > 0 && (
            <div>
              <p className="label">ข้อควรรู้</p>
              <ul className="space-y-1.5">
                {cons.map((c, i) => (
                  <li key={i} className="flex gap-2 leading-relaxed">
                    <span className="mt-[7px] h-1 w-1 shrink-0 bg-signal-warn" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="rule pt-4">
        <Link href={`/stock?q=${encodeURIComponent(String(f.code))}`}
              className="text-[12px] underline underline-offset-4">
          ดูของในคลังของผ้าชนิดนี้ · มีอยู่ {num(Number(f.qty_on_hand ?? 0))} ตัว
        </Link>
      </div>
    </div>
  );
}
