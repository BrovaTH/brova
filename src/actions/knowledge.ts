"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { insertWithCode } from "@/lib/doc-code";

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

// ============================================================================
// คลังความรู้
//
// ทุกครั้งที่แก้ปัญหาหน้างานได้ ให้จดไว้สี่ข้อ อาการ สาเหตุ วิธีแก้ วิธีป้องกัน
//
// จดสี่ข้อนี้เพราะมันคือรูปทรงของความรู้ที่เอาไปใช้ต่อได้จริง
// ถ้าจดแค่ "แก้แล้ว" คนอ่านทีหลังจะไม่รู้ว่าตอนนั้นเจออะไรและทำอะไรลงไป
// ข้อที่สำคัญที่สุดคือวิธีป้องกัน เพราะมันคือข้อเดียวที่ทำให้ปัญหาไม่กลับมาอีก
// ============================================================================

function text(fd: FormData, key: string): string | null {
  const v = String(fd.get(key) ?? "").trim();
  return v === "" ? null : v;
}

export async function createKnowledge(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();

  const title = text(fd, "title");
  if (!title) return { ok: false, message: "ต้องตั้งชื่อเรื่องก่อน จะได้ค้นเจอทีหลัง" };

  const symptom = text(fd, "symptom");
  if (!symptom) return { ok: false, message: "ต้องเขียนอาการที่เจอ ไม่งั้นคนอ่านทีหลังจะเทียบไม่ได้ว่าใช่เรื่องเดียวกันไหม" };

  const prevention = text(fd, "prevention");
  if (!prevention)
    return { ok: false, message: "ต้องเขียนวิธีป้องกัน เพราะเป็นข้อเดียวที่ทำให้ปัญหาไม่กลับมาอีก" };

  // แท็กพิมพ์มาเป็นข้อความคั่นด้วยจุลภาค แปลงเป็นรายการก่อนเก็บ
  // ตัดช่องว่างและตัวซ้ำทิ้ง เพื่อให้กรองด้วยแท็กแล้วได้ผลตรง
  const raw = String(fd.get("tags") ?? "");
  const tags = Array.from(
    new Set(raw.split(",").map((t) => t.trim()).filter(Boolean)),
  );

  const made = await insertWithCode(sb as never, "knowledge", "KB", {
    title,
    symptom,
    root_cause: text(fd, "root_cause"),
    action_taken: text(fd, "action_taken"),
    prevention,
    tags,
    job_id: text(fd, "job_id"),
  });
  if (!made.ok) return { ok: false, message: made.message };

  revalidatePath("/knowledge");
  return { ok: true, message: `บันทึกเข้าคลังความรู้แล้ว เลขที่ ${made.code}` };
}

export async function deleteKnowledge(fd: FormData): Promise<ActionResult> {
  const sb = supabaseServer();
  const id = String(fd.get("id") ?? "");

  const { error } = await sb.from("knowledge").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/knowledge");
  return { ok: true, message: "ลบเรื่องนี้แล้ว" };
}
