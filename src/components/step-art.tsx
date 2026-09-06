import { PUBLIC_STEPS } from "@/lib/workflow";

/**
 * แถบเจ็ดขั้นที่ลูกค้าเห็นบนหน้าติดตามงาน
 * ตั้งใจให้อ่านได้จบในสายตาเดียว ไม่ใช้สีเยอะ ใช้ทึบกับโปร่งแยกขั้นที่ผ่านแล้ว
 */
export function StepBar({ current, compact }: { current: number; compact?: boolean }) {
  return (
    <ol className="flex w-full items-stretch gap-[3px]">
      {PUBLIC_STEPS.map((s) => {
        const done = s.step < current;
        const now = s.step === current;
        return (
          <li key={s.step} className="min-w-0 flex-1">
            <div
              className={`h-1.5 w-full ${
                done ? "bg-ink/35" : now ? "bg-ink" : "bg-bone-300"
              }`}
            />
            {!compact && (
              <p
                className={`mt-2 truncate text-[10px] leading-tight sm:text-[11px] ${
                  now ? "text-ink" : done ? "text-ink/45" : "text-ink/30"
                }`}
              >
                {s.th}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** ตัวเลขขั้นแบบสี่เหลี่ยมทึบ ใช้เป็นหัวข้อในหน้าเอกสารและสไลด์ */
export function StepMark({ n, invert }: { n: number; invert?: boolean }) {
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center text-[12px] font-medium ${
        invert ? "bg-bone text-ink" : "bg-ink text-bone"
      }`}
    >
      {n}
    </span>
  );
}
