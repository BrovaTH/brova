import "server-only";
import { supabaseServer } from "../supabase/server";
import { flexMessage } from "./flex";

/**
 * ส่งข้อความเข้าไลน์ผ่าน Messaging API
 *
 * ทุกครั้งที่ส่งจะบันทึกลงตาราง line_log ทั้งสำเร็จและล้มเหลว
 * ถ้าส่งไม่ผ่านจะลองใหม่สองครั้ง แล้วค่อยยอมแพ้และบันทึกสาเหตุไว้
 *
 * ข้อสำคัญ  การแจ้งเตือนต้องไม่ทำให้งานหลักล้ม
 * ทุกฟังก์ชันในไฟล์นี้จับข้อผิดพลาดไว้เอง ไม่โยนต่อออกไป
 */

// ปกติยิงไปที่ไลน์โดยตรง ตั้งค่าเป็นที่อยู่อื่นได้ตอนทดสอบบนเครื่อง
const PUSH_URL = process.env.LINE_PUSH_URL || "https://api.line.me/v2/bot/message/push";

export type SendResult = { ok: boolean; sent: number; error?: string };

type Settings = { enabled: boolean; channel_token: string | null };

async function getSettings(): Promise<Settings | null> {
  const sb = supabaseServer();
  const { data } = await sb
    .from("line_settings")
    .select("enabled, channel_token")
    .eq("id", 1)
    .maybeSingle();
  return data ?? null;
}

/** ปลายทางของเหตุการณ์นี้ ถ้าไม่ได้เลือกไว้จะส่งเข้าทุกกลุ่มที่เปิดใช้งาน */
async function resolveTargets(eventKey: string) {
  const sb = supabaseServer();
  const { data: ev } = await sb
    .from("line_events")
    .select("enabled, target_id")
    .eq("key", eventKey)
    .maybeSingle();

  if (!ev || ev.enabled === false) return [];

  if (ev.target_id) {
    const { data } = await sb
      .from("line_targets")
      .select("target_id, name")
      .eq("id", ev.target_id)
      .eq("active", true);
    return data ?? [];
  }

  const { data } = await sb.from("line_targets").select("target_id, name").eq("active", true);
  return data ?? [];
}

async function log(row: Record<string, unknown>) {
  try {
    await supabaseServer().from("line_log").insert(row);
  } catch {
    /* ประวัติเขียนไม่ได้ ก็ไม่ควรทำให้การส่งล้ม */
  }
}

/** ยิงไปที่ไลน์จริง ลองซ้ำได้ */
async function push(token: string, to: string, messages: unknown[]): Promise<{ ok: boolean; error?: string }> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ to, messages }),
        cache: "no-store",
      });

      if (res.ok) return { ok: true };

      const text = await res.text();
      // ผิดที่ตัวข้อความหรือโทเคน ลองใหม่ไปก็เท่านั้น
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        return { ok: false, error: `${res.status} ${text.slice(0, 200)}` };
      }
      if (attempt === 3) return { ok: false, error: `${res.status} ${text.slice(0, 200)}` };
    } catch (e: unknown) {
      if (attempt === 3) {
        return { ok: false, error: e instanceof Error ? e.message : "ส่งไม่สำเร็จ" };
      }
    }
    await new Promise((r) => setTimeout(r, attempt * 600));
  }
  return { ok: false, error: "ส่งไม่สำเร็จหลังลองสามครั้ง" };
}

/** ส่งการ์ด Flex ของเหตุการณ์หนึ่งไปยังปลายทางที่ตั้งไว้ */
export async function notify(
  eventKey: string,
  altText: string,
  bubble: unknown,
): Promise<SendResult> {
  try {
    const settings = await getSettings();
    if (!settings?.enabled) return { ok: false, sent: 0, error: "ปิดการแจ้งเตือนอยู่" };
    if (!settings.channel_token) return { ok: false, sent: 0, error: "ยังไม่ได้ใส่โทเคน" };

    const targets = await resolveTargets(eventKey);
    if (targets.length === 0) return { ok: false, sent: 0, error: "ยังไม่ได้ตั้งปลายทาง" };

    const messages = [flexMessage(altText, bubble)];
    let sent = 0;
    let lastError: string | undefined;

    for (const t of targets) {
      const r = await push(settings.channel_token, t.target_id, messages);
      if (r.ok) sent++;
      else lastError = r.error;
      await log({
        event_key: eventKey,
        target_id: t.target_id,
        target_name: t.name,
        title: altText.slice(0, 200),
        payload: bubble as object,
        ok: r.ok,
        error: r.error ?? null,
      });
    }

    return { ok: sent > 0, sent, error: sent === 0 ? lastError : undefined };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "ส่งไม่สำเร็จ";
    await log({ event_key: eventKey, title: altText.slice(0, 200), ok: false, error: msg });
    return { ok: false, sent: 0, error: msg };
  }
}

/** ส่งไปที่ปลายทางเดียวโดยตรง ใช้กับปุ่มส่งทดสอบ */
export async function notifyTo(
  targetId: string,
  altText: string,
  bubble: unknown,
  eventKey = "test",
): Promise<SendResult> {
  try {
    const settings = await getSettings();
    if (!settings?.channel_token) return { ok: false, sent: 0, error: "ยังไม่ได้ใส่โทเคน" };

    const r = await push(settings.channel_token, targetId, [flexMessage(altText, bubble)]);
    await log({
      event_key: eventKey,
      target_id: targetId,
      title: altText.slice(0, 200),
      payload: bubble as object,
      ok: r.ok,
      error: r.error ?? null,
    });
    return { ok: r.ok, sent: r.ok ? 1 : 0, error: r.error };
  } catch (e: unknown) {
    return { ok: false, sent: 0, error: e instanceof Error ? e.message : "ส่งไม่สำเร็จ" };
  }
}

/** ที่อยู่เว็บสำหรับปุ่มบนการ์ด */
export function appUrl(path = "/"): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (!base) return "";
  return base.replace(/\/$/, "") + path;
}
