// Opt-in integration against the local Docker SQL database only.
// ROLE_INTEGRATION=1 node --test tests/system-roles.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

test('system role boundaries, live sessions, optimistic conflicts and audit', { skip: process.env.ROLE_INTEGRATION !== '1' }, async () => {
  const db = require('../src/db/azureSql');
  const config = require('../src/config/env');
  assert.equal(config.azureSql.server, 'mssql', 'Only run against local Docker SQL');
  const base = 'http://127.0.0.1:3001/api';
  let id;
  async function call(path, cookie, body, method = body ? 'POST' : 'GET') {
    const response = await fetch(base + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json().catch(() => null), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  try {
    assert.equal((await call('/system/users')).status, 401);
    const login = await call('/auth/login', null, { email: 'hr@firma.sk', password: 'Admin1234' });
    assert.equal(login.status, 200); assert.equal(login.data.user.role, 'sysadmin');
    const root = login.cookie, actor = login.data.user.id;
    const email = `role-integration-${randomUUID()}@example.invalid`;
    const registration = await call('/auth/register', null, { email, password: randomUUID(), fullName: 'Role Integration Test', role: 'sysadmin' });
    assert.equal(registration.status, 201);
    id = registration.data.user.id;
    assert.equal(registration.data.user.role, 'user', 'Registration must ignore a supplied privileged role');
    const candidate = registration.cookie;
    assert.equal((await call('/system/users', candidate)).status, 403);
    assert.equal((await call('/admin/jobs', candidate)).status, 403);
    assert.equal((await call(`/system/users/${id}/role`, candidate, { role: 'sysadmin', previousRole: 'user' }, 'PATCH')).status, 403);
    assert.equal((await call(`/system/users/${actor}/role`, root, { role: 'user', previousRole: 'sysadmin' }, 'PATCH')).status, 409);
    assert.equal((await call(`/system/users/${id}/role`, root, { role: 'owner', previousRole: 'user' }, 'PATCH')).status, 400);
    async function change(role, previousRole) {
      return call(`/system/users/${id}/role`, root, { role, previousRole }, 'PATCH');
    }
    assert.equal((await change('admin', 'user')).status, 200);
    assert.equal((await call('/admin/jobs', candidate)).status, 200, 'Promotion works in an already active session');
    assert.equal((await call('/system/users', candidate)).status, 403, 'HR cannot manage accounts');
    assert.equal((await change('sysadmin', 'user')).status, 409, 'A stale form must not overwrite a newer role');
    assert.equal((await change('sysadmin', 'admin')).status, 200);
    assert.equal((await call('/system/users', candidate)).status, 200);
    assert.equal((await change('user', 'sysadmin')).status, 200);
    assert.equal((await call('/system/users', candidate)).status, 403, 'Revocation applies to the existing session immediately');
    assert.equal((await call('/admin/jobs', candidate)).status, 403);
    const history = await db.query('SELECT previous_role,new_role,changed_by FROM dbo.user_role_history WHERE user_id=@id ORDER BY id', { id });
    assert.deepEqual(history.recordset.map((h) => [h.previous_role,h.new_role,h.changed_by]), [['user','admin',actor],['admin','sysadmin',actor],['sysadmin','user',actor]]);
    const list = await call('/system/users', root);
    assert.equal(list.status, 200);
    assert.ok(list.data.users.every((u) => !('password_hash' in u)));
  } finally {
    if (id) {
      await db.query(`DELETE FROM dbo.user_role_history WHERE user_id=@id;
        DELETE FROM dbo.users WHERE id=@id AND email LIKE N'role-integration-%@example.invalid'`, { id });
    }
    await db.closePool();
  }
});
