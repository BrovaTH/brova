import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { PageHead, Section, Stat, Tag, Table, Td, Note, KV, Empty } from "@/components/ui";
import { ModalButton } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { decideApproval, cancelApproval, saveApprovalRules, requestApproval } from "@/actions/approvals";
import { money, num, thDateTime, ago } from "@/lib/format";
import { APPROVAL_KINDS } from "@/lib/workflow";
import { getRules } from "@/lib/rules";

export const dynamic = "force-dynamic";

type Apv = Record<string, string | number | boolean | null | Record<string, unknown>>;

export default async function ApprovalsPage() {
  const sb = supabaseServer();
  const me = await currentProfile();
  const owner = me?.role === "owner";

  // ล้างใบที่หมดอายุก่อนวาดหน้า จะได้ไม่เห็นใบที่ใช้ไม่ได้แล้วเป็นสีเขียว
  await sb.rpc("expire_approvals");

  const [{ data: rows }, { data: sum }, rules] = await Promise.all([
    sb.from("approvals_view").select("*").order("requested_at", { ascending: false }),
    sb.from("approvals_summary").select("*").maybeSingle(),
    getRules(),
  ]);

  const all = (rows ?? []) as unknown as Apv[];
  const pending = all.filter((a) => a.status === "pending");
  const usable = all.filter((a) => a.is_usable === true);
  const history = all.filter((a) => a.status !== "pending" && a.is_usable !== true);

  return (
    <>
      <PageHead
        eyebrow="ขออนุมัติ · เรื่องที่ทำเองไม่ได้"
        title="APPROVALS"
        lead={
          owner
            ? "คุณเป็นผู้อนุมัติคนเดียวของระบบ เรื่องด้านล่างรอคุณตัดสิน จนกว่าจะกด ทีมทำรายการนั้นไม่ได้"
            : "เรื่องนอกกรอบต้องผ่านเจ้าของก่อน ยื่นแล้วรอผล ระบบจะปลดล็อกให้เองเมื่อได้รับอนุมัติ"
        }
        right={
          <ModalButton
            variant="solid"
            label="ยื่นเรื่องใหม่"
            title="ยื่นขออนุมัติ"
            subtitle="เขียนให้ชัดว่าขออะไรและทำไม เจ้าของจะได้ตัดสินใจได้เร็ว"
            wide
          >
            <NewRequestForm />
          </ModalButton>
        }
      />

      <Section title="สถานะรวม">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="รอเจ้าของตัดสิน" value={num(Number(sum?.pending ?? 0))} unit="เรื่อง"
                hint={Number(sum?.pending ?? 0) ? "ทีมกำลังรออยู่" : "ไม่มีเรื่องค้าง"}
                tone={Number(sum?.pending ?? 0) ? "warn" : undefined} />
          <Stat label="อนุมัติแล้ว ยังไม่ได้ใช้" value={num(Number(sum?.usable ?? 0))} unit="ใบ"
                hint="ใช้ได้ครั้งเดียวและมีวันหมดอายุ" />
          <Stat label="อนุมัติแล้วแต่หมดอายุ" value={num(Number(sum?.stale ?? 0))} unit="ใบ"
                hint={Number(sum?.stale ?? 0) ? "ต้องยื่นใหม่ถ้ายังต้องการ" : "ไม่มี"}
                tone={Number(sum?.stale ?? 0) ? "bad" : undefined} />
          <Stat label="มูลค่าที่รออนุมัติ" value={money(Number(sum?.pending_amount ?? 0), 0)} unit="บาท"
                hint="ผลกระทบเป็นเงินของเรื่องที่ค้าง" />
        </div>
      </Section>

      {/* ------------------------------------------------------------ รอตัดสิน */}
      <Section
        title={`รอเจ้าของตัดสิน · ${pending.length} เรื่อง`}
        hint={owner ? "กดดูรายละเอียดแล้วอนุมัติหรือไม่อนุมัติได้เลย" : "ยังทำรายการเหล่านี้ไม่ได้จนกว่าจะได้รับอนุมัติ"}
      >
        {pending.length === 0 ? (
          <Empty title="ไม่มีเรื่องค้างอยู่" hint="ทุกอย่างเดินได้ตามปกติ ไม่มีใครติดรออนุมัติ" />
        ) : (
          <div className="space-y-3">
            {pending.map((a) => (
              <ApprovalCard key={String(a.id)} a={a} owner={owner} canCancel={owner || a.requested_by === me?.id} />
            ))}
          </div>
        )}
      </Section>

      {/* ------------------------------------------------------------ อนุมัติแล้วรอใช้ */}
      {usable.length > 0 && (
        <Section
          title={`อนุมัติแล้ว รอนำไปใช้ · ${usable.length} ใบ`}
          hint="ใบอนุมัติใช้ได้ครั้งเดียว ถ้าเลยเวลาที่กำหนดต้องยื่นใหม่"
        >
          <Table head={["เลขที่", "เรื่อง", "เกี่ยวกับ", "เหลือเวลา", ""]}>
            {usable.map((a) => (
              <tr key={String(a.id)} className="border-b border-line-soft last:border-0">
                <Td><span className="tnum">{String(a.code)}</span></Td>
                <Td>{String(a.kind_th)}</Td>
                <Td>
                  <span className="text-ink/60">{String(a.target_th)}</span>{" "}
                  <span className="tnum">{a.target_code ? String(a.target_code) : ""}</span>
                </Td>
                <Td>
                  <Tag tone={Number(a.hours_left ?? 0) < 12 ? "warn" : "ok"}>
                    อีก {Number(a.hours_left ?? 0).toFixed(1)} ชั่วโมง
                  </Tag>
                </Td>
                <Td align="right">
                  <ModalButton
                    label="ดูรายละเอียด"
                    title={String(a.title)}
                    subtitle={`${a.code} · ${a.kind_th}`}
                    wide
                  >
                    <ApprovalDetail a={a} />
                  </ModalButton>
                </Td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      {/* ------------------------------------------------------------ ประวัติ */}
      <Section title="ประวัติทั้งหมด" hint="ใบขออนุมัติลบไม่ได้ เก็บไว้เป็นหลักฐานว่าใครอนุมัติอะไรเมื่อไร">
        <Table
          head={["เลขที่", "เรื่อง", "เกี่ยวกับ", "ผลกระทบ", "สถานะ", "เมื่อ", ""]}
          empty="ยังไม่มีประวัติ"
        >
          {history.map((a) => (
            <tr key={String(a.id)} className="border-b border-line-soft last:border-0">
              <Td><span className="tnum">{String(a.code)}</span></Td>
              <Td>{String(a.kind_th)}</Td>
              <Td>
                <span className="text-ink/60">{String(a.target_th)}</span>{" "}
                <span className="tnum">{a.target_code ? String(a.target_code) : ""}</span>
              </Td>
              <Td align="right"><span className="tnum">{a.amount ? money(Number(a.amount), 0) : "—"}</span></Td>
              <Td>
                <Tag
                  tone={
                    a.status === "used" ? "ok"
                    : a.status === "approved" ? "info"
                    : a.status === "rejected" ? "bad"
                    : "mute"
                  }
                >
                  {String(a.status_th)}
                </Tag>
              </Td>
              <Td>{ago(String(a.decided_at ?? a.requested_at))}</Td>
              <Td align="right">
                <ModalButton
                  label="ดู"
                  title={String(a.title)}
                  subtitle={`${a.code} · ${a.kind_th}`}
                  wide
                >
                  <ApprovalDetail a={a} />
                </ModalButton>
              </Td>
            </tr>
          ))}
        </Table>
      </Section>

      {/* ------------------------------------------------------------ เพดาน */}
      <Section
        title="เพดานที่ทีมทำเองได้"
        hint="เกินเส้นเหล่านี้เมื่อไร ระบบจะบังคับให้ขออนุมัติทันที"
      >
        {owner ? (
          <div className="card p-4">
            <ActionForm action={saveApprovalRules} submitLabel="บันทึกเพดาน">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block">
                  <span className="label">ลดราคาได้เองไม่เกิน (%)</span>
                  <input name="max_discount_pct" type="number" step="0.5" className="field"
                         defaultValue={rules.max_discount_pct} />
                </label>
                <label className="block">
                  <span className="label">ให้เครดิตได้เองไม่เกิน (วัน)</span>
                  <input name="max_credit_days" type="number" className="field"
                         defaultValue={rules.max_credit_days} />
                </label>
                <label className="block">
                  <span className="label">ใบสั่งซื้อไม่เกิน (บาท)</span>
                  <input name="po_budget_cap" type="number" className="field"
                         defaultValue={rules.po_budget_cap} />
                </label>
                <label className="block">
                  <span className="label">ใบอนุมัติใช้ได้ (ชั่วโมง)</span>
                  <input name="approval_valid_hours" type="number" className="field"
                         defaultValue={rules.approval_valid_hours} />
                </label>
              </div>
              <label className="mt-3 flex items-center gap-2 text-[13px]">
                <input type="checkbox" name="allow_ship_before_paid" className="h-3.5 w-3.5 accent-ink"
                       defaultChecked={rules.allow_ship_before_paid} />
                ให้ส่งของก่อนเก็บเงินครบได้เอง โดยไม่ต้องขออนุมัติ
              </label>
            </ActionForm>
          </div>
        ) : (
          <div className="card divide-y divide-line-soft px-4">
            <KV k="ลดราคาได้เองไม่เกิน" v={`${rules.max_discount_pct}%`} mono />
            <KV k="ให้เครดิตได้เองไม่เกิน" v={`${rules.max_credit_days} วัน`} mono />
            <KV k="ใบสั่งซื้อไม่เกิน" v={`${money(rules.po_budget_cap, 0)} บาท`} mono />
            <KV k="ส่งของก่อนชำระครบ" v={rules.allow_ship_before_paid ? "ทำได้เอง" : "ต้องขออนุมัติ"} />
            <KV k="ใบอนุมัติใช้ได้" v={`${rules.approval_valid_hours} ชั่วโมง`} mono />
          </div>
        )}
        {!owner && (
          <p className="mt-2 text-[11px] text-ink/40">เฉพาะเจ้าของเท่านั้นที่แก้เพดานได้</p>
        )}
      </Section>
    </>
  );
}

// ============================================================================
function ApprovalCard({ a, owner, canCancel }: { a: Apv; owner: boolean; canCancel: boolean }) {
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="tnum text-[11px] text-ink/40">{String(a.code)}</span>
            <Tag tone="warn">{String(a.kind_th)}</Tag>
            {a.target_code && (
              <span className="text-[11px] text-ink/50">
                {String(a.target_th)} <span className="tnum">{String(a.target_code)}</span>
              </span>
            )}
          </div>
          <p className="text-[15px] leading-snug">{String(a.title)}</p>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink/60">{String(a.reason)}</p>
          <p className="mt-2 text-[11px] text-ink/40">
            ยื่นโดย {String(a.requested_by_name ?? "—")} · {ago(String(a.requested_at))}
            {Number(a.waiting_hours ?? 0) > 24 && (
              <span className="ml-2 text-signal-bad">รอมาแล้ว {Number(a.waiting_hours).toFixed(0)} ชั่วโมง</span>
            )}
          </p>
        </div>

        {a.amount ? (
          <div className="shrink-0 text-right">
            <p className="text-[11px] uppercase tracking-wide2 text-ink/40">ผลกระทบ</p>
            <p className="tnum text-[20px] font-medium leading-none">{money(Number(a.amount), 0)}</p>
            <p className="text-[11px] text-ink/40">บาท</p>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
        <ModalButton
          label="ดูรายละเอียดเต็ม"
          title={String(a.title)}
          subtitle={`${a.code} · ${a.kind_th}`}
          wide
        >
          <ApprovalDetail a={a} />
        </ModalButton>

        <span className="ml-auto flex flex-wrap gap-2">
          {owner && (
            <>
              <ModalButton
                variant="solid"
                label="อนุมัติ"
                title="อนุมัติเรื่องนี้"
                subtitle={String(a.title)}
              >
                <p className="mb-3 leading-relaxed text-ink/70">
                  อนุมัติแล้วทีมจะทำรายการนี้ได้ครั้งเดียว ภายในเวลาที่ตั้งไว้
                  ถ้าเลยเวลาต้องยื่นใหม่
                </p>
                <ActionForm action={decideApproval} submitLabel="ยืนยันอนุมัติ">
                  <input type="hidden" name="id" value={String(a.id)} />
                  <input type="hidden" name="decision" value="approve" />
                  <label className="block">
                    <span className="label">เงื่อนไขที่แนบไปด้วย (ถ้ามี)</span>
                    <textarea name="note" rows={3} className="field"
                              placeholder="เช่น อนุมัติได้ แต่ต้องได้ใบสั่งซื้อรอบถัดไปภายในเดือนหน้า" />
                  </label>
                </ActionForm>
              </ModalButton>

              <ModalButton
                variant="ghost"
                label="ไม่อนุมัติ"
                title="ไม่อนุมัติเรื่องนี้"
                subtitle={String(a.title)}
              >
                <p className="mb-3 leading-relaxed text-ink/70">
                  เขียนเหตุผลไว้ด้วย ทีมจะได้รู้ว่าต้องแก้อะไรหรือควรเสนอทางอื่น
                </p>
                <ActionForm action={decideApproval} submitLabel="ยืนยันไม่อนุมัติ" danger>
                  <input type="hidden" name="id" value={String(a.id)} />
                  <input type="hidden" name="decision" value="reject" />
                  <label className="block">
                    <span className="label">เหตุผล</span>
                    <textarea name="note" rows={3} className="field" required
                              placeholder="เช่น ให้เก็บเงินให้ครบก่อนแล้วค่อยปล่อยของ" />
                  </label>
                </ActionForm>
              </ModalButton>
            </>
          )}

          {canCancel && (
            <ModalButton
              variant="ghost"
              label="ถอนเรื่อง"
              title="ถอนเรื่องที่ยื่นไว้"
              subtitle={String(a.title)}
            >
              <p className="mb-4 leading-relaxed">
                ถอนแล้วเรื่องนี้จะไม่ไปรบกวนเจ้าของอีก ถ้ายังต้องการภายหลังให้ยื่นใหม่
              </p>
              <ActionForm action={cancelApproval} submitLabel="ยืนยันถอนเรื่อง" danger>
                <input type="hidden" name="id" value={String(a.id)} />
              </ActionForm>
            </ModalButton>
          )}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
function ApprovalDetail({ a }: { a: Apv }) {
  const payload = (a.payload ?? {}) as Record<string, unknown>;
  const keys = Object.keys(payload);

  return (
    <div className="space-y-4">
      <div className="divide-y divide-line-soft">
        <KV k="เลขที่ใบ" v={String(a.code)} mono />
        <KV k="เรื่องที่ขอ" v={String(a.kind_th)} />
        <KV k="เกี่ยวกับ" v={`${a.target_th}${a.target_code ? " " + a.target_code : ""}`} />
        {a.amount ? <KV k="ผลกระทบเป็นเงิน" v={`${money(Number(a.amount))} บาท`} mono /> : null}
        <KV k="ผู้ยื่น" v={String(a.requested_by_name ?? "—")} />
        <KV k="ยื่นเมื่อ" v={thDateTime(String(a.requested_at))} mono />
        <KV k="สถานะ" v={String(a.status_th)} />
        {a.decided_at ? (
          <>
            <KV k="ผู้ตัดสิน" v={String(a.decided_by_name ?? "—")} />
            <KV k="ตัดสินเมื่อ" v={thDateTime(String(a.decided_at))} mono />
          </>
        ) : null}
        {a.expires_at ? <KV k="ใช้ได้ถึง" v={thDateTime(String(a.expires_at))} mono /> : null}
        {a.consumed_at ? (
          <>
            <KV k="นำไปใช้เมื่อ" v={thDateTime(String(a.consumed_at))} mono />
            <KV k="ใช้กับ" v={String(a.consumed_ref ?? "—")} />
          </>
        ) : null}
      </div>

      <div>
        <p className="label">เหตุผลที่ขอ</p>
        <p className="border border-line bg-bone-200/50 px-3 py-2 leading-relaxed">
          {String(a.reason)}
        </p>
      </div>

      {a.decision_note ? (
        <div>
          <p className="label">บันทึกจากเจ้าของ</p>
          <p
            className={`border px-3 py-2 leading-relaxed ${
              a.status === "rejected"
                ? "border-signal-bad/25 bg-signal-badbg text-signal-bad"
                : "border-signal-ok/25 bg-signal-okbg text-signal-ok"
            }`}
          >
            {String(a.decision_note)}
          </p>
        </div>
      ) : null}

      {keys.length > 0 && (
        <div>
          <p className="label">ค่าที่ขอไว้ตอนยื่น</p>
          <div className="divide-y divide-line-soft border border-line px-3">
            {keys.map((k) => (
              <KV key={k} k={k} v={String(payload[k])} mono />
            ))}
          </div>
        </div>
      )}

      {a.status === "approved" && a.is_usable === true && (
        <Note tone="ok" title="ใบนี้ใช้ได้อยู่">
          ไปทำรายการที่หน้าที่เกี่ยวข้องได้เลย ระบบจะตัดใบนี้ทิ้งอัตโนมัติเมื่อใช้แล้ว
          เพื่อกันการนำไปใช้ซ้ำ
        </Note>
      )}
      {a.is_stale === true && (
        <Note tone="bad" title="ใบนี้หมดอายุแล้ว">
          อนุมัติไว้แล้วแต่ไม่ได้เอาไปใช้ในเวลาที่กำหนด ต้องยื่นเรื่องใหม่ถ้ายังจำเป็น
        </Note>
      )}
    </div>
  );
}

// ============================================================================
function NewRequestForm() {
  return (
    <ActionForm action={requestApproval} submitLabel="ส่งเรื่องให้เจ้าของ">
      <label className="block">
        <span className="label">เรื่องที่ขอ</span>
        <select name="kind" className="field" required>
          {APPROVAL_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.th} — {k.hint}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">เกี่ยวกับอะไร</span>
          <select name="target_type" className="field" required>
            <option value="job">ใบงาน</option>
            <option value="invoice">ใบวางบิล</option>
            <option value="quotation">ใบเสนอราคา</option>
            <option value="purchase_order">ใบสั่งซื้อ</option>
            <option value="shipment">รอบจัดส่ง</option>
          </select>
        </label>
        <label className="block">
          <span className="label">เลขที่เอกสารที่เกี่ยวข้อง</span>
          <input name="target_code" className="field" placeholder="เช่น JOB-2569-0002" />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="label">หัวเรื่อง</span>
        <input name="title" className="field" required
               placeholder="เช่น ขอเลื่อนกำหนดชำระ INV-2569-0004 ออกไป 15 วัน" />
      </label>

      <label className="mt-3 block">
        <span className="label">เหตุผล</span>
        <textarea name="reason" rows={4} className="field" required
                  placeholder="เขียนให้เจ้าของเห็นภาพ ทำไมถึงต้องนอกกรอบ และถ้าไม่ทำจะเกิดอะไรขึ้น" />
      </label>

      <label className="mt-3 block">
        <span className="label">ผลกระทบเป็นเงิน (บาท) ถ้าคิดเป็นเงินได้</span>
        <input name="amount" type="number" step="0.01" className="field" placeholder="0" />
      </label>

      <label className="mt-3 block">
        <span className="label">ค่าที่ขอ (ถ้ามี)</span>
        <input name="p_ค่าที่ขอ" className="field"
               placeholder="เช่น วันครบกำหนดใหม่ 8 ก.ย. 2569 หรือ ส่วนลด 15%" />
      </label>
    </ActionForm>
  );
}
