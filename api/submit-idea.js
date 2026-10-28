'use strict';
const { randomUUID } = require('node:crypto');
const attempts = new Map();
const directions = {unsure:'Помогите выбрать',site:'Сайт',app:'Приложение / кабинет',system:'Бизнес-задача / интеграции'};
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({error:'Метод не поддерживается.'}); }
  if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return res.status(415).json({error:'Ожидается JSON.'});
  const origin = req.headers.origin;
  const allowed = ['https://po-delu.vercel.app', ...[process.env.VERCEL_URL,process.env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map(h=>'https://'+h)];
  if (origin && !allowed.includes(origin)) return res.status(403).json({error:'Недопустимый источник запроса.'});
  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body); } catch { return res.status(400).json({error:'Неверный формат заявки.'}); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({error:'Неверный формат заявки.'});
  const {problem, contact, name = '', direction = 'unsure', website = ''} = body;
  if (typeof website !== 'string' || website) return res.status(400).json({error:'Не удалось принять заявку.'});
  if (typeof problem !== 'string' || problem.trim().length < 10 || problem.length > 3000 ||
      typeof contact !== 'string' || !contact.trim() || contact.length > 200 ||
      typeof name !== 'string' || name.length > 100 ||
      typeof direction !== 'string' || !Object.hasOwn(directions,direction)) return res.status(400).json({error:'Укажите задачу (10–3000 символов), контакт и направление.'});
  // Best-effort protection per warm instance; not a distributed rate limiter.
  const now = Date.now();
  for (const [key,item] of attempts) if (now - item.start >= 60000) attempts.delete(key);
  const ip = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const entry = attempts.get(ip) || {start:now,count:0};
  if (entry.count >= 3 || (!attempts.has(ip) && attempts.size >= 10000)) { res.setHeader('Retry-After','60'); return res.status(429).json({error:'Слишком много запросов. Подождите минуту.'}); }
  entry.count++; attempts.set(ip,entry);
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chat = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chat) return res.status(503).json({error:'Отправка временно недоступна. Сохраните описание задачи.'});
  const id = randomUUID();
  const text = ['Новая заявка — По делу','ID: '+id,'Направление: '+directions[direction],'Имя: '+(name.trim() || 'Не указано'),'Контакт: '+contact.trim(),'','Задача:',problem.trim()].join('\n');
  try {
    const response = await fetch('https://api.telegram.org/bot'+token+'/sendMessage', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chat_id:chat,text,link_preview_options:{is_disabled:true}}),
      signal:AbortSignal.timeout(10000)
    });
    const data = await response.json();
    if (!response.ok || data.ok !== true) return res.status(502).json({error:'Telegram не принял заявку. Попробуйте позже или сохраните описание.'});
    return res.status(200).json({ok:true,id});
  } catch {
    // Never log exceptions: fetch errors can contain the token-bearing URL.
    return res.status(504).json({error:'Не удалось подтвердить доставку. Заявка могла прийти; повторная отправка может создать дубль.'});
  }
};
