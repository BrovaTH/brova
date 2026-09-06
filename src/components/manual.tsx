"use client";

import { useMemo, useState } from "react";
import { Modal } from "./modal";
import { MANUAL, searchManual, MANUAL_TOPIC_COUNT, type Topic } from "@/lib/manual";

/**
 * คู่มือการใช้งานแบบเปิดอ่านในระบบ
 *
 * ซ้ายเป็นสารบัญ ขวาเป็นเนื้อหา ค้นหาได้ทั้งเล่ม
 * เขียนเป็นขั้นตอนที่ทำตามได้ ไม่ใช่คำอธิบายว่าปุ่มไหนชื่ออะไร
 */
export function ManualButton({
  label = "คู่มือการใช้งาน",
  variant = "ghost",
  className = "",
}: {
  label?: string;
  variant?: "ghost" | "solid" | "link";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(MANUAL[0].topics[0].id);

  const hits = useMemo(() => searchManual(q), [q]);
  const searching = q.trim().length > 0;

  const current: Topic | undefined = useMemo(() => {
    for (const c of MANUAL) {
      const t = c.topics.find((x) => x.id === active);
      if (t) return t;
    }
    return MANUAL[0].topics[0];
  }, [active]);

  const cls =
    variant === "solid" ? "btn-solid"
    : variant === "ghost" ? "btn-ghost"
    : "text-[12px] text-ink/60 underline decoration-line-hard underline-offset-4 hover:text-ink";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${cls} ${className}`}>
        {label}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="คู่มือการใช้งาน"
        subtitle={`${MANUAL.length} หมวด · ${MANUAL_TOPIC_COUNT} หัวข้อ · ค้นหาได้ทั้งเล่ม`}
        wide
      >
        <input
          className="field mb-4"
          placeholder="ค้นหา เช่น นับสต็อก ขออนุมัติ ภาษี ไลน์"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        {searching ? (
          <div>
            <p className="mb-3 text-[12px] text-ink/45">
              {hits.length ? `พบ ${hits.length} หัวข้อ` : "ไม่พบหัวข้อที่ตรงกับคำค้น"}
            </p>
            <div className="space-y-2">
              {hits.map(({ chapter, topic }) => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => {
                    setActive(topic.id);
                    setQ("");
                  }}
                  className="block w-full border border-line bg-white px-3 py-2.5 text-left hover:border-ink"
                >
                  <span className="block text-[11px] uppercase tracking-wide2 text-ink/40">
                    {chapter.title}
                  </span>
                  <span className="block text-[14px]">{topic.title}</span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-ink/55">
                    {topic.intro.slice(0, 110)}…
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-[minmax(0,190px)_minmax(0,1fr)]">
            {/* -------------------------------------------------- สารบัญ */}
            <nav className="sm:border-r sm:border-line sm:pr-4">
              {MANUAL.map((c) => (
                <div key={c.id} className="mb-4">
                  <p className="mb-1.5 text-[10px] uppercase tracking-wide2 text-ink/40">
                    {c.title}
                  </p>
                  {c.topics.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActive(t.id)}
                      className={`block w-full px-2 py-1 text-left text-[12.5px] leading-snug ${
                        active === t.id
                          ? "bg-ink text-bone"
                          : "text-ink/60 hover:bg-bone-200 hover:text-ink"
                      }`}
                    >
                      {t.title}
                    </button>
                  ))}
                </div>
              ))}
            </nav>

            {/* -------------------------------------------------- เนื้อหา */}
            <article className="min-w-0">
              {current && (
                <>
                  <p className="text-[11px] uppercase tracking-wide2 text-ink/40">
                    สำหรับ {current.forRoles}
                  </p>
                  <h3 className="mt-1 text-[19px] font-medium leading-snug tracking-display">
                    {current.title}
                  </h3>
                  <p className="mt-2 leading-relaxed text-ink/75">{current.intro}</p>

                  {current.steps && (
                    <ol className="mt-5 space-y-3">
                      {current.steps.map((s, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center bg-ink text-[11px] text-bone">
                            {i + 1}
                          </span>
                          <span className="min-w-0">
                            <span className="block leading-relaxed">{s.do}</span>
                            {s.why && (
                              <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink/50">
                                {s.why}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}

                  {current.notes && current.notes.length > 0 && (
                    <div className="mt-5 border-t border-line pt-4">
                      <p className="mb-2 text-[11px] uppercase tracking-wide2 text-ink/40">
                        เกร็ดที่ควรรู้
                      </p>
                      <ul className="space-y-2">
                        {current.notes.map((n, i) => (
                          <li key={i} className="flex gap-2.5 leading-relaxed">
                            <span className="mt-[9px] h-1 w-1 shrink-0 bg-line-hard" />
                            <span className="text-ink/70">{n}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {current.warn && (
                    <p className="mt-5 border border-signal-warn/30 bg-signal-warnbg px-3 py-2.5 leading-relaxed text-signal-warn">
                      {current.warn}
                    </p>
                  )}
                </>
              )}
            </article>
          </div>
        )}
      </Modal>
    </>
  );
}
