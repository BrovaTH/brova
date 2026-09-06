import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHead, Section, Stat, Table, Td, Tag, Note, LinkBtn } from "@/components/ui";
import { ModalButton } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { createPurchaseOrder } from "@/actions/purchasing";
import { requestApproval } from "@/actions/approvals";
import { getRules } from "@/lib/rules";
import { money, num, thDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PurchasingPage() {
  const sb = supabaseServer();
  const [{ data: pos }, { data: suppliers }, { data: skus }, rules] = await Promise.all([
    sb.from("purchase_orders_view").select("*").order("ordered_at", { ascending: false }),
    sb.from("suppliers").select("code, name").order("name"),
    sb.from("skus_view").select("code, fabric_name, color_name, size, cost").limit(120),
    getRules(),
  ]);

  const P = pos ?? [];
  const openPo = P.filter((p) => p.status !== "Received" && p.status !== "Cancelled");
  const outstandingQty = openPo.reduce((a, p) => a + Number(p.qty_outstanding ?? 0), 0);
  const openValue = openPo.reduce((a, p) => a + Number(p.total ?? 0), 0);
  const late = openPo.filter((p) => Number(p.overdue_days ?? 0) > 0);

  return (
    <>
      <PageHead
        eyebrow="สั่งซื้อ"
        title="ใบสั่งซื้อและการรับของ"
        lead={`สั่งได้เองไม่เกิน ${money(rules.po_budget_cap, 0)} บาทต่อใบ · เกินกว่านั้นต้องให้เจ้าของอนุมัติก่อน`}
        right={
          <ModalButton variant="solid" label="เปิดใบสั่งซื้อ" title="เปิดใบสั่งซื้อใหม่"
                       subtitle="ใส่ได้หลายรายการในใบเดียว" wide>
            <NewPoForm
              suppliers={(suppliers ?? []).map((s) => ({ code: s.code, name: s.name }))}
              skus={(skus ?? []).map((k) => ({
                code: k.code,
                label: `${k.code} · ${k.fabric_name} ${k.color_name} ${k.size}`,
                cost: Number(k.cost ?? 0),
              }))}
              cap={rules.po_budget_cap}
            />
          </ModalButton>
        }
      />

      <Section title="สถานะการสั่งซื้อ">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="ใบที่ยังไม่ปิด" value={num(openPo.length)} unit="ใบ" hint={`จากทั้งหมด ${P.length} ใบ`} />
          <Stat label="ของที่ยังไม่มาถึง" value={num(outstandingQty)} unit="ชิ้น" hint="รวมทุกใบที่ค้าง" />
          <Stat label="มูลค่าที่ค้างอยู่" value={money(openValue, 0)} unit="บาท" hint="ยอดตามใบสั่งซื้อ" />
          <Stat label="เลยกำหนดรับ" value={num(late.length)} unit="ใบ"
                tone={late.length ? "bad" : undefined}
                hint={late.length ? "ควรตามร้าน" : "ยังอยู่ในกำหนด"} />
        </div>
      </Section>

      {late.length > 0 && (
        <Section title="ต้องตาม">
          <Note tone="bad" title={`${late.length} ใบเลยกำหนดรับของแล้ว`}>
            {late.slice(0, 3).map((p) => `${p.code} ${p.supplier_name ?? ""} เลย ${p.overdue_days} วัน`).join(" · ")}
          </Note>
        </Section>
      )}

      <Section title={`ใบสั่งซื้อ ${num(P.length)} ใบ`}>
        <Table
          head={["เลขที่", "ร้าน", "รายการ", "สั่งไว้", "รับแล้ว", "ค้าง", "ยอดเงิน", "กำหนดรับ", "สถานะ", ""]}
          empty="ยังไม่มีใบสั่งซื้อ"
        >
          {P.map((p) => (
            <tr key={p.id} className="border-b border-line-soft last:border-0">
              <Td><span className="tnum">{p.code}</span></Td>
              <Td>{p.supplier_name ?? p.shop_name ?? "—"}</Td>
              <Td>
                {p.title ?? "—"}
                <span className="ml-2 text-[11px] text-ink/35">{p.line_count} รายการ</span>
              </Td>
              <Td align="right"><span className="tnum">{num(p.qty_ordered)}</span></Td>
              <Td align="right"><span className="tnum text-ink/55">{num(p.qty_received)}</span></Td>
              <Td align="right">
                <span className={`tnum ${Number(p.qty_outstanding) > 0 ? "text-signal-warn" : "text-signal-ok"}`}>
                  {Number(p.qty_outstanding) > 0 ? num(p.qty_outstanding) : "ครบ"}
                </span>
              </Td>
              <Td align="right"><span className="tnum">{money(p.total, 0)}</span></Td>
              <Td>
                <span className={Number(p.overdue_days ?? 0) > 0 ? "text-signal-bad" : ""}>
                  {p.expected_at ? thDate(p.expected_at) : "—"}
                </span>
              </Td>
              <Td>
                <Tag tone={
                  p.status === "Received" ? "ok"
                  : p.status === "Cancelled" ? "mute"
                  : p.status === "Partial" ? "warn"
                  : "info"
                }>
                  {p.status_th}
                </Tag>
              </Td>
              <Td align="right">
                <Link href={`/purchasing/${p.id}`} className="text-[12px] underline underline-offset-4">
                  เปิดใบ
                </Link>
              </Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="ถ้าต้องสั่งเกินงบ">
        <div className="card p-5">
          <p className="mb-3 text-[13px] leading-relaxed text-ink/65">
            ระบบจะไม่ให้เปิดใบสั่งซื้อที่ยอดเกิน {money(rules.po_budget_cap, 0)} บาท
            จนกว่าจะมีใบอนุมัติจากเจ้าของที่ยังใช้ได้ ยื่นเรื่องล่วงหน้าไว้ก่อนได้จากตรงนี้
          </p>
          <ModalButton variant="ghost" label="ยื่นขออนุมัติซื้อเกินงบ" title="ขออนุมัติซื้อเกินงบ"
                       subtitle={`เพดานปัจจุบัน ${money(rules.po_budget_cap, 0)} บาท`}>
            <ActionForm action={requestApproval} submitLabel="ส่งเรื่องให้เจ้าของ">
              <input type="hidden" name="kind" value="budget_over" />
              <input type="hidden" name="target_type" value="purchase_order" />
              <label className="mb-3 block">
                <span className="label">หัวเรื่อง</span>
                <input name="title" className="field" required
                       placeholder="เช่น ขอซื้อเสื้อเปล่า 1,500 ตัว สำหรับงานอีเวนต์เดือนหน้า" />
              </label>
              <label className="mb-3 block">
                <span className="label">ยอดที่จะสั่ง (บาท)</span>
                <input name="amount" type="number" step="0.01" className="field" required />
              </label>
              <label className="mb-3 block">
                <span className="label">ร้านที่จะสั่ง</span>
                <input name="p_ร้าน" className="field" />
              </label>
              <label className="block">
                <span className="label">เหตุผล</span>
                <textarea name="reason" rows={4} className="field" required
                          placeholder="ทำไมต้องสั่งล็อตใหญ่ ถ้าไม่สั่งจะเกิดอะไรขึ้น" />
              </label>
            </ActionForm>
          </ModalButton>
        </div>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- ฟอร์มเปิดใบสั่งซื้อ
function NewPoForm({
  suppliers, skus, cap,
}: {
  suppliers: { code: string; name: string }[];
  skus: { code: string; label: string; cost: number }[];
  cap: number;
}) {
  const blank = [0, 1, 2, 3, 4];
  return (
    <ActionForm action={createPurchaseOrder} submitLabel="เปิดใบสั่งซื้อ">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">ร้านหรือโรงงาน</span>
          <input name="supplier_name" className="field" list="sup-list" required
                 placeholder="พิมพ์ชื่อร้าน" />
          <datalist id="sup-list">
            {suppliers.map((s) => (
              <option key={s.code} value={s.name} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="label">ประเภท</span>
          <select name="category" className="field">
            <option value="เสื้อเปล่า">เสื้อเปล่า</option>
            <option value="วัสดุอื่น">วัสดุอื่น</option>
            <option value="บริการ">บริการ</option>
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="label">ชื่อรายการสั่งซื้อ</span>
          <input name="title" className="field" required
                 placeholder="เช่น เสื้อเปล่า Comb 30 สีดำ ล็อตเดือนกันยายน" />
        </label>
        <label className="block">
          <span className="label">กำหนดรับของ</span>
          <input name="expected_at" type="date" className="field" />
        </label>
        <label className="block">
          <span className="label">บันทึก</span>
          <input name="note" className="field" />
        </label>
      </div>

      <p className="label mt-5">รายการที่สั่ง</p>
      <div className="space-y-2">
        {blank.map((i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <input name="item_name" className="field col-span-5" placeholder={`รายการที่ ${i + 1}`} />
            <input name="sku_code" className="field col-span-3" list="sku-list" placeholder="รหัสสินค้า" />
            <input name="size" className="field col-span-1" placeholder="ไซส์" />
            <input name="qty_ordered" type="number" min={0} className="field col-span-1 text-right" placeholder="0" />
            <input name="unit_cost" type="number" step="0.01" className="field col-span-2 text-right" placeholder="ราคา" />
          </div>
        ))}
      </div>
      <datalist id="sku-list">
        {skus.map((k) => (
          <option key={k.code} value={k.code}>{k.label}</option>
        ))}
      </datalist>

      <p className="mt-3 text-[11px] leading-relaxed text-ink/45">
        ใส่เท่าที่มี บรรทัดที่เว้นว่างไว้ระบบจะข้ามให้ ·
        ถ้ายอดรวมเกิน {money(cap, 0)} บาท จะต้องมีใบอนุมัติจากเจ้าของก่อน ไม่งั้นเปิดใบไม่สำเร็จ
      </p>
    </ActionForm>
  );
}
