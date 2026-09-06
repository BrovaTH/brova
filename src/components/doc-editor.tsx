"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DocPaper, type CompanyInfo } from "./doc-paper";
import { A4Frame } from "./a4-sheet";
import { Modal } from "./modal";
import { money } from "@/lib/format";
import {
  DEFAULT_LABELS, docTotals, emptyLine, label,
  type DocLine, type DocModel,
} from "@/lib/doc-model";

export type SaveResult = { ok: true; message?: string } | { ok: false; message: string };

/**
 * หน้าแก้ไขเอกสารคู่พรีวิว
 *
 * ซ้ายคือช่องกรอก ขวาคือกระดาษ A4 ที่อัปเดตตามทันที
 * ทุกคำบนใบกดแก้ได้ คำที่แก้จะถูกเก็บไว้เฉพาะเอกสารใบนั้น
 *
 * เอกสารที่ออกเลขแล้วจะเข้าโหมดอ่านอย่างเดียว
 * และฝั่งเซิร์ฟเวอร์ก็ปฏิเสธการบันทึกซ้ำอีกชั้น ไม่ได้กันแค่ที่หน้าจอ
 */
export function DocEditor({
  initial, company, readOnly, lockNote, onSave, onIssue,
}: {
  initial: DocModel;
  company?: CompanyInfo | null;
  readOnly?: boolean;
  lockNote?: string | null;
  onSave: (payload: string) => Promise<SaveResult>;
  onIssue?: (payload: string) => Promise<SaveResult>;
}) {
  const router = useRouter();
  const [doc, setDoc] = useState<DocModel>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [labelEdit, setLabelEdit] = useState<string | null>(null);
  const [askIssue, setAskIssue] = useState(false);

  const t = useMemo(() => docTotals(doc), [doc]);
  const ro = !!readOnly;

  function set<K extends keyof DocModel>(k: K, v: DocModel[K]) {
    setDoc((d) => ({ ...d, [k]: v }));
    setMsg(null);
  }

  function setLine(i: number, patch: Partial<DocLine>) {
    setDoc((d) => {
      const lines = d.lines.slice();
      lines[i] = { ...lines[i], ...patch };
      return { ...d, lines };
    });
    setMsg(null);
  }

  function addLine() {
    setDoc((d) => ({ ...d, lines: [...d.lines, emptyLine(d.lines.length + 1)] }));
  }

  function delLine(i: number) {
    setDoc((d) => ({
      ...d,
      lines: d.lines.filter((_, k) => k !== i).map((l, k) => ({ ...l, seq: k + 1 })),
    }));
  }

  function moveLine(i: number, dir: -1 | 1) {
    setDoc((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.lines.length) return d;
      const lines = d.lines.slice();
      [lines[i], lines[j]] = [lines[j], lines[i]];
      return { ...d, lines: lines.map((l, k) => ({ ...l, seq: k + 1 })) };
    });
  }

  /**
   * ยิงคำสั่งไปที่เซิร์ฟเวอร์แล้วรายงานผล
   *
   * ตอนออกเอกสาร ต้องโหลดหน้าใหม่ด้วย ไม่ใช่แค่ขึ้นข้อความว่าสำเร็จ
   * เพราะพอออกเลขแล้วเอกสารจะถูกล็อก หน้าจอต้องเปลี่ยนจากโหมดแก้ไข
   * ไปเป็นใบจริงที่มีเลขที่กำกับ ถ้าไม่โหลดใหม่ คนใช้จะยังเห็นฟอร์มเดิม
   * แล้วเข้าใจผิดว่ายังแก้ได้อยู่ ทั้งที่แก้ไม่ได้แล้ว
   */
  function run(fn: (p: string) => Promise<SaveResult>, reloadAfter = false) {
    start(async () => {
      try {
        const res = await fn(JSON.stringify(doc));
        setMsg({ ok: res.ok, text: res.ok ? (res.message ?? "บันทึกแล้ว") : res.message });
        if (res.ok && reloadAfter) router.refresh();
      } catch (e: unknown) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" });
      }
    });
  }

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      {/* ------------------------------------------------------------ ช่องกรอก */}
      <div className="no-print space-y-6">
        {ro && lockNote && (
          <p className="border border-signal-warn/30 bg-signal-warnbg px-3 py-2 text-[12px] leading-relaxed text-signal-warn">
            {lockNote} · เปิดดูและพิมพ์ได้ แต่แก้ไม่ได้
          </p>
        )}

        <Group title="คู่ค้า">
          <F label="ชื่อ" value={doc.party.name} ro={ro}
             onChange={(v) => set("party", { ...doc.party, name: v })} />
          <F label="เลขประจำตัวผู้เสียภาษี" value={doc.party.tax_id} ro={ro}
             onChange={(v) => set("party", { ...doc.party, tax_id: v })} />
          <F label="ที่อยู่" value={doc.party.address} ro={ro} area
             onChange={(v) => set("party", { ...doc.party, address: v })} />
          <div className="grid grid-cols-2 gap-3">
            <F label="ผู้ติดต่อ" value={doc.party.contact} ro={ro}
               onChange={(v) => set("party", { ...doc.party, contact: v })} />
            <F label="โทรศัพท์" value={doc.party.phone} ro={ro}
               onChange={(v) => set("party", { ...doc.party, phone: v })} />
          </div>
        </Group>

        <Group title="หัวเอกสาร">
          <div className="grid grid-cols-2 gap-3">
            <F label="วันที่" value={doc.issueDate} ro={ro} type="date"
               onChange={(v) => set("issueDate", v)} />
            <F label="ครบกำหนด / ยืนราคาถึง" value={doc.dueDate} ro={ro} type="date"
               onChange={(v) => set("dueDate", v)} />
            <F label="เลขที่ใบสั่งซื้อของลูกค้า" value={doc.poNumber} ro={ro}
               onChange={(v) => set("poNumber", v)} />
            <F label="เครดิต (วัน)" value={doc.creditDays} ro={ro} type="number"
               onChange={(v) => set("creditDays", v === "" ? null : Number(v))} />
          </div>
          <F label="ชื่อโปรเจกต์" value={doc.projectName} ro={ro}
             onChange={(v) => set("projectName", v)} />
        </Group>

        <Group
          title="รายการ"
          right={
            !ro && (
              <button type="button" onClick={addLine} className="btn-ghost px-3 py-1">
                เพิ่มรายการ
              </button>
            )
          }
        >
          <div className="space-y-3">
            {doc.lines.map((l, i) => (
              <div key={l.id ?? i} className="border border-line bg-bone-200/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wide2 text-ink/40">
                    รายการที่ {i + 1}
                  </span>
                  {!ro && (
                    <span className="flex gap-1">
                      <Mini onClick={() => moveLine(i, -1)} disabled={i === 0}>↑</Mini>
                      <Mini onClick={() => moveLine(i, 1)} disabled={i === doc.lines.length - 1}>↓</Mini>
                      <Mini onClick={() => delLine(i)} danger>ลบ</Mini>
                    </span>
                  )}
                </div>
                <F label="รายการ" value={l.description} ro={ro}
                   onChange={(v) => setLine(i, { description: v })} />
                <F label="รายละเอียดย่อย" value={l.detail} ro={ro}
                   onChange={(v) => setLine(i, { detail: v })} />
                <div className="grid grid-cols-3 gap-2">
                  <F label="จำนวน" value={l.qty} ro={ro} type="number"
                     onChange={(v) => setLine(i, { qty: Number(v) || 0 })} />
                  <F label="หน่วย" value={l.unit} ro={ro}
                     onChange={(v) => setLine(i, { unit: v })} />
                  <F label="ราคา/หน่วย" value={l.unit_price} ro={ro} type="number"
                     onChange={(v) => setLine(i, { unit_price: Number(v) || 0 })} />
                </div>
                <p className="tnum mt-2 text-right text-[12px] text-ink/60">
                  รวม {money(l.qty * l.unit_price)}
                </p>
              </div>
            ))}
            {doc.lines.length === 0 && (
              <p className="border border-dashed border-line px-3 py-8 text-center text-[12px] text-ink/40">
                ยังไม่มีรายการ กดปุ่มเพิ่มรายการด้านบน
              </p>
            )}
          </div>
        </Group>

        <Group title="ยอดและภาษี">
          <F label="ส่วนลด (บาท)" value={doc.discount} ro={ro} type="number"
             onChange={(v) => set("discount", Number(v) || 0)} />
          <div className="grid grid-cols-2 gap-3">
            <Check label={`คิดภาษีมูลค่าเพิ่ม ${doc.vatPct}%`} checked={doc.vat} ro={ro}
                   onChange={(v) => set("vat", v)} />
            <Check label={`หัก ณ ที่จ่าย ${doc.whtPct}%`} checked={doc.wht} ro={ro}
                   onChange={(v) => set("wht", v)} />
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-ink/45">
            ภาษีหัก ณ ที่จ่ายคิดจากยอดก่อนภาษีมูลค่าเพิ่ม และหักเฉพาะลูกค้านิติบุคคล
          </p>
          <div className="mt-3 border border-line bg-white px-3 py-2">
            <SumRow k="รวมเป็นเงิน" v={t.subtotal} />
            {t.discount > 0 && <SumRow k="ส่วนลด" v={-t.discount} />}
            {t.vatPct > 0 && <SumRow k={`ภาษีมูลค่าเพิ่ม ${t.vatPct}%`} v={t.vatAmount} />}
            <SumRow k="รวมทั้งสิ้น" v={t.grandTotal} bold />
            {t.whtPct > 0 && <SumRow k={`หัก ณ ที่จ่าย ${t.whtPct}%`} v={-t.whtAmount} />}
            {t.whtPct > 0 && <SumRow k="ยอดที่ต้องชำระ" v={t.netPayable} bold />}
          </div>
        </Group>

        <Group title="เงื่อนไขท้ายเอกสาร">
          <F label="ข้อความ" value={doc.terms} ro={ro} area rows={5}
             onChange={(v) => set("terms", v)} />
        </Group>

        <Group title="คำบนใบ" hint="กดที่คำเพื่อเปลี่ยน เช่นเปลี่ยนคำว่าลูกค้าเป็นผู้ว่าจ้าง">
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(DEFAULT_LABELS).map((k) => (
              <button
                key={k}
                type="button"
                disabled={ro}
                onClick={() => setLabelEdit(k)}
                className={`border px-2 py-1 text-[11px] ${
                  doc.labels?.[k]
                    ? "border-ink bg-ink text-bone"
                    : "border-line bg-white text-ink/60 hover:border-ink"
                } disabled:opacity-50`}
              >
                {label(doc, k)}
              </button>
            ))}
          </div>
        </Group>

        {msg && (
          <p
            className={`border px-3 py-2 text-[12px] ${
              msg.ok
                ? "border-signal-ok/30 bg-signal-okbg text-signal-ok"
                : "border-signal-bad/30 bg-signal-badbg text-signal-bad"
            }`}
          >
            {msg.text}
          </p>
        )}

        {!ro && (
          <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-line bg-bone py-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(onSave)}
              className="btn-ghost"
            >
              {pending ? "กำลังบันทึก…" : "บันทึกร่าง"}
            </button>
            {onIssue && (
              <button
                type="button"
                disabled={pending}
                onClick={() => setAskIssue(true)}
                className="btn-solid"
              >
                ออกเอกสารและล็อก
              </button>
            )}
            <button type="button" onClick={() => window.print()} className="btn-ghost">
              พิมพ์
            </button>
          </div>
        )}

        {ro && (
          <button type="button" onClick={() => window.print()} className="btn-solid">
            พิมพ์เอกสาร
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------ พรีวิว */}
      <div>
        <A4Frame>
          <DocPaper
            doc={doc}
            company={company}
            scale={0.92}
            watermark={doc.code ? null : "ร่าง"}
          />
        </A4Frame>
      </div>

      {/* ------------------------------------------------------------ ป็อปอัพแก้คำ */}
      <Modal
        open={!!labelEdit}
        onClose={() => setLabelEdit(null)}
        title="เปลี่ยนคำบนใบ"
        subtitle={labelEdit ? `ค่ามาตรฐานคือ “${DEFAULT_LABELS[labelEdit]}”` : undefined}
      >
        {labelEdit && (
          <div>
            <input
              autoFocus
              className="field"
              defaultValue={label(doc, labelEdit)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = (e.target as HTMLInputElement).value.trim();
                  set("labels", { ...doc.labels, [labelEdit]: v });
                  setLabelEdit(null);
                }
              }}
              onBlur={(e) => {
                const v = e.target.value.trim();
                set("labels", { ...doc.labels, [labelEdit]: v });
              }}
            />
            <div className="mt-4 flex justify-between gap-2">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  const next = { ...doc.labels };
                  delete next[labelEdit];
                  set("labels", next);
                  setLabelEdit(null);
                }}
              >
                กลับไปใช้ค่ามาตรฐาน
              </button>
              <button type="button" className="btn-solid" onClick={() => setLabelEdit(null)}>
                เสร็จ
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------------------ ป็อปอัพยืนยันออกเอกสาร */}
      <Modal
        open={askIssue}
        onClose={() => setAskIssue(false)}
        title="ออกเอกสารและล็อก"
      >
        <p className="leading-relaxed">
          ระบบจะออกเลขที่เอกสารให้ แล้วล็อกใบนี้ไว้ถาวร
          หลังจากนี้แก้ตัวเลขหรือข้อความไม่ได้อีก ถ้าผิดต้องยกเลิกแล้วออกใบใหม่ หรือออกใบลดหนี้
        </p>
        <div className="mt-4 border border-line bg-bone-200/50 px-3 py-2">
          <SumRow k="ยอดที่ต้องชำระ" v={t.netPayable} bold />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setAskIssue(false)}>
            ย้อนกลับ
          </button>
          <button
            type="button"
            className="btn-solid"
            onClick={() => {
              setAskIssue(false);
              if (onIssue) run(onIssue, true);
            }}
          >
            ออกเอกสาร
          </button>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------- ชิ้นส่วนย่อย
function Group({ title, hint, right, children }: {
  title: string; hint?: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-medium">{title}</h3>
          {hint && <p className="text-[11px] text-ink/45">{hint}</p>}
        </div>
        {right}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function F({ label: lb, value, onChange, ro, type = "text", area, rows = 3 }: {
  label: string;
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  ro?: boolean;
  type?: string;
  area?: boolean;
  rows?: number;
}) {
  const v = value === null || value === undefined ? "" : String(value);
  return (
    <label className="block">
      <span className="label">{lb}</span>
      {area ? (
        <textarea
          className="field"
          rows={rows}
          value={v}
          disabled={ro}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className="field"
          type={type}
          value={v}
          disabled={ro}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

function Check({ label: lb, checked, onChange, ro }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; ro?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 border border-line bg-white px-3 py-2 text-[12px]">
      <input
        type="checkbox"
        checked={checked}
        disabled={ro}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-ink"
      />
      {lb}
    </label>
  );
}

function Mini({ children, onClick, disabled, danger }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`border px-2 py-0.5 text-[11px] disabled:opacity-30 ${
        danger
          ? "border-signal-bad/40 text-signal-bad hover:bg-signal-badbg"
          : "border-line text-ink/60 hover:border-ink"
      }`}
    >
      {children}
    </button>
  );
}

function SumRow({ k, v, bold }: { k: string; v: number; bold?: boolean }) {
  return (
    <div className="flex justify-between border-b border-line-soft py-1 text-[12px] last:border-0">
      <span className={bold ? "font-medium" : "text-ink/55"}>{k}</span>
      <span className={`tnum ${bold ? "font-medium" : ""}`}>{money(v)}</span>
    </div>
  );
}
