// netlify/functions/admin-auth.js
// 관리자(판매자) 코드 발급 도구 게이트.
// POST /api/admin-auth  본문 { password } → 환경변수 ADMIN_PASSWORD 와 일치하면 { ok:true }
// 비밀번호는 클라이언트 코드에 두지 않고 서버에서만 검증한다.
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_body" }, 400); }
  const pw = (body.password || "").toString();
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected) return json({ error: "not_configured" }, 500); // 환경변수 미설정
  if (!safeEqual(pw, expected)) return json({ error: "wrong" }, 403);
  return json({ ok: true });
};

export const config = { path: "/api/admin-auth" };
