const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const db = require('../src/db/azureSql');
const router = require('../src/routes/reviewSummary');
const nativeFetch = global.fetch;
let session, calls, server, url, remoteStatus, embedded;
const summary = { lines: ['One.', 'Two.', 'Three.', 'Four.'], provider: 'azure_llm' };
before(async () => {
  db.query = async (sql) => {
    calls.push({ sql });
    if (sql.includes('SELECT a.status')) return { recordset: [{ status: 'submitted', title: 'Backend', requirements: 'Python' }] };
    return { recordset: [{ state: 'ready', payload_json: JSON.stringify(summary), claimed: false }] };
  };
  global.fetch = async (destination) => {
    calls.push({ destination });
    return new Response(JSON.stringify(remoteStatus === 200 ? { fingerprint: 'a'.repeat(64), summary: embedded } : { detail: 'private upstream data' }), { status: remoteStatus });
  };
  const app=express(); app.use(express.json()); app.use((req,res,next)=>{req.session=session;next();});
  app.use('/api/admin/applications',router);
  app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message}));
  await new Promise(resolve=>{server=app.listen(0,'127.0.0.1',resolve);});
  url=`http://127.0.0.1:${server.address().port}/api/admin/applications/7/summary`;
});
beforeEach(()=>{session={userId:1,role:'admin',clientApp:'hr'};calls=[];remoteStatus=200;embedded=null;});
after(async()=>{global.fetch=nativeFetch;await new Promise(resolve=>server.close(resolve));});
test('only HR and system administrators can read or generate summaries',async()=>{
  for(const state of [{}, {userId:2,role:'user'}]) {
    session=state;
    for(const method of ['GET','POST']) assert.equal((await nativeFetch(url,{method})).status,state.userId?403:401);
  }
  assert.equal(calls.length,0);
  session={userId:1,role:'sysadmin',clientApp:'hr'};
  assert.equal((await nativeFetch(url)).status,200);
});
test('HR role works only with a session from the HR portal',async()=>{
  for(const clientApp of [undefined,'candidate']) {
    session={userId:1,role:'admin',clientApp};
    assert.equal((await nativeFetch(url)).status,403);
  }
  assert.equal(calls.length,0);
});
test('existing result is reused without a model generation request',async()=>{
  const response=await nativeFetch(url,{method:'POST'});
  assert.equal(response.status,200); assert.deepEqual((await response.json()).summary,summary);
  assert.equal(calls.filter(c=>c.destination).length,1);
  assert.match(calls.find(c=>c.destination).destination,/\/context$/);
  assert.match(response.headers.get('cache-control'),/no-store/);
});
test('joint analysis summary needs neither a model call nor a separate summary row',async()=>{
  embedded={...summary,usage_scope:'shared_analysis'};
  for (const method of ['GET','POST']) {
    calls=[];
    const response=await nativeFetch(url,{method});
    assert.equal(response.status,200);
    assert.equal((await response.json()).summary.usage_scope,'shared_analysis');
    assert.equal(calls.filter(c=>c.sql).length,1);
    assert.equal(calls.filter(c=>c.destination).length,1);
    assert.ok(calls.find(c=>c.destination).destination.endsWith('/context'));
  }
});
test('upstream errors are sanitized and no generation follows stale analysis',async()=>{
  remoteStatus=409;
  let response=await nativeFetch(url,{method:'POST'}); assert.equal(response.status,409);
  remoteStatus=500;
  response=await nativeFetch(url); assert.equal(response.status,502);
  assert.doesNotMatch(JSON.stringify(await response.json()),/private upstream data/);
  assert.ok(calls.filter(c=>c.destination).every(c=>c.destination.endsWith('/context')));
});
