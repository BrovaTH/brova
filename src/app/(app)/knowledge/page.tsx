import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHead, Section, Stat, Tag, Note, Empty } from "@/components/ui";
import { ModalButton } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { deleteKnowledge } from "@/actions/knowledge";
import { NewKnowledgeForm } from "./new-entry";
import { num, thDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// ============================================================================
// คลังความรู้
//
// ปัญหาที่เคยแก้ได้ครั้งหนึ่ง ถ้าไม่จด ครั้งหน้าจะเสียเวลาแก้ใหม่ทั้งหมด
// และถ้าคนที่เคยแก้ลาออก ความรู้ก้อนนั้นออกไปพร้อมกับเขา
//
// แต่ละเรื่องเก็บสี่ข้อ อาการ สาเหตุ วิธีแก้ วิธีป้องกัน
// เรียงจากใหม่ไปเก่า และกรองด้วยแท็กได้จากลิงก์ด้านบน
// ============================================================================

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams?: { tag?: string };
}) {
  const sb = supabaseServer();
  const [{ data: rows }, { data: jobs }] = await Promise.all([
    sb.from("knowledge").select("*").order("created_at", { ascending: false }),
    sb.from("jobs_view").select("id, code, title").order("created_at", { ascending: false }),
  ]);

  const K = rows ?? [];
  const J = jobs ?? [];
  const jobCode = new Map<string, string>(
    J.map((j) => [String(j.id), String(j.code)] as [string, string]),
  );

  // รวมแท็กทั้งหมดที่เคยใช้ พร้อมนับว่าใช้ไปกี่เรื่อง
  // เรียงจากที่ใช้บ่อยที่สุด เพราะแท็กที่ใช้บ่อยคือปัญหาที่เจอบ่อย
  const tagCount = new Map<string, number>();
  for (const k of K) {
    for (const t of (k.tags as string[] | null) ?? []) {
      tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    }
  }
  const tags = Array.from(tagCount.entries()).sort((a, b) => b[1] - a[1]);

  const active = searchParams?.tag ?? null;
  const shown = active ? K.filter((k) => ((k.tags as string[] | null) ?? []).includes(active)) : K;

  return (
    <>
      <PageHead
        eyebrow="คลังความรู้"
        title="KNOWLEDGE LIBRARY"
        lead="ปัญหาที่เคยเจอ เก็บไว้ให้คนถัดไป อาการ สาเหตุ วิธีแก้ และวิธีป้องกันไม่ให้เกิดซ้ำ"
        right={
          <ModalButton
            variant="solid"
            label="บันทึกเรื่องใหม่"
            title="บันทึกความรู้เข้าคลัง"
            subtitle="จดตอนที่ยังจำรายละเอียดได้ อย่ารอจนลืม"
            wide
          >
            <NewKnowledgeForm
              jobs={J.slice(0, 60).map((j) => ({
                id: String(j.id),
                label: `${j.code} · ${j.title}`,
              }))}
            />
          </ModalButton>
        }
      />

      <Section title="ตัวเลขรวม">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="เรื่องที่เก็บไว้" value={num(K.length)} unit="เรื่อง"
                hint="ทุกเรื่องคือปัญหาที่เคยเสียเวลาแก้มาแล้วจริง" />
          <Stat label="แท็กที่ใช้" value={num(tags.length)} unit="แท็ก"
                hint="แท็กที่ใช้บ่อยคือจุดที่ปัญหาเกิดซ้ำ" />
          <Stat label="ผูกกับงานจริง"
                value={num(K.filter((k) => k.job_id).length)} unit="เรื่อง"
                hint="ย้อนกลับไปดูงานต้นเรื่องได้" />
        </div>
      </Section>

      {tags.length > 0 && (
        <Section title="กรองด้วยแท็ก" hint="กดแท็กเพื่อดูเฉพาะเรื่องที่เกี่ยวข้อง">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/knowledge"
              className={`border px-2.5 py-1 text-[12px] transition-colors ${
                active === null
                  ? "border-ink bg-ink text-bone"
                  : "border-line bg-white hover:border-ink"
              }`}
            >
              ทั้งหมด {K.length}
            </Link>
            {tags.map(([t, n]) => (
              <Link
                key={t}
                href={`/knowledge?tag=${encodeURIComponent(t)}`}
                className={`border px-2.5 py-1 text-[12px] transition-colors ${
                  active === t
                    ? "border-ink bg-ink text-bone"
                    : "border-line bg-white hover:border-ink"
                }`}
              >
                {t} {n}
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section
        title={active ? `เรื่องที่ติดแท็ก ${active}` : "ทุกเรื่องในคลัง"}
        hint="เรียงจากเรื่องที่บันทึกล่าสุด"
      >
        {shown.length === 0 ? (
          <Empty
            title={active ? "ไม่มีเรื่องที่ติดแท็กนี้" : "คลังยังว่างอยู่"}
            hint={
              active
                ? "ลองเลือกแท็กอื่น หรือกดทั้งหมดเพื่อดูทุกเรื่อง"
                : "ครั้งหน้าที่แก้ปัญหาหน้างานได้ กดบันทึกเรื่องใหม่ไว้เลย ตอนที่ยังจำรายละเอียดได้"
            }
          />
        ) : (
          <div className="space-y-3">
            {shown.map((k) => (
              <article key={String(k.id)} className="card px-4 py-4">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide2 text-ink/35">
                      <span className="tnum">{String(k.code ?? "—")}</span>
                      {k.job_id && (
                        <>
                          {" · "}
                          <Link href={`/jobs/${k.job_id}`} className="underline underline-offset-4">
                            {jobCode.get(String(k.job_id)) ?? "งานที่เกี่ยวข้อง"}
                          </Link>
                        </>
                      )}
                      {" · "}
                      {thDate(k.created_at as string)}
                    </p>
                    <h3 className="mt-1 text-[15px] font-medium tracking-display">
                      {String(k.title)}
                    </h3>
                  </div>
                  <ModalButton
                    label="ลบ"
                    title="ลบเรื่องนี้ออกจากคลัง"
                    subtitle={String(k.title)}
                  >
                    <p className="mb-4 leading-relaxed">
                      ลบแล้วเอาคืนไม่ได้ ก่อนลบลองถามตัวเองว่าปัญหานี้จะไม่เกิดอีกแน่หรือ
                      ถ้าไม่แน่ใจ เก็บไว้ดีกว่า เพราะไม่ได้เปลืองอะไร
                    </p>
                    <ActionForm action={deleteKnowledge} submitLabel="ยืนยันลบ" danger>
                      <input type="hidden" name="id" value={String(k.id)} />
                    </ActionForm>
                  </ModalButton>
                </div>

                <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  <Field n="1" label="อาการที่เจอ" v={k.symptom as string} />
                  <Field n="2" label="สาเหตุที่แท้จริง" v={k.root_cause as string} />
                  <Field n="3" label="สิ่งที่ทำไป" v={k.action_taken as string} />
                  <Field n="4" label="วิธีป้องกันไม่ให้เกิดซ้ำ" v={k.prevention as string} />
                </div>

                {((k.tags as string[] | null) ?? []).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line-soft pt-3">
                    {((k.tags as string[] | null) ?? []).map((t) => (
                      <Tag key={t} tone="mute">{t}</Tag>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </Section>

      <Note tone="info" title="ทำไมต้องมีช่องวิธีป้องกันแยกจากวิธีแก้">
        เพราะสองอย่างนี้คนละเรื่องกัน วิธีแก้คือสิ่งที่ทำตอนไฟไหม้ ส่วนวิธีป้องกันคือสิ่งที่ทำให้ไฟไม่ไหม้อีก
        ถ้าจดแต่วิธีแก้ ปัญหาเดิมจะกลับมาทุกเดือนแล้วเราจะเก่งขึ้นแค่เรื่องดับไฟ
        ระบบจึงบังคับให้กรอกช่องนี้เสมอ
      </Note>
    </>
  );
}

function Field({ n, label, v }: { n: string; label: string; v: string | null }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide2 text-ink/40">
        {n}. {label}
      </p>
      <p className="mt-0.5 whitespace-pre-line text-[13px] leading-relaxed">
        {v || <span className="text-ink/30">ไม่ได้บันทึกไว้</span>}
      </p>
    </div>
  );
}
