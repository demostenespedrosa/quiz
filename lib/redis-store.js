'use strict';

/**
 * Camada de armazenamento compatível com:
 *  1) Upstash Redis / Vercel KV (via REST API nativa com fetch — zero dependências npm)
 *  2) Fallback em memória local (para testes locais ou instância única)
 */
const TTL_SECONDS = 6 * 60 * 60; // 6 horas por sala

function getRedisCreds() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
  if (url && token) {
    return { url: url.replace(/\/$/, ''), token };
  }
  return null;
}

function hasExternalStore() {
  return getRedisCreds() !== null;
}

async function redisCmd(commandArgs) {
  const creds = getRedisCreds();
  const res = await fetch(creds.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commandArgs)
  });
  if (!res.ok) {
    throw new Error(`Redis REST HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

async function redisPipeline(commands) {
  const creds = getRedisCreds();
  const res = await fetch(`${creds.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });
  if (!res.ok) {
    throw new Error(`Redis pipeline HTTP ${res.status}`);
  }
  const results = await res.json();
  return results.map((r) => {
    if (r.error) throw new Error(r.error);
    return r.result;
  });
}

// Memória local (quando não há Redis configurado)
if (!globalThis.__LINUX_ARENA_MEM__) {
  globalThis.__LINUX_ARENA_MEM__ = {
    kv: new Map(),
    hashes: new Map(),
    expires: new Map()
  };
}

function purgeIfExpired(key) {
  const mem = globalThis.__LINUX_ARENA_MEM__;
  const exp = mem.expires.get(key);
  if (exp && Date.now() > exp) {
    mem.kv.delete(key);
    mem.hashes.delete(key);
    mem.expires.delete(key);
    return true;
  }
  return false;
}

function setMemExpiry(key, ttlSec) {
  globalThis.__LINUX_ARENA_MEM__.expires.set(key, Date.now() + ttlSec * 1000);
}

async function getJson(key) {
  if (hasExternalStore()) {
    const raw = await redisCmd(['GET', key]);
    return raw ? JSON.parse(raw) : null;
  }
  purgeIfExpired(key);
  const raw = globalThis.__LINUX_ARENA_MEM__.kv.get(key);
  return raw ? JSON.parse(raw) : null;
}

async function setJson(key, obj, ttlSec = TTL_SECONDS) {
  const raw = JSON.stringify(obj);
  if (hasExternalStore()) {
    await redisCmd(['SET', key, raw, 'EX', String(ttlSec)]);
    return;
  }
  globalThis.__LINUX_ARENA_MEM__.kv.set(key, raw);
  setMemExpiry(key, ttlSec);
}

async function setJsonNx(key, obj, ttlSec = TTL_SECONDS) {
  const raw = JSON.stringify(obj);
  if (hasExternalStore()) {
    const res = await redisCmd(['SET', key, raw, 'EX', String(ttlSec), 'NX']);
    return res === 'OK';
  }
  purgeIfExpired(key);
  if (globalThis.__LINUX_ARENA_MEM__.kv.has(key)) return false;
  globalThis.__LINUX_ARENA_MEM__.kv.set(key, raw);
  setMemExpiry(key, ttlSec);
  return true;
}

async function hgetJson(hashKey, field) {
  if (hasExternalStore()) {
    const raw = await redisCmd(['HGET', hashKey, field]);
    return raw ? JSON.parse(raw) : null;
  }
  purgeIfExpired(hashKey);
  const h = globalThis.__LINUX_ARENA_MEM__.hashes.get(hashKey);
  if (!h) return null;
  const raw = h.get(field);
  return raw ? JSON.parse(raw) : null;
}

async function hsetJson(hashKey, field, obj, ttlSec = TTL_SECONDS) {
  const raw = JSON.stringify(obj);
  if (hasExternalStore()) {
    await redisPipeline([
      ['HSET', hashKey, field, raw],
      ['EXPIRE', hashKey, String(ttlSec)]
    ]);
    return;
  }
  purgeIfExpired(hashKey);
  let h = globalThis.__LINUX_ARENA_MEM__.hashes.get(hashKey);
  if (!h) {
    h = new Map();
    globalThis.__LINUX_ARENA_MEM__.hashes.set(hashKey, h);
  }
  h.set(field, raw);
  setMemExpiry(hashKey, ttlSec);
}

async function hsetnxJson(hashKey, field, obj, ttlSec = TTL_SECONDS) {
  const raw = JSON.stringify(obj);
  if (hasExternalStore()) {
    const [added] = await redisPipeline([
      ['HSETNX', hashKey, field, raw],
      ['EXPIRE', hashKey, String(ttlSec)]
    ]);
    return added === 1;
  }
  purgeIfExpired(hashKey);
  let h = globalThis.__LINUX_ARENA_MEM__.hashes.get(hashKey);
  if (!h) {
    h = new Map();
    globalThis.__LINUX_ARENA_MEM__.hashes.set(hashKey, h);
  }
  if (h.has(field)) return false;
  h.set(field, raw);
  setMemExpiry(hashKey, ttlSec);
  return true;
}

async function hgetallJson(hashKey) {
  if (hasExternalStore()) {
    const flat = await redisCmd(['HGETALL', hashKey]);
    const out = {};
    if (Array.isArray(flat)) {
      for (let i = 0; i < flat.length; i += 2) {
        try {
          out[flat[i]] = JSON.parse(flat[i + 1]);
        } catch (_) {}
      }
    } else if (flat && typeof flat === 'object') {
      for (const [k, v] of Object.entries(flat)) {
        try {
          out[k] = typeof v === 'string' ? JSON.parse(v) : v;
        } catch (_) {}
      }
    }
    return out;
  }
  purgeIfExpired(hashKey);
  const h = globalThis.__LINUX_ARENA_MEM__.hashes.get(hashKey);
  const out = {};
  if (!h) return out;
  for (const [k, v] of h.entries()) {
    out[k] = JSON.parse(v);
  }
  return out;
}

async function delKeys(keys) {
  if (!keys || keys.length === 0) return;
  if (hasExternalStore()) {
    await redisCmd(['DEL', ...keys]);
    return;
  }
  for (const k of keys) {
    globalThis.__LINUX_ARENA_MEM__.kv.delete(k);
    globalThis.__LINUX_ARENA_MEM__.hashes.delete(k);
    globalThis.__LINUX_ARENA_MEM__.expires.delete(k);
  }
}

module.exports = {
  hasExternalStore,
  getJson,
  setJson,
  setJsonNx,
  hgetJson,
  hsetJson,
  hsetnxJson,
  hgetallJson,
  delKeys
};
