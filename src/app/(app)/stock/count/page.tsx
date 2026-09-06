import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHead, Section, Table, Td, Tag, Note, LinkBtn, Empty } from "@/components/ui";
import { ModalButton } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { openCount } from "@/actions/stock-count";
import { num, thDate, thDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CountListPage() {
  const sb = supabaseServer();
  const { data: counts } = await sb
    .from("stock_counts_view")
    .select("*")
    .order("created_at", { ascending: false });

  const open = (counts ?? []).find((c) => c.status === "ร่าง");

  return (
    <>
      <PageHead
        eyebrow="คลังสินค้า · รอบนับสต็อก"
        title="STOCK COUNT"
        lead="นับรวมทั้งคลัง แยกไซส์และสี · ยอดในระบบจะขยับก็ต่อเมื่อปิดรอบ และทุกการปรับมีร่องรอย"
        right={
          <>
            <LinkBtn href="/stock">กลับหน้าคลัง</LinkBtn>
            {!open && (
              <ModalButton variant="solid" label="เปิดรอบนับใหม่" title="เปิดรอบนับสต็อก"
                           subtitle="ระบบจะดึงรหัสสินค้าที่ใช้งานอยู่ทั้งหมดมาเป็นรายการนับ">
                <Note tone="info" title="เปิดได้ทีละรอบ">
                  ถ้ามีรอบเปิดค้างอยู่ ต้องปิดรอบนั้นก่อน จะได้ไม่มีคนสองกลุ่มนับตัวเลขคนละชุด
                </Note>
                <div className="mt-4">
                  <ActionForm action={openCount} submitLabel="เปิดรอบนับ">
                    <label className="mb-3 block">
                      <span className="label">ขอบเขต</span>
                      <select name="scope" className="field">
                        <option value="ทั้งคลัง">ทั้งคลัง</option>
                        <option value="เฉพาะผ้า">เฉพาะผ้า</option>
                        <option value="เฉพาะวัสดุ">เฉพาะวัสดุ</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="label">บันทึก</span>
                      <input name="note" className="field" placeholder="เช่น นับสิ้นเดือน สิงหาคม" />
                    </label>
                  </ActionForm>
                </div>
              </ModalButton>
            )}
          </>
        }
      />

      {open && (
        <Section title="รอบที่กำลังนับอยู่">
          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[16px] font-medium">
                  <span className="tnum">{open.code}</span>
                  <Tag tone="warn" className="ml-2">กำลังนับ</Tag>
                </p>
                <p className="mt-1 text-[12px] text-ink/55">
                  รอบที่ {open.round_no} · {open.scope} · เปิดเมื่อ {thDate(open.count_date)} ·
                  ผู้นับ {open.counted_by ?? "—"}
                </p>
              </div>
              <LinkBtn href={`/stock/count/${open.id}`} solid>เข้าหน้านับ</LinkBtn>
            </div>

            <div className="mt-4 grid gap-3 border-t border-line-soft pt-4 sm:grid-cols-4">
              <Cell k="รายการทั้งหมด" v={num(open.line_count)} />
              <Cell k="นับแล้ว" v={num(open.counted_lines)} />
              <Cell k="ยังไม่นับ" v={num(open.pending_lines)} warn={Number(open.pending_lines) > 0} />
              <Cell k="ต่างจากระบบ" v={`${num(open.diff_lines)} รายการ`} warn={Number(open.diff_lines) > 0} />
            </div>
          </div>
        </Section>
      )}

      <Section title="ประวัติรอบนับ">
        {(counts ?? []).length === 0 ? (
          <Empty
            title="ยังไม่เคยนับสต็อก"
            hint="การนับรอบแรกคือการตั้งต้นยอดจริง หลังจากนั้นทุกความต่างจะอธิบายได้ว่ามาจากไหน"
          />
        ) : (
          <Table head={["เลขที่", "รอบ", "วันที่", "ขอบเขต", "นับแล้ว", "ต่าง", "สถานะ", ""]}>
            {(counts ?? []).map((c) => (
              <tr key={c.id} className="border-b border-line-soft last:border-0">
                <Td><span className="tnum">{c.code}</span></Td>
                <Td><span className="tnum">{c.round_no}</span></Td>
                <Td>{thDate(c.count_date)}</Td>
                <Td>{c.scope}</Td>
                <Td align="right">
                  <span className="tnum">{num(c.counted_lines)} / {num(c.line_count)}</span>
                </Td>
                <Td align="right">
                  <span className={`tnum ${Number(c.diff_lines) > 0 ? "text-signal-warn" : "text-ink/35"}`}>
                    {Number(c.diff_lines) > 0
                      ? `${num(c.diff_lines)} รายการ · ${Number(c.diff_qty) > 0 ? "+" : ""}${num(c.diff_qty)}`
                      : "ตรงหมด"}
                  </span>
                </Td>
                <Td>
                  <Tag tone={c.status === "ปิดแล้ว" ? "ok" : "warn"}>{c.status}</Tag>
                  {c.closed_at && (
                    <span className="mt-0.5 block text-[11px] text-ink/35">
                      {thDateTime(c.closed_at)}
                    </span>
                  )}
                </Td>
                <Td align="right">
                  <Link href={`/stock/count/${c.id}`} className="text-[12px] underline underline-offset-4">
                    เปิดดู
                  </Link>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}

function Cell({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide2 text-ink/40">{k}</p>
      <p className={`tnum mt-0.5 text-[17px] ${warn ? "text-signal-warn" : ""}`}>{v}</p>
    </div>
  );
}
