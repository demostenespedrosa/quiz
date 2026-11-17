'use strict';

const engine = require('../lib/serverless-engine');

function readBody(req) {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  try {
    const urlObj = new URL(req.url, 'http://localhost');

    if (req.method === 'GET') {
      const role = urlObj.searchParams.get('role');
      const pin = urlObj.searchParams.get('pin') || '';
      if (role === 'host') {
        const hostToken = urlObj.searchParams.get('hostToken') || '';
        const data = await engine.getHostState(pin, hostToken);
        return sendJson(res, data.error ? 404 : 200, data);
      }
      if (role === 'player') {
        const playerId = urlObj.searchParams.get('playerId') || '';
        const data = await engine.getPlayerState(pin, playerId);
        return sendJson(res, data.error ? 404 : 200, data);
      }
      return sendJson(res, 400, { error: 'Parâmetro role inválido.' });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const action = body.action;

      if (action === 'host:create') {
        return sendJson(res, 200, await engine.createOrResumeHost(body));
      }
      if (action === 'host:start') {
        return sendJson(res, 200, await engine.startMatch(body));
      }
      if (action === 'host:reveal') {
        const meta = await engine.performRevealIfNeeded(String(body.pin || '').trim(), true);
        return sendJson(res, 200, { ok: true, phase: meta ? meta.phase : null });
      }
      if (action === 'host:next') {
        return sendJson(res, 200, await engine.nextRound(body));
      }
      if (action === 'host:pause') {
        return sendJson(res, 200, await engine.togglePause(body));
      }
      if (action === 'host:restart') {
        return sendJson(res, 200, await engine.restartLobby(body));
      }
      if (action === 'player:join') {
        const out = await engine.joinPlayer(body);
        return sendJson(res, out.error ? 400 : 200, out);
      }
      if (action === 'player:answer') {
        const out = await engine.submitAnswer(body);
        return sendJson(res, out.error ? 400 : 200, out);
      }
      if (action === 'player:lifeline') {
        const out = await engine.useLifeline(body);
        return sendJson(res, out.error ? 400 : 200, out);
      }

      return sendJson(res, 400, { error: 'Ação desconhecida.' });
    }

    return sendJson(res, 405, { error: 'Método não permitido.' });
  } catch (err) {
    return sendJson(res, 500, { error: err.message || 'Erro interno no servidor.' });
  }
};
