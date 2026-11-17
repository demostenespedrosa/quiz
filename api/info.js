'use strict';

const store = require('../lib/redis-store');
const { QUESTIONS } = require('../public/js/questions');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 200;
  res.end(
    JSON.stringify({
      mode: 'vercel',
      hasRedis: store.hasExternalStore(),
      ips: [],
      port: null,
      totalQuestions: QUESTIONS.length
    })
  );
};
