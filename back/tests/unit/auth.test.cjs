jest.mock('../../src/config/env', () => ({
  env: { jwtSecret: 'unit-test-secret-with-at-least-32-characters', jwtExpiresIn: '1h' },
}));
jest.mock('bcrypt', () => ({
  hashSync: jest.fn(() => 'dummy-hash'), hash: jest.fn(), compare: jest.fn(),
}));
jest.mock('jsonwebtoken', () => ({ sign: jest.fn(), verify: jest.fn() }));
jest.mock('../../src/models/User', () => ({
  ...jest.requireActual('../../src/models/User'),
  User: { create: jest.fn(), findOne: jest.fn(), findById: jest.fn() },
}));

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User, publicUser } = require('../../src/models/User');
const { register, login, me } = require('../../src/modules/auth/auth.controller');
const { requireAuth } = require('../../src/middlewares/auth');
const user = {
  _id: '507f1f77bcf86cd799439011', name: 'Test', email: 'test@example.com',
  password: 'hashed-password', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
};
function response() {
  return { locals: {}, status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

describe('registro', () => {
  test.each([
    undefined, {}, { name: '', email: user.email, password: 'password123' },
    { name: 'Test', email: 'invalid', password: 'password123' },
    { name: 'Test', email: user.email, password: 'short' },
    { name: 'Test', email: user.email, password: '🙂'.repeat(19) },
  ])('rechaza entradas inválidas sin persistir: %j', async body => {
    const res = response();
    await register({ body }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(User.create).not.toHaveBeenCalled();
  });
  test('normaliza los datos, hashea la contraseña y omite el hash en la respuesta', async () => {
    bcrypt.hash.mockResolvedValue('hashed-password');
    User.create.mockResolvedValue(user);
    const res = response();
    await register({ body: { name: ' Test ', email: ' TEST@example.com ', password: 'password123' } }, res, jest.fn());
    expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
    expect(User.create).toHaveBeenCalledWith({ name: 'Test', email: user.email, password: 'hashed-password' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ user: publicUser(user) });
    expect(res.json.mock.calls[0][0].user).not.toHaveProperty('password');
  });
  test('devuelve conflicto si el email está duplicado', async () => {
    User.create.mockRejectedValue({ code: 11000 });
    const res = response();
    await register({ body: { name: 'Test', email: user.email, password: 'password123' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
  });
  test('propaga errores de persistencia', async () => {
    const error = new Error('database unavailable');
    User.create.mockRejectedValue(error);
    const next = jest.fn();
    await register({ body: { name: 'Test', email: user.email, password: 'password123' } }, response(), next);
    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('login y usuario actual', () => {
  test('rechaza credenciales con formato inválido sin consultar la base', async () => {
    const res = response();
    await login({ body: { email: 'invalid', password: 'password123' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(User.findOne).not.toHaveBeenCalled();
  });
  test.each([null, user])('no distingue usuario inexistente de contraseña incorrecta: %j', async found => {
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(found) });
    bcrypt.compare.mockResolvedValue(false);
    const res = response();
    await login({ body: { email: user.email, password: 'wrong-password' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Email o contraseña incorrectos.' });
    expect(jwt.sign).not.toHaveBeenCalled();
  });
  test('genera un JWT con expiración y devuelve datos públicos', async () => {
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue('signed-token');
    const res = response();
    await login({ body: { email: ' TEST@example.com ', password: 'password123' } }, res, jest.fn());
    expect(User.findOne).toHaveBeenCalledWith({ email: user.email });
    expect(jwt.sign).toHaveBeenCalledWith({}, expect.any(String), {
      subject: user._id, algorithm: 'HS256', expiresIn: '1h',
    });
    expect(res.json).toHaveBeenCalledWith({ token: 'signed-token', user: publicUser(user) });
  });
  test('propaga errores de consulta durante el login', async () => {
    const error = new Error('query failed');
    User.findOne.mockReturnValue({ select: jest.fn().mockRejectedValue(error) });
    const next = jest.fn();
    await login({ body: { email: user.email, password: 'password123' } }, response(), next);
    expect(next).toHaveBeenCalledWith(error);
  });
  test.each([null, user])('resuelve el usuario actual: %j', async found => {
    User.findById.mockResolvedValue(found);
    const res = response();
    res.locals.userId = user._id;
    await me({}, res, jest.fn());
    expect(User.findById).toHaveBeenCalledWith(user._id);
    if (found) expect(res.json).toHaveBeenCalledWith({ user: publicUser(user) });
    else expect(res.status).toHaveBeenCalledWith(401);
  });
  test('propaga errores de consulta del usuario actual', async () => {
    const error = new Error('query failed');
    User.findById.mockRejectedValue(error);
    const next = jest.fn();
    await me({}, response(), next);
    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('middleware JWT', () => {
  test.each([undefined, 'Basic value', 'Bearer', 'Bearer a b'])('rechaza una cabecera inválida: %j', authorization => {
    const res = response();
    const next = jest.fn();
    requireAuth({ headers: { authorization } }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(jwt.verify).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
  test.each(['text', {}, { sub: 42 }, { sub: 'invalid-id' }])('rechaza claims inválidos: %j', payload => {
    jwt.verify.mockReturnValue(payload);
    const res = response();
    const next = jest.fn();
    requireAuth({ headers: { authorization: 'Bearer token' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
  test('rechaza tokens expirados o con firma inválida', () => {
    jwt.verify.mockImplementation(() => { throw new Error('expired'); });
    const res = response();
    const next = jest.fn();
    requireAuth({ headers: { authorization: 'Bearer token' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
  test('autoriza un token válido y restringe el algoritmo', () => {
    jwt.verify.mockReturnValue({ sub: user._id });
    const res = response();
    const next = jest.fn();
    requireAuth({ headers: { authorization: 'Bearer token' } }, res, next);
    expect(jwt.verify).toHaveBeenCalledWith('token', expect.any(String), { algorithms: ['HS256'] });
    expect(res.locals.userId).toBe(user._id);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
