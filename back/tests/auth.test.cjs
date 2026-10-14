const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { app } = require('../dist/app');
const { env } = require('../dist/config/env');
const { connectDatabase, disconnectDatabase } = require('../dist/config/database');
const { User } = require('../dist/models/User');

test('auth HTTP real con MongoDB: registro, login, JWT y validación', async () => {
  await connectDatabase();
  await User.init();
  const email = `auth-test-${require('node:crypto').randomUUID()}@example.com`;
  const password = 'IntegrationTest2026!';
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, body, token) => {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    assert.equal((await request('/auth/register', { name: '', email: 'bad', password: 'short' })).status, 400);
    assert.equal((await request('/auth/register', { name: 'Test', email, password: '🙂'.repeat(19) })).status, 400);
    const registered = await request('/auth/register', { name: ' Test ', email: ` ${email.toUpperCase()} `, password });
    assert.equal(registered.status, 201);
    assert.equal(registered.data.user.email, email);
    assert.equal(registered.data.user.name, 'Test');
    assert.equal('password' in registered.data.user, false);
    const stored = await User.findOne({ email }).select('+password');
    assert.equal(await bcrypt.compare(password, stored.password), true);
    assert.ok(bcrypt.getRounds(stored.password) >= 10);
    assert.equal((await request('/auth/register', { name: 'Test', email, password })).status, 409);
    const wrong = await request('/auth/login', { email, password: 'WrongPassword2026!' });
    const unknown = await request('/auth/login', { email: `unknown-${email}`, password });
    assert.equal(wrong.status, 401);
    assert.deepEqual(unknown, wrong);
    const loggedIn = await request('/auth/login', { email: ` ${email.toUpperCase()} `, password });
    assert.equal(loggedIn.status, 200);
    assert.equal('password' in loggedIn.data.user, false);
    const claims = jwt.verify(loggedIn.data.token, env.jwtSecret, { algorithms: ['HS256'] });
    assert.ok(claims.exp > claims.iat);
    assert.equal((await request('/auth/me')).status, 401);
    assert.equal((await request('/auth/me', undefined, 'invalid')).status, 401);
    const expired = jwt.sign({}, env.jwtSecret, { subject: String(stored._id), expiresIn: -1 });
    assert.equal((await request('/auth/me', undefined, expired)).status, 401);
    const me = await request('/auth/me', undefined, loggedIn.data.token);
    assert.equal(me.status, 200);
    assert.deepEqual(me.data.user, registered.data.user);
    const demo = await request('/auth/login', { email: 'demo@example.com', password: 'DemoLogin2026!' });
    assert.equal(demo.status, 200);
    assert.equal((await request('/auth/me', undefined, demo.data.token)).data.user.email, 'demo@example.com');
    const cors = await fetch(base + '/auth/login', { method: 'OPTIONS', headers: { Origin: env.frontendOrigin, 'Access-Control-Request-Method': 'POST' } });
    assert.equal(cors.status, 204);
    assert.equal(cors.headers.get('access-control-allow-origin'), env.frontendOrigin);
  } finally {
    await User.deleteOne({ email });
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await disconnectDatabase();
  }
});
