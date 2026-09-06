import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHead, Section, Tag, KV, Note, LinkBtn, Table, Td } from "@/components/ui";
import { ModalButton } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { ReceiveForm, type ReceiveRow } from "@/components/receive-form";
import { receivePurchase, cancelPurchase } from "@/actions/purchasing";
import { money, num, thDate, thDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PoPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();

  const { data: po } = await sb
    .from("purchase_orders_view")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!po) notFound();

  const [{ data: items }, { data: moves }] = await Promise.all([
    sb.from("purchase_order_items").select("*").eq("po_id", po.id).order("seq"),
    sb.from("stock_movements").select("*").eq("ref_no", po.code).order("created_at", { ascending: false }),
  ]);

  const rows: ReceiveRow[] = (items ?? []).map((it) => ({
    id: it.id,
    seq: Number(it.seq ?? 1),
    item_name: it.item_name ?? it.sku_code ?? "—",
    sku_code: it.sku_code,
    supply_code: it.supply_code,
    color_name: it.color_name,
    size: it.size,
    qty_ordered: Number(it.qty_ordered ?? 0),
    qty_received: Number(it.qty_received ?? 0),
    unit_cost: Number(it.unit_cost ?? 0),
  }));

  const done = po.status === "Received" || po.status === "Cancelled";

  return (
    <>
      <PageHead
        eyebrow={`ใบสั่งซื้อ · ${po.supplier_name ?? "—"}`}
        title={po.code}
        lead={po.title ?? ""}
        right={
          <>
            <LinkBtn href="/purchasing">กลับรายการใบสั่งซื้อ</LinkBtn>
            {po.status === "Ordered" && (
              <ModalButton variant="ghost" label="ยกเลิกใบนี้" title="ยกเลิกใบสั่งซื้อ" subtitle={po.code}>
                <Note tone="warn" title="ยกเลิกได้เฉพาะใบที่ยังไม่รับของเลย">
                  ถ้ารับของไปแล้วบางส่วน ให้ปิดใบตามจำนวนที่รับจริงแทน
                  ระบบจะไม่ยอมให้ยกเลิกใบที่มีของเข้าคลังไปแล้ว
                </Note>
                <div className="mt-4">
                  <ActionForm action={cancelPurchase} submitLabel="ยืนยันยกเลิก" danger>
                    <input type="hidden" name="po_code" value={po.code} />
                    <label className="block">
                      <span className="label">เหตุผล</span>
                      <textarea name="reason" rows={3} className="field" required />
                    </label>
                  </ActionForm>
                </div>
              </ModalButton>
            )}
          </>
        }
      />

      <div className="mb-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
        <div className="card p-5">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Tag tone={
              po.status === "Received" ? "ok"
              : po.status === "Cancelled" ? "mute"
              : po.status === "Partial" ? "warn"
              : "info"
            }>
              {po.status_th}
            </Tag>
            {Number(po.overdue_days ?? 0) > 0 && (
              <Tag tone="bad">เลยกำหนดรับ {po.overdue_days} วัน</Tag>
            )}
          </div>

          {po.status === "Cancelled" ? (
            <Note tone="mute" title="ใบนี้ถูกยกเลิก">{po.cancelled_reason ?? "—"}</Note>
          ) : (
            <ReceiveForm rows={rows} poCode={po.code} readOnly={done} onReceive={receivePurchase} />
          )}
        </div>

        <div className="card divide-y divide-line-soft px-4">
          <KV k="ร้าน" v={po.supplier_name ?? "—"} />
          <KV k="ประเภท" v={po.category} />
          <KV k="สั่งเมื่อ" v={thDate(po.ordered_at)} mono />
          <KV k="กำหนดรับ" v={po.expected_at ? thDate(po.expected_at) : "—"} mono />
          <KV k="รับล่าสุด" v={po.received_at ? thDateTime(po.received_at) : "ยังไม่รับ"} mono />
          <KV k="จำนวนรายการ" v={`${num(po.line_count)} รายการ`} mono />
          <KV k="สั่งไว้" v={`${num(po.qty_ordered)} ชิ้น`} mono />
          <KV k="รับแล้ว" v={`${num(po.qty_received)} ชิ้น`} mono />
          <KV k="ค้างรับ" v={`${num(po.qty_outstanding)} ชิ้น`} mono />
          <KV k="ยอดตามใบ" v={`${money(po.total)} บาท`} mono />
          <KV k="ผู้เปิดใบ" v={po.created_by ?? "—"} />
          {po.note && <KV k="บันทึก" v={po.note} />}
        </div>
      </div>

      <Section title="ของที่เข้าคลังจากใบนี้" hint="ทุกครั้งที่รับของ ระบบบันทึกยอดก่อนและหลังไว้">
        <Table head={["เมื่อ", "รหัส", "จำนวน", "จาก", "เป็น", "ผู้บันทึก"]} empty="ยังไม่มีของเข้าคลังจากใบนี้">
          {(moves ?? []).map((m) => (
            <tr key={m.id} className="border-b border-line-soft last:border-0">
              <Td>{thDateTime(m.created_at)}</Td>
              <Td><span className="tnum text-[12px]">{m.sku_code ?? m.supply_code}</span></Td>
              <Td align="right"><span className="tnum">{num(m.qty)}</span></Td>
              <Td align="right"><span className="tnum text-ink/45">{m.qty_before ?? "—"}</span></Td>
              <Td align="right"><span className="tnum">{m.qty_after ?? "—"}</span></Td>
              <Td align="right">{m.by_user ?? "—"}</Td>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
