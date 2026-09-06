import "server-only";

// ============================================================================
// การขอเลขที่เอกสาร
//
// ตัวนับเลขอยู่ที่ฐานข้อมูล เรียกผ่านฟังก์ชัน next_code ซึ่งเพิ่มค่าแบบอะตอมมิก
// ต่อให้มีคนกดออกเอกสารพร้อมกันสิบคน ก็ไม่มีทางได้เลขชนกัน
//
// แต่มีกรณีหนึ่งที่ตัวนับตามหลังของจริงได้ คือเมื่อมีคนใส่เอกสารที่มีเลขเข้าฐานข้อมูล
// โดยไม่ผ่าน next_code เช่นข้อมูลตัวอย่างตอนติดตั้ง หรือข้อมูลที่ย้ายมาจากระบบเก่า
// ตัวนับจะยังนับจากศูนย์ แล้วเลขใบแรกที่ออกจริงจะไปชนกับเลขที่มีอยู่แล้ว
//
// ฟังก์ชันข้างล่างจึงไม่เชื่อตัวนับครั้งเดียวจบ  ถ้าฐานข้อมูลปฏิเสธเพราะเลขซ้ำ
// มันจะขอเลขถัดไปแล้วลองใหม่ ทำแบบนี้ได้เพราะตัวนับเดินหน้าอย่างเดียว
// เลขที่ชนไปแล้วจะไม่ถูกหยิบมาใช้ซ้ำอีก
// ============================================================================

/** รหัสข้อผิดพลาดของ Postgres เมื่อค่าซ้ำกับที่มีอยู่แล้ว */
const DUPLICATE = "23505";

type Client = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => { single: () => Promise<{ data: unknown; error: unknown }> };
    };
  };
};

function isDuplicate(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === DUPLICATE) return true;
  const m = (e.message ?? "").toLowerCase();
  return m.includes("duplicate key") || m.includes("already exists");
}

export type CodedInsert =
  | { ok: true; id: string; code: string }
  | { ok: false; message: string };

/**
 * ขอเลขที่เอกสารแล้วบันทึกแถวใหม่ ถ้าเลขซ้ำจะขอเลขถัดไปแล้วลองใหม่
 *
 * @param table  ชื่อตารางที่จะบันทึก
 * @param prefix ตัวย่อของชุดเลข เช่น JOB QT INV
 * @param row    ข้อมูลแถว ไม่ต้องใส่ช่อง code มาเอง ฟังก์ชันนี้ใส่ให้
 * @param tries  ลองได้กี่ครั้ง ปกติครั้งเดียวก็ผ่าน ที่เผื่อไว้คือกรณีตัวนับตามหลังมาก
 */
export async function insertWithCode(
  sb: Client,
  table: string,
  prefix: string,
  row: Record<string, unknown>,
  tries = 25,
): Promise<CodedInsert> {
  let lastMessage = "ออกเลขที่เอกสารไม่สำเร็จ";

  for (let i = 0; i < tries; i++) {
    const { data: code, error: codeErr } = await sb.rpc("next_code", { p_prefix: prefix });
    if (codeErr) {
      return { ok: false, message: (codeErr as { message?: string }).message ?? lastMessage };
    }

    const { data, error } = await sb
      .from(table)
      .insert({ ...row, code })
      .select("id, code")
      .single();

    if (!error) {
      const r = data as { id: string; code: string };
      return { ok: true, id: r.id, code: r.code };
    }

    if (!isDuplicate(error)) {
      return { ok: false, message: (error as { message?: string }).message ?? lastMessage };
    }

    // เลขนี้มีคนใช้ไปแล้ว วนไปขอเลขถัดไป
    lastMessage =
      `เลขที่ ${String(code)} ถูกใช้ไปแล้ว ระบบข้ามไปเลขถัดไปให้อัตโนมัติ ` +
      `ถ้าเจอบ่อยให้เรียก sync_counters() ที่ฐานข้อมูลหนึ่งครั้ง`;
  }

  return { ok: false, message: lastMessage };
}
