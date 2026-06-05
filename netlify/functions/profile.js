// netlify/functions/profile.js
// 키링별 프로필 저장소. 외부 DB 없이 Netlify Blobs(내장 저장소) 사용.
// GET  /api/profile?k=코드   → { exists, profile, hasPin, isOwner }
//   - 헤더 x-owner-token 이 레코드의 주인 토큰과 일치하면 isOwner:true
// PUT  /api/profile?k=코드   → 본문 { profile, pin?, ownerToken? }
//   - 첫 등록: 누구나 가능(=주인이 됨). pin을 주면 잠금 설정.
//   - 기존: ownerToken 일치 또는 pin 일치해야 저장. 성공 시 ownerToken 반환.
//   - PIN 오류는 시도 제한(5회 → 10분 잠금).
import { getStore } from "@netlify/blobs";

const MAX_TRIES = 5;
const LOCK_MS = 10 * 60 * 1000; // 10분

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// 타이밍 영향 적은 단순 문자열 비교(고엔트로피 토큰/해시용)
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default async (req) => {
  // strong consistency: 쓰기 직후 읽기 반영 보장(인증·시도제한에 필수).
  // 기본 eventual consistency면 직전 저장한 PIN/토큰을 못 읽어 인증이 깨짐.
  const store = getStore({ name: "profiles", consistency: "strong" });
  const url = new URL(req.url);
  const key = (url.searchParams.get("k") || "").trim();
  if (!key) return json({ error: "no_key" }, 400);

  // 읽기
  if (req.method === "GET") {
    const rec = await store.get(key, { type: "json" });
    if (!rec) return json({ exists: false, hasPin: false, isOwner: false });
    const token = req.headers.get("x-owner-token") || "";
    const isOwner = !!rec.ownerToken && safeEqual(token, rec.ownerToken);
    const hasPin = !!(rec.pinHash || rec.pin); // pin = 레거시 평문
    return json({ exists: true, profile: rec.profile, hasPin, isOwner }); // 민감값은 절대 미반환
  }

  // 저장 / 수정
  if (req.method === "PUT" || req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad_body" }, 400); }
    const incomingPin = (body.pin || "").toString().trim();
    const incomingToken = (body.ownerToken || "").toString().trim();

    const existing = await store.get(key, { type: "json" });
    const now = Date.now();

    // ── 잠금 확인 (PIN 무차별 대입 방지) ──
    const attempts = (existing && existing.attempts) || { count: 0, until: 0 };
    if (attempts.until && now < attempts.until) {
      const retryAfter = Math.ceil((attempts.until - now) / 1000);
      return json({ error: "too_many", retryAfter }, 429);
    }

    const hadLock = !!(existing && (existing.pinHash || existing.pin));

    if (hadLock) {
      // 이미 잠긴 키링 → 주인 토큰 또는 PIN 일치 필요
      const tokenOk = !!existing.ownerToken && incomingToken && safeEqual(incomingToken, existing.ownerToken);
      let pinOk = false;
      if (!tokenOk && incomingPin) {
        if (existing.pinHash) {
          pinOk = safeEqual(await hashPin(incomingPin, existing.pinSalt), existing.pinHash);
        } else if (existing.pin) {
          pinOk = incomingPin === existing.pin; // 레거시 평문
        }
      }
      if (!tokenOk && !pinOk) {
        // 토큰 시도는 카운트하지 않음(주인 토큰 오작동 방지). PIN 시도만 카운트.
        if (incomingPin) {
          const count = (attempts.count || 0) + 1;
          const until = count >= MAX_TRIES ? now + LOCK_MS : 0;
          const next = { ...existing, attempts: { count: until ? 0 : count, until } };
          await store.setJSON(key, next);
          if (until) return json({ error: "too_many", retryAfter: Math.ceil(LOCK_MS / 1000) }, 429);
          return json({ error: "wrong_pin", left: MAX_TRIES - count }, 403);
        }
        return json({ error: "auth_required" }, 401);
      }
    }

    // ── 인증 통과(또는 첫 등록) → 저장 ──
    // 솔트/해시/토큰 결정
    let pinSalt = existing && existing.pinSalt ? existing.pinSalt : null;
    let pinHash = existing && existing.pinHash ? existing.pinHash : null;

    if (!hadLock && incomingPin) {
      // 첫 등록 시 PIN 설정
      pinSalt = randomHex(16);
      pinHash = await hashPin(incomingPin, pinSalt);
    } else if (hadLock && existing.pin && !existing.pinHash) {
      // 레거시 평문 → 해시로 마이그레이션 (인증에 쓴 PIN 사용)
      pinSalt = randomHex(16);
      pinHash = await hashPin(incomingPin, pinSalt);
    }

    const ownerToken = existing && existing.ownerToken ? existing.ownerToken : randomHex(32);

    const rec = {
      profile: body.profile || {},
      pinHash,
      pinSalt,
      ownerToken,
      attempts: { count: 0, until: 0 },
      updated: now,
    };
    await store.setJSON(key, rec);
    return json({ ok: true, ownerToken }); // 주인 토큰만 반환(클라이언트가 기기에 저장)
  }

  return json({ error: "method_not_allowed" }, 405);
};

// /api/profile 로 접근 가능하게
export const config = { path: "/api/profile" };
