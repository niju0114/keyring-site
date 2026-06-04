// netlify/functions/profile.js
// 키링별 프로필 저장소. 외부 DB 없이 Netlify Blobs(내장 저장소) 사용.
// GET  /api/profile?k=코드   → { exists, profile, hasPin }
// PUT  /api/profile?k=코드   → 본문 { profile, pin }  (PIN이 걸려있으면 일치해야 저장)
import { getStore } from "@netlify/blobs";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export default async (req) => {
  const store = getStore("profiles");
  const url = new URL(req.url);
  const key = (url.searchParams.get("k") || "").trim();
  if (!key) return json({ error: "no_key" }, 400);

  // 읽기
  if (req.method === "GET") {
    const rec = await store.get(key, { type: "json" });
    if (!rec) return json({ exists: false });
    return json({ exists: true, profile: rec.profile, hasPin: !!rec.pin }); // PIN은 절대 내려주지 않음
  }

  // 저장 / 수정
  if (req.method === "PUT" || req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad_body" }, 400); }
    const incomingPin = (body.pin || "").toString().trim();

    const existing = await store.get(key, { type: "json" });
    if (existing && existing.pin) {
      // 이미 PIN이 걸린 키링 → 일치해야 수정 가능
      if (incomingPin !== existing.pin) return json({ error: "wrong_pin" }, 403);
    }

    const pin = existing && existing.pin ? existing.pin : (incomingPin || null);
    const rec = { profile: body.profile || {}, pin, updated: Date.now() };
    await store.setJSON(key, rec);
    return json({ ok: true });
  }

  return json({ error: "method_not_allowed" }, 405);
};

// /api/profile 로 접근 가능하게
export const config = { path: "/api/profile" };
