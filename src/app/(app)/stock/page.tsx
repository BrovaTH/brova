import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHead, Section, Stat, Table, Td, Tag, Note, LinkBtn, KV } from "@/components/ui";
import { ModalButton } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { adjustStock } from "@/actions/purchasing";
import { money, num, thDateTime } from "@/lib/format";
import { sizeRank, FABRIC_GROUP_MAP } from "@/lib/workflow";

export const dynamic = "force-dynamic";

export default async function StockPage({
  searchParams,
}: {
  searchParams: { q?: string; view?: string };
}) {
  const sb = supabaseServer();
  const [{ data: skus }, { data: moves }, { data: supplies }] = await Promise.all([
    sb.from("skus_view").select("*"),
    sb.from("stock_movements").select("*").order("created_at", { ascending: false }).limit(40),
    sb.from("supplies").select("*"),
  ]);

  const q = (searchParams.q ?? "").trim().toLowerCase();
  const view = searchParams.view ?? "low";

  const all = (skus ?? []).slice().sort((a, b) => {
    const f = (a.fabric_name ?? "").localeCompare(b.fabric_name ?? "", "th");
    if (f !== 0) return f;
    const c = (a.color_name ?? "").localeCompare(b.color_name ?? "", "th");
    if (c !== 0) return c;
    return sizeRank(a.size) - sizeRank(b.size);
  });

  const low = all.filter(
    (k) => Number(k.reorder_point ?? 0) > 0 && Number(k.qty_available ?? 0) <= Number(k.reorder_point ?? 0),
  );
  const zero = all.filter((k) => Number(k.qty_available ?? 0) <= 0);

  let rows = view === "low" ? low : view === "zero" ? zero : all;
  if (q)
    rows = rows.filter((k) =>
      `${k.code} ${k.fabric_name} ${k.color_name} ${k.size}`.toLowerCase().includes(q),
    );

  const totalPieces = all.reduce((a, k) => a + Number(k.qty_on_hand ?? 0), 0);
  const totalValue = all.reduce((a, k) => a + Number(k.qty_on_hand ?? 0) * Number(k.cost ?? 0), 0);
  const allocated = all.reduce((a, k) => a + Number(k.qty_allocated ?? 0), 0);

  return (
    <>
      <PageHead
        eyebrow="สต็อกและ SKU"
        title="STOCK & SKU"
        lead="นับรวมทั้งคลัง แยกไซส์และสี · ยอดว่างคือของที่ยังไม่ถูกจองให้งานไหน"
        right={
          <>
            <LinkBtn href="/stock/count">รอบนับสต็อก</LinkBtn>
            <LinkBtn href="/purchasing" solid>สั่งซื้อเพิ่ม</LinkBtn>
          </>
        }
      />

      <Section title="ภาพรวมคลัง">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="ของในคลัง" value={num(totalPieces)} unit="ตัว" hint={`${all.length} รหัสสินค้า`} />
          <Stat label="มูลค่าตามต้นทุน" value={money(totalValue, 0)} unit="บาท" hint="คิดจากต้นทุนต่อตัว" />
          <Stat label="ถูกจองไว้แล้ว" value={num(allocated)} unit="ตัว" hint="กันไว้ให้งานที่รับแล้ว" />
          <Stat label="ต่ำกว่าจุดสั่งซื้อ" value={num(low.length)} unit="รายการ"
                tone={low.length ? "warn" : undefined}
                hint={low.length ? "ควรเปิดใบสั่งซื้อ" : "ยังไม่ต้องเติม"} />
        </div>
      </Section>

      {zero.length > 0 && (
        <Section title="ของหมด">
          <Note tone="bad" title={`${zero.length} รหัสสินค้าไม่เหลือของว่างเลย`}>
            ถ้ามีงานเข้ามาต้องการรหัสเหล่านี้ จะรับงานไม่ได้ทันที ควรเช็กว่ามีใบสั่งซื้อค้างอยู่หรือยัง
          </Note>
        </Section>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {([
          ["low", `ต่ำกว่าจุดสั่งซื้อ ${low.length}`],
          ["zero", `ของหมด ${zero.length}`],
          ["all", `ทั้งหมด ${all.length}`],
        ] as const).map(([k, lb]) => (
          <Link
            key={k}
            href={`/stock?view=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`border px-3 py-1.5 text-[12px] ${
              view === k ? "border-ink bg-ink text-bone" : "border-line bg-white text-ink/65 hover:border-ink"
            }`}
          >
            {lb}
          </Link>
        ))}
        <form action="/stock" className="ml-auto">
          <input type="hidden" name="view" value={view} />
          <input name="q" defaultValue={q} className="field w-56" placeholder="ค้นหารหัส ผ้า หรือสี" />
        </form>
      </div>

      <Section title={`รหัสสินค้า ${num(rows.length)} รายการ`}>
        <Table
          head={["รหัส", "ผ้า", "สี", "ไซส์", "มีอยู่", "จอง", "ว่าง", "จุดสั่งซื้อ", ""]}
          empty="ไม่มีรายการตรงเงื่อนไข"
        >
          {rows.map((k) => {
            const avail = Number(k.qty_available ?? 0);
            const rop = Number(k.reorder_point ?? 0);
            return (
              <tr key={k.code} className="border-b border-line-soft last:border-0">
                <Td><span className="tnum text-[12px]">{k.code}</span></Td>
                <Td>
                  {k.fabric_name}
                  <span className="ml-2 text-[11px] text-ink/35">
                    {FABRIC_GROUP_MAP[k.fabric_group]?.policy ?? ""}
                  </span>
                </Td>
                <Td>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 border border-line-hard"
                          style={{ background: k.color_hex ?? "#000" }} />
                    {k.color_name}
                  </span>
                </Td>
                <Td>{k.size}</Td>
                <Td align="right"><span className="tnum">{num(k.qty_on_hand)}</span></Td>
                <Td align="right"><span className="tnum text-ink/50">{num(k.qty_allocated)}</span></Td>
                <Td align="right">
                  <span className={`tnum ${avail <= 0 ? "text-signal-bad" : avail <= rop ? "text-signal-warn" : ""}`}>
                    {num(avail)}
                  </span>
                </Td>
                <Td align="right"><span className="tnum text-ink/40">{rop || "—"}</span></Td>
                <Td align="right">
                  <ModalButton label="ปรับยอด" title="ปรับยอดสต็อกด้วยมือ"
                               subtitle={`${k.code} · ${k.fabric_name} ${k.color_name} ${k.size}`}>
                    <div className="mb-4 divide-y divide-line-soft">
                      <KV k="มีอยู่ในระบบ" v={`${num(k.qty_on_hand)} ตัว`} mono />
                      <KV k="ถูกจองไว้" v={`${num(k.qty_allocated)} ตัว`} mono />
                      <KV k="ว่างจริง" v={`${num(avail)} ตัว`} mono />
                      <KV k="ต้นทุนต่อตัว" v={`${money(k.cost)} บาท`} mono />
                    </div>
                    <Note tone="warn" title="ปรับยอดด้วยมือต้องมีเหตุผลเสมอ">
                      ยอดสต็อกที่อธิบายที่มาไม่ได้คือยอดที่เชื่อไม่ได้
                      ถ้าเป็นการนับประจำรอบ ให้ใช้หน้ารอบนับสต็อกแทน จะได้เห็นภาพรวมทั้งคลัง
                    </Note>
                    <div className="mt-4">
                      <ActionForm action={adjustStock} submitLabel="บันทึกการปรับ">
                        <input type="hidden" name="sku_code" value={k.code} />
                        <div className="grid grid-cols-2 gap-3">
                          <label className="block">
                            <span className="label">ประเภท</span>
                            <select name="type" className="field">
                              <option value="ปรับปรุง">ปรับปรุง ตั้งเป็นยอดใหม่</option>
                              <option value="รับเข้า">รับเข้า เพิ่มจากยอดเดิม</option>
                              <option value="ตัดจ่าย">ตัดจ่าย ลดจากยอดเดิม</option>
                              <option value="คืน">คืน เพิ่มจากยอดเดิม</option>
                              <option value="ตัดของเสีย">ตัดของเสีย ลดจากยอดเดิม</option>
                            </select>
                          </label>
                          <label className="block">
                            <span className="label">จำนวน</span>
                            <input name="qty" type="number" className="field" required />
                          </label>
                        </div>
                        <label className="mt-3 block">
                          <span className="label">เหตุผล</span>
                          <textarea name="reason" rows={3} className="field" required
                                    placeholder="เช่น พบผ้าเปื้อนน้ำมัน 3 ตัว ตัดทิ้ง" />
                        </label>
                      </ActionForm>
                    </div>
                  </ModalButton>
                </Td>
              </tr>
            );
          })}
        </Table>
      </Section>

      {(supplies ?? []).length > 0 && (
        <Section title="วัสดุอื่น" hint="ของที่ไม่ใช่เสื้อ แต่ต้องมีถึงจะส่งงานได้">
          <Table head={["รหัส", "รายการ", "หน่วย", "คงเหลือ", "ต้นทุน"]}>
            {(supplies ?? []).map((s) => (
              <tr key={s.code} className="border-b border-line-soft last:border-0">
                <Td><span className="tnum text-[12px]">{s.code}</span></Td>
                <Td>{s.name}</Td>
                <Td>{s.unit}</Td>
                <Td align="right"><span className="tnum">{num(s.qty_on_hand)}</span></Td>
                <Td align="right"><span className="tnum">{money(s.cost)}</span></Td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      <Section title="การเคลื่อนไหวล่าสุด" hint="ทุกการขยับของสต็อกถูกบันทึกไว้ ลบไม่ได้">
        <Table head={["เมื่อ", "รหัส", "ประเภท", "จำนวน", "จาก", "เป็น", "อ้างอิง", "เหตุผล"]}
               empty="ยังไม่มีการเคลื่อนไหว">
          {(moves ?? []).map((m) => (
            <tr key={m.id} className="border-b border-line-soft last:border-0">
              <Td><span className="text-[12px] text-ink/50">{thDateTime(m.created_at)}</span></Td>
              <Td><span className="tnum text-[12px]">{m.sku_code ?? m.supply_code}</span></Td>
              <Td>
                <Tag tone={
                  m.type === "รับเข้า" || m.type === "คืน" ? "ok"
                  : m.type === "จอง" ? "info"
                  : m.type === "ปรับปรุง" ? "warn"
                  : "bad"
                }>
                  {m.type}
                </Tag>
              </Td>
              <Td align="right"><span className="tnum">{num(m.qty)}</span></Td>
              <Td align="right"><span className="tnum text-ink/45">{m.qty_before ?? "—"}</span></Td>
              <Td align="right"><span className="tnum">{m.qty_after ?? "—"}</span></Td>
              <Td><span className="tnum text-[12px] text-ink/50">{m.ref_no ?? "—"}</span></Td>
              <Td align="right"><span className="text-[12px] text-ink/55">{m.reason_code}</span></Td>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
