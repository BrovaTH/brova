import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHead, Section, Tag, Note, LinkBtn, KV } from "@/components/ui";
import { ModalButton } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { CountSheet, type CountRow } from "@/components/count-sheet";
import { saveCountRow, closeCount } from "@/actions/stock-count";
import { num, thDate, thDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CountPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();

  const { data: head } = await sb
    .from("stock_counts_view")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!head) notFound();

  const [{ data: items }, { data: skus }, { data: supplies }] = await Promise.all([
    sb.from("stock_count_items").select("*").eq("count_id", params.id),
    sb.from("skus_view").select("code, fabric_name, color_name, size"),
    sb.from("supplies").select("code, name, unit"),
  ]);

  const skuMap = new Map((skus ?? []).map((k) => [k.code, k]));
  const supMap = new Map((supplies ?? []).map((k) => [k.code, k]));

  const rows: CountRow[] = (items ?? []).map((it) => {
    const k = it.sku_code ? skuMap.get(it.sku_code) : null;
    const sp = it.supply_code ? supMap.get(it.supply_code) : null;
    return {
      id: it.id,
      sku_code: it.sku_code,
      supply_code: it.supply_code,
      item_name: k?.fabric_name ?? sp?.name ?? it.sku_code ?? it.supply_code ?? "—",
      color_name: k?.color_name ?? null,
      size: k?.size ?? null,
      qty_system: Number(it.qty_system ?? 0),
      qty_counted: it.qty_counted === null ? null : Number(it.qty_counted),
      note: it.note,
    };
  });

  const closed = head.status !== "ร่าง";

  return (
    <>
      <PageHead
        eyebrow={`รอบนับสต็อก · รอบที่ ${head.round_no}`}
        title={head.code}
        lead={
          closed
            ? `ปิดรอบแล้วเมื่อ ${thDateTime(head.closed_at)} โดย ${head.closed_by ?? "—"} · ดูได้อย่างเดียว`
            : "กรอกยอดที่นับได้จริง ระบบเทียบกับยอดในระบบให้ทันที · ยอดในคลังจะยังไม่ขยับจนกว่าจะปิดรอบ"
        }
        right={
          <>
            <LinkBtn href="/stock/count">กลับรายการรอบนับ</LinkBtn>
            {!closed && (
              <ModalButton variant="solid" label="ปิดรอบนับ" title="ปิดรอบนับและปรับยอดจริง"
                           subtitle={`${head.code} · ${head.scope}`}>
                <div className="mb-4 divide-y divide-line-soft">
                  <KV k="รายการทั้งหมด" v={`${num(head.line_count)} รายการ`} mono />
                  <KV k="นับแล้ว" v={`${num(head.counted_lines)} รายการ`} mono />
                  <KV k="ยังไม่นับ" v={`${num(head.pending_lines)} รายการ`} mono />
                  <KV k="ต่างจากระบบ"
                      v={`${num(head.diff_lines)} รายการ · ${Number(head.diff_qty) > 0 ? "+" : ""}${num(head.diff_qty)} ชิ้น`}
                      mono />
                </div>

                <Note tone="warn" title="ปิดรอบแล้วย้อนกลับไม่ได้">
                  ยอดในคลังจะถูกปรับให้ตรงกับที่นับได้ และทุกการปรับจะถูกบันทึกเป็นการเคลื่อนไหวสต็อก
                  พร้อมยอดก่อนและหลัง เพื่อให้ตรวจย้อนหลังได้ว่าของหายหรือเกินตรงไหน
                </Note>

                <div className="mt-4">
                  <ActionForm action={closeCount} submitLabel="ปิดรอบและปรับยอด"
                              confirmTitle="ยืนยันปิดรอบนับ"
                              confirmText={`ระบบจะปรับยอดคลัง ${num(head.diff_lines)} รายการ ตามผลนับ ย้อนกลับไม่ได้`}>
                    <input type="hidden" name="count_id" value={head.id} />
                    {Number(head.pending_lines) > 0 && (
                      <label className="flex items-start gap-2 text-[13px] leading-relaxed">
                        <input type="checkbox" name="force" className="mt-0.5 h-3.5 w-3.5 accent-ink" />
                        <span>
                          ยืนยันปิดทั้งที่ยังนับไม่ครบ อีก {num(head.pending_lines)} รายการ
                          รายการที่ไม่ได้นับจะไม่ถูกแตะ ยอดเดิมคงไว้เหมือนเดิม
                        </span>
                      </label>
                    )}
                  </ActionForm>
                </div>
              </ModalButton>
            )}
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Tag tone={closed ? "ok" : "warn"}>{head.status}</Tag>
        <span className="text-[12px] text-ink/50">
          {head.scope} · เปิดเมื่อ {thDate(head.count_date)} · ผู้นับ {head.counted_by ?? "—"}
        </span>
        {head.note && <span className="text-[12px] text-ink/50">· {head.note}</span>}
      </div>

      <Section title={`รายการนับ ${num(rows.length)} รายการ`}>
        <CountSheet rows={rows} readOnly={closed} onSaveRow={saveCountRow} />
      </Section>
    </>
  );
}
