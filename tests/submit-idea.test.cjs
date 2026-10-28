const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
test('Telegram submission validates input and confirms upstream delivery', async () => {
  const handler = require('../api/submit-idea.js');
  const original = global.fetch;
  process.env.TELEGRAM_BOT_TOKEN='test-token'; process.env.TELEGRAM_CHAT_ID='123';
  let count=0, sent;
  const run = async (body,extra={}) => {
    const req={method:'POST',headers:{'content-type':'application/json','x-forwarded-for':String(++count)},body,...extra};
    const res={headers:{},setHeader(k,v){this.headers[k]=v},status(code){this.code=code;return this},json(data){this.data=data;return this}};
    await handler(req,res);return res;
  };
  const valid={problem:'Нужно автоматизировать отчёты',contact:'@example',direction:'system',name:'Тест <b>'};
  try {
    global.fetch=async (url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({ok:true})}};
    assert.equal((await run(valid)).code,200);
    assert.match(sent.text,/Тест <b>/); assert.equal(sent.parse_mode,undefined);
    assert.equal((await run({...valid,contact:''})).code,400);
    assert.equal((await run({...valid,problem:'x'.repeat(3001)})).code,400);
    assert.equal((await run({...valid,direction:'toString'})).code,400);
    assert.equal((await run({...valid,website:'spam'})).code,400);
    assert.equal((await run(valid,{method:'GET'})).code,405);
    assert.equal((await run(valid,{headers:{'content-type':'application/json',origin:'https://evil.example'}})).code,403);
    global.fetch=async()=>({ok:false,json:async()=>({ok:false})});
    assert.equal((await run(valid)).code,502);
    global.fetch=async()=>{throw new Error('private token')};
    const failed=await run(valid);assert.equal(failed.code,504);assert.ok(!JSON.stringify(failed.data).includes('private token'));
    delete process.env.TELEGRAM_BOT_TOKEN;assert.equal((await run(valid)).code,503);
    process.env.TELEGRAM_BOT_TOKEN='test-token';global.fetch=async()=>({ok:true,json:async()=>({ok:true})});
    const extra={headers:{'content-type':'application/json','x-forwarded-for':'same-ip'}};
    for(let i=0;i<3;i++)assert.equal((await run(valid,extra)).code,200);
    assert.equal((await run(valid,extra)).code,429);
    const html=fs.readFileSync('index.html','utf8');new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
  } finally {global.fetch=original;delete process.env.TELEGRAM_BOT_TOKEN;delete process.env.TELEGRAM_CHAT_ID;}
});

