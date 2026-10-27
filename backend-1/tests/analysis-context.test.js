const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const db = require('../src/db/azureSql');
const router = require('../src/routes/internal');
let session, rows, calls, server, url;
before(async()=>{
  db.query=async(sql,params)=>{calls.push({sql,params});return {recordset:rows};};
  const app=express();app.use((req,res,next)=>{req.session=session;next();});app.use('/api/internal',router);
  app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
  await new Promise(resolve=>{server=app.listen(0,'127.0.0.1',resolve)});url=`http://127.0.0.1:${server.address().port}/api/internal/applications/7/analysis-context`;
});
after(()=>new Promise(resolve=>server.close(resolve)));
test('internal key and session required before reading requirements',async()=>{
  session={};calls=[];rows=[];
  assert.equal((await fetch(url)).status,403);
  assert.equal((await fetch(url,{headers:{'X-Internal-Key':process.env.INTERNAL_API_KEY}})).status,401);
  assert.equal(calls.length,0);
});
test('owner or HR can read server requirements; other users cannot',async()=>{
  calls=[];rows=[{user_id:12,job_id:3,requirements:'[{"skill":"Python","weight":5}]',title:'Backend'}];
  session={userId:12,role:'user'};const headers={'X-Internal-Key':process.env.INTERNAL_API_KEY};
  let response=await fetch(url,{headers});assert.equal(response.status,200);
  assert.equal((await response.json()).requirements,rows[0].requirements);
  assert.equal(calls[0].params.id,7);assert.match(response.headers.get('cache-control'),/no-store/);
  session={userId:13,role:'user'};assert.equal((await fetch(url,{headers})).status,403);
  session={userId:13,role:'admin'};assert.equal((await fetch(url,{headers})).status,200);
  rows=[];assert.equal((await fetch(url,{headers})).status,404);
});
