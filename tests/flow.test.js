/**
 * Full flow test: Admin ↔ User connection and interaction.
 *
 * Covers:
 * - REST: admin login, create user, user login, GET /me, GET /users
 * - Socket: admin register-monitor, user register-kiosk, kiosk-online to admin
 * - Session: start-monitoring, stop-monitoring
 * - Call: call-request, call-accept, call-reject, call-end
 * - Video: toggle-video (admin ↔ user) – multiple scenarios
 * - Audio: toggle-audio (admin ↔ user) – multiple scenarios
 * - WebRTC signaling: offer, answer, ice-candidate (camera + screen stream path)
 * - Combined: call + video + audio + toggles + end
 * - Error cases: invalid auth, wrong role, session guards
 *
 * Run: npm test (server must be running on BASE_URL)
 */

import test from 'node:test';
import assert from 'node:assert';
import { io } from 'socket.io-client';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const WS_URL = BASE_URL.replace(/^http/, 'ws');

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function once(socket, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timeout waiting for event: ${event}`));
    }, timeoutMs);
    const handler = (data) => {
      clearTimeout(t);
      socket.off(event, handler);
      resolve(data);
    };
    socket.once(event, handler);
  });
}

/** Create admin + user sockets with active monitoring and call (for media tests). */
async function setupSessionWithActiveCall() {
  const adminLogin = await login('admin', 'admin123');
  const u = `u_${Date.now()}`;
  await createUser(adminLogin.accessToken, u, 'Media User', 'p');
  const userLogin = await login(u, 'p');

  const adminSocket = await connectSocket(adminLogin.accessToken);
  const userSocket = await connectSocket(userLogin.accessToken);
  adminSocket.emit('register-monitor');
  await once(adminSocket, 'monitor-registered');
  const kioskOnlineP = once(adminSocket, 'kiosk-online', 5000);
  userSocket.emit('register-kiosk');
  await once(userSocket, 'kiosk-registered');
  await kioskOnlineP;

  adminSocket.emit('start-monitoring', { kioskId: u });
  await once(adminSocket, 'monitoring-started', 10000);
  adminSocket.emit('call-request', { kioskId: u });
  await once(userSocket, 'call-request', 10000);
  const acceptedP = once(adminSocket, 'call-accepted', 12000);
  const confirmedP = once(userSocket, 'call-accept-confirmed', 12000);
  userSocket.emit('call-accept', { kioskId: u });
  await acceptedP;
  await confirmedP;

  return { adminSocket, userSocket, kioskId: u, disconnect: async () => {
    userSocket.disconnect();
    adminSocket.disconnect();
    await delay(200);
  } };
}

async function rest(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, data };
}

async function login(userId, password) {
  const { status, data } = await rest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, password }),
  });
  assert.strictEqual(status, 200, `Login failed: ${JSON.stringify(data)}`);
  assert.ok(data?.accessToken, 'Missing accessToken');
  return data;
}

async function createUser(adminToken, user_id, name, password) {
  const { status, data } = await rest('/api/users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ user_id, name, password }),
  });
  assert.strictEqual(status, 201, `Create user failed: ${JSON.stringify(data)}`);
  return data.user;
}

async function getMe(token) {
  const { status, data } = await rest('/api/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(status, 200);
  return data.user;
}

async function getUsers(adminToken) {
  const { status, data } = await rest('/api/users', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.strictEqual(status, 200);
  return data.users;
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket'],
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => reject(err));
  });
}

// --- Full flow: Admin and User connect and interact (single sequential test) ---

test('Full flow: Admin ↔ User connect and interact', async () => {
  const testUserId = `user_${Date.now()}`;
  const testPassword = 'pass123';

  // 1. REST: Admin login
  const adminLogin = await login('admin', 'admin123');
  assert.strictEqual(adminLogin.role, 'ADMIN');

  // 2. Admin creates user, user logs in
  await createUser(adminLogin.accessToken, testUserId, 'Test User', testPassword);
  const userLogin = await login(testUserId, testPassword);
  assert.strictEqual(userLogin.role, 'USER');

  // 3. REST: GET /me and GET /users
  const meAdmin = await getMe(adminLogin.accessToken);
  assert.strictEqual(meAdmin.role, 'ADMIN');
  const users = await getUsers(adminLogin.accessToken);
  assert.ok(Array.isArray(users) && users.some((u) => u.user_id === testUserId));
  const meUser = await getMe(userLogin.accessToken);
  assert.strictEqual(meUser.role, 'USER');

  // 4. Socket: Admin connects and registers as monitor
  const adminSocket = await connectSocket(adminLogin.accessToken);
  adminSocket.emit('register-monitor');
  const monitorReg = await once(adminSocket, 'monitor-registered');
  assert.ok(monitorReg.monitorId);
  assert.ok(Array.isArray(monitorReg.onlineKiosks));

  // 5. Socket: User connects; admin listens for kiosk-online before user registers
  const userSocket = await connectSocket(userLogin.accessToken);
  const kioskOnlinePromise = once(adminSocket, 'kiosk-online', 5000);
  userSocket.emit('register-kiosk');
  const kioskReg = await once(userSocket, 'kiosk-registered');
  assert.strictEqual(kioskReg.kioskId, testUserId);
  const kioskOnline = await kioskOnlinePromise;
  assert.strictEqual(kioskOnline.kioskId, testUserId);

  // 7. Admin starts monitoring
  adminSocket.emit('start-monitoring', { kioskId: testUserId });
  const monitoringStarted = await once(adminSocket, 'monitoring-started');
  assert.strictEqual(monitoringStarted.kioskId, testUserId);

  // 8. Admin initiates call – user receives call-request
  const userCallReq = once(userSocket, 'call-request');
  adminSocket.emit('call-request', { kioskId: testUserId });
  const toUser = await userCallReq;
  assert.strictEqual(toUser.kioskId, testUserId);
  await once(adminSocket, 'call-request-sent');

  // 9. User accepts call
  const adminCallAccepted = once(adminSocket, 'call-accepted');
  const userCallConfirmed = once(userSocket, 'call-accept-confirmed');
  userSocket.emit('call-accept', { kioskId: testUserId });
  await adminCallAccepted;
  await userCallConfirmed;

  // 10. Admin toggles video – user receives video-toggled
  const userVideoToggled = once(userSocket, 'video-toggled');
  adminSocket.emit('toggle-video', { kioskId: testUserId, enabled: true });
  const videoPayload = await userVideoToggled;
  assert.strictEqual(videoPayload.enabled, true);
  await once(adminSocket, 'video-toggle-confirmed');

  // 11. User toggles audio – admin receives audio-toggled
  const adminAudioToggled = once(adminSocket, 'audio-toggled');
  userSocket.emit('toggle-audio', { kioskId: testUserId, enabled: true });
  const audioPayload = await adminAudioToggled;
  assert.strictEqual(audioPayload.enabled, true);
  await once(userSocket, 'audio-toggle-confirmed');

  // 12. User ends call
  const adminCallEnded = once(adminSocket, 'call-ended');
  const userCallEndConfirmed = once(userSocket, 'call-end-confirmed');
  userSocket.emit('call-end', { kioskId: testUserId });
  await adminCallEnded;
  await userCallEndConfirmed;

  // 13. Second call: admin requests, user accepts, admin ends
  adminSocket.emit('call-request', { kioskId: testUserId });
  await once(userSocket, 'call-request');
  userSocket.emit('call-accept', { kioskId: testUserId });
  await once(adminSocket, 'call-accepted');
  adminSocket.emit('call-end', { kioskId: testUserId });
  await once(userSocket, 'call-ended');

  // 14. Admin stops monitoring
  adminSocket.emit('stop-monitoring', { kioskId: testUserId });
  await once(adminSocket, 'monitoring-stopped');

  // 15. Disconnect
  userSocket.disconnect();
  await delay(200);
  adminSocket.disconnect();
  await delay(200);
  assert.strictEqual(adminSocket.connected, false);
  assert.strictEqual(userSocket.connected, false);
});

// --- Standalone REST tests ---

test('REST: Admin login returns ADMIN role and token', async () => {
  const data = await login('admin', 'admin123');
  assert.strictEqual(data.role, 'ADMIN');
  assert.ok(data.accessToken);
  assert.strictEqual(data.user?.user_id, 'admin');
});

test('REST: Unauthorized GET /api/users returns 401', async () => {
  const { status } = await rest('/api/users', { headers: {} });
  assert.strictEqual(status, 401);
});

test('REST: Login wrong password returns 401', async () => {
  const { status, data } = await rest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ user_id: 'admin', password: 'wrong' }),
  });
  assert.strictEqual(status, 401);
  assert.ok(!data?.accessToken);
});

test('REST: Login missing user_id returns 400', async () => {
  const { status } = await rest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password: 'admin123' }),
  });
  assert.strictEqual(status, 400);
});

// --- Socket error / guard cases ---

test('Socket: User (KIOSK) cannot start-monitoring – receives error', async () => {
  const adminLogin = await login('admin', 'admin123');
  const u = `u_${Date.now()}`;
  await createUser(adminLogin.accessToken, u, 'Guard User', 'p');
  const userLogin = await login(u, 'p');

  const socket = await connectSocket(userLogin.accessToken);
  socket.emit('register-kiosk');
  await once(socket, 'kiosk-registered');

  const errPromise = once(socket, 'error', 4000);
  socket.emit('start-monitoring', { kioskId: u });
  const err = await errPromise;
  assert.ok(err?.code);
  assert.ok(
    String(err?.message || '').toLowerCase().includes('unauthorized') ||
    String(err?.message || '').toLowerCase().includes('monitor')
  );

  socket.disconnect();
});

test('Socket: Call reject flow – monitor requests, kiosk rejects', async () => {
  const adminLogin = await login('admin', 'admin123');
  const u = `u_${Date.now()}`;
  await createUser(adminLogin.accessToken, u, 'Reject User', 'p');
  const userLogin = await login(u, 'p');

  const adminSocket = await connectSocket(adminLogin.accessToken);
  const userSocket = await connectSocket(userLogin.accessToken);
  adminSocket.emit('register-monitor');
  await once(adminSocket, 'monitor-registered');
  userSocket.emit('register-kiosk');
  await once(userSocket, 'kiosk-registered');
  adminSocket.emit('start-monitoring', { kioskId: u });
  await once(adminSocket, 'monitoring-started');

  adminSocket.emit('call-request', { kioskId: u });
  await once(userSocket, 'call-request');
  const adminRejected = once(adminSocket, 'call-rejected');
  const userConfirmed = once(userSocket, 'call-reject-confirmed');
  userSocket.emit('call-reject', { kioskId: u });
  await adminRejected;
  await userConfirmed;

  adminSocket.disconnect();
  userSocket.disconnect();
});

// ========== VIDEO SCENARIOS ==========

test('Video: Admin enables video → user receives video-toggled(true)', async () => {
  const { adminSocket, userSocket, kioskId, disconnect } = await setupSessionWithActiveCall();
  const userGot = once(userSocket, 'video-toggled');
  const adminGot = once(adminSocket, 'video-toggle-confirmed');
  adminSocket.emit('toggle-video', { kioskId, enabled: true });
  const payload = await userGot;
  assert.strictEqual(payload.enabled, true);
  assert.strictEqual(payload.kioskId, kioskId);
  await adminGot;
  await disconnect();
});

test('Video: Admin disables video → user receives video-toggled(false)', async () => {
  const { adminSocket, userSocket, kioskId, disconnect } = await setupSessionWithActiveCall();
  adminSocket.emit('toggle-video', { kioskId, enabled: true });
  await once(userSocket, 'video-toggled');
  await once(adminSocket, 'video-toggle-confirmed');
  const userGot = once(userSocket, 'video-toggled');
  adminSocket.emit('toggle-video', { kioskId, enabled: false });
  const payload = await userGot;
  assert.strictEqual(payload.enabled, false);
  await disconnect();
});

test('Video: User enables video → admin receives video-toggled(true)', async () => {
  const { adminSocket, userSocket, kioskId, disconnect } = await setupSessionWithActiveCall();
  const adminGot = once(adminSocket, 'video-toggled');
  const userGot = once(userSocket, 'video-toggle-confirmed');
  userSocket.emit('toggle-video', { kioskId, enabled: true });
  const payload = await adminGot;
  assert.strictEqual(payload.enabled, true);
  assert.strictEqual(payload.kioskId, kioskId);
  await userGot;
  await disconnect();
});

test('Video: User disables video → admin receives video-toggled(false)', async () => {
  const { adminSocket, userSocket, kioskId, disconnect } = await setupSessionWithActiveCall();
  userSocket.emit('toggle-video', { kioskId, enabled: true });
  await once(adminSocket, 'video-toggled');
  const adminGot = once(adminSocket, 'video-toggled');
  userSocket.emit('toggle-video', { kioskId, enabled: false });
  const payload = await adminGot;
  assert.strictEqual(payload.enabled, false);
  await disconnect();
});

test('Video: Rapid toggles (on → off → on) admin → user', async () => {
  const { adminSocket, userSocket, kioskId, disconnect } = await setupSessionWithActiveCall();
  for (const enabled of [true, false, true]) {
    const userGot = once(userSocket, 'video-toggled');
    adminSocket.emit('toggle-video', { kioskId, enabled });
    const payload = await userGot;
    assert.strictEqual(payload.enabled, enabled);
  }
  await disconnect();
});

// ========== AUDIO SCENARIOS ==========

test('Audio: Admin enables audio → user receives audio-toggled(true)', async () => {
  const { adminSocket, userSocket, kioskId, disconnect } = await setupSessionWithActiveCall();
  const userGot = once(userSocket, 'audio-toggled');
  const adminGot = once(adminSocket, 'audio-toggle-confirmed');
  adminSocket.emit('toggle-audio', { kioskId, enabled: true });
  const payload = await userGot;
  assert.strictEqual(payload.enabled, true);
  assert.strictEqual(payload.kioskId, kioskId);
  await adminGot;
  await disconnect();
});

test('Audio: Admin disables audio → user receives audio-toggled(false)', async () => {
  const { adminSocket, userSocket, kioskId, disconnect } = await setupSessionWithActiveCall();
  adminSocket.emit('toggle-audio', { kioskId, enabled: true });
  await once(userSocket, 'audio-toggled');
  const userGot = once(userSocket, 'audio-toggled');
  adminSocket.emit('toggle-audio', { kioskId, enabled: false });
  const payload = await userGot;
  assert.strictEqual(payload.enabled, false);
  await disconnect();
});

test('Audio: User enables audio → admin receives audio-toggled(true)', async () => {
  const { adminSocket, userSocket, kioskId, disconnect } = await setupSessionWithActiveCall();
  const adminGot = once(adminSocket, 'audio-toggled');
  const userGot = once(userSocket, 'audio-toggle-confirmed');
  userSocket.emit('toggle-audio', { kioskId, enabled: true });
  const payload = await adminGot;
  assert.strictEqual(payload.enabled, true);
  await userGot;
  await disconnect();
});

test('Audio: User disables audio → admin receives audio-toggled(false)', async () => {
  const { adminSocket, userSocket, kioskId, disconnect } = await setupSessionWithActiveCall();
  userSocket.emit('toggle-audio', { kioskId, enabled: true });
  await once(adminSocket, 'audio-toggled');
  const adminGot = once(adminSocket, 'audio-toggled');
  userSocket.emit('toggle-audio', { kioskId, enabled: false });
  const payload = await adminGot;
  assert.strictEqual(payload.enabled, false);
  await disconnect();
});

test('Audio: Mute/unmute sequence (user: on, off, on)', async () => {
  const { adminSocket, userSocket, kioskId, disconnect } = await setupSessionWithActiveCall();
  for (const enabled of [true, false, true]) {
    const adminGot = once(adminSocket, 'audio-toggled');
    userSocket.emit('toggle-audio', { kioskId, enabled });
    const payload = await adminGot;
    assert.strictEqual(payload.enabled, enabled);
  }
  await disconnect();
});

// ========== WEBRTC SIGNALING (camera / screen stream path) ==========

const mockSdpOffer = { type: 'offer', sdp: 'v=0\r\no=- 0 0 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\n' };
const mockSdpAnswer = { type: 'answer', sdp: 'v=0\r\no=- 0 0 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\n' };
const mockIceCandidate = { candidate: 'candidate:0 1 UDP 2122252543 192.168.1.1 54321 typ host', sdpMid: '0', sdpMLineIndex: 0 };

const MONITOR_CLIENT_ID = 'admin';

test('WebRTC signaling: Kiosk sends offer → Monitor receives offer', async () => {
  const { adminSocket, userSocket, kioskId, disconnect } = await setupSessionWithActiveCall();
  const adminGot = once(adminSocket, 'offer');
  userSocket.emit('offer', { targetId: MONITOR_CLIENT_ID, offer: mockSdpOffer });
  const payload = await adminGot;
  assert.ok(payload.fromId);
  assert.ok(payload.offer);
  assert.strictEqual(payload.offer.type, 'offer');
  await disconnect();
});

test('WebRTC signaling: Monitor sends answer → Kiosk receives answer', async () => {
  const { adminSocket, userSocket, kioskId, disconnect } = await setupSessionWithActiveCall();
  const userGot = once(userSocket, 'answer');
  adminSocket.emit('answer', { targetId: kioskId, answer: mockSdpAnswer });
  const payload = await userGot;
  assert.ok(payload.fromId);
  assert.ok(payload.answer);
  assert.strictEqual(payload.answer.type, 'answer');
  await disconnect();
});

test('WebRTC signaling: Kiosk sends ICE candidate → Monitor receives ice-candidate', async () => {
  const { adminSocket, userSocket, kioskId, disconnect } = await setupSessionWithActiveCall();
  const adminGot = once(adminSocket, 'ice-candidate');
  userSocket.emit('ice-candidate', { targetId: MONITOR_CLIENT_ID, candidate: mockIceCandidate });
  const payload = await adminGot;
  assert.ok(payload.fromId);
  assert.ok(payload.candidate);
  await disconnect();
});

test('WebRTC signaling: Monitor sends ICE candidate → Kiosk receives ice-candidate', async () => {
  const { adminSocket, userSocket, kioskId, disconnect } = await setupSessionWithActiveCall();
  const userGot = once(userSocket, 'ice-candidate');
  adminSocket.emit('ice-candidate', { targetId: kioskId, candidate: mockIceCandidate });
  const payload = await userGot;
  assert.ok(payload.fromId);
  assert.ok(payload.candidate);
  await disconnect();
});

test('WebRTC signaling (screen stream path): Full offer → answer → ICE both ways', async () => {
  const { adminSocket, userSocket, kioskId, disconnect } = await setupSessionWithActiveCall();
  const adminOffer = once(adminSocket, 'offer');
  userSocket.emit('offer', { targetId: MONITOR_CLIENT_ID, offer: mockSdpOffer });
  await adminOffer;
  const userAnswer = once(userSocket, 'answer');
  adminSocket.emit('answer', { targetId: kioskId, answer: mockSdpAnswer });
  await userAnswer;
  const adminIce = once(adminSocket, 'ice-candidate');
  userSocket.emit('ice-candidate', { targetId: MONITOR_CLIENT_ID, candidate: mockIceCandidate });
  await adminIce;
  const userIce = once(userSocket, 'ice-candidate');
  adminSocket.emit('ice-candidate', { targetId: kioskId, candidate: mockIceCandidate });
  await userIce;
  await disconnect();
});

// ========== COMBINED MEDIA SCENARIO ==========

test('Combined: Call + video (both) + audio (both) + toggles off + call end', async () => {
  const { adminSocket, userSocket, kioskId, disconnect } = await setupSessionWithActiveCall();

  adminSocket.emit('toggle-video', { kioskId, enabled: true });
  await once(userSocket, 'video-toggled');
  userSocket.emit('toggle-video', { kioskId, enabled: true });
  await once(adminSocket, 'video-toggled');
  adminSocket.emit('toggle-audio', { kioskId, enabled: true });
  await once(userSocket, 'audio-toggled');
  userSocket.emit('toggle-audio', { kioskId, enabled: true });
  await once(adminSocket, 'audio-toggled');

  adminSocket.emit('toggle-video', { kioskId, enabled: false });
  await once(userSocket, 'video-toggled');
  userSocket.emit('toggle-audio', { kioskId, enabled: false });
  await once(adminSocket, 'audio-toggled');

  adminSocket.emit('call-end', { kioskId });
  await once(userSocket, 'call-ended');
  await once(adminSocket, 'call-end-confirmed');
  await disconnect();
});

test('Combined: Kiosk initiates call, both toggle media, monitor ends call', async () => {
  const { adminSocket, userSocket, kioskId, disconnect } = await setupSessionWithActiveCall();
  userSocket.emit('call-end', { kioskId });
  await once(adminSocket, 'call-ended');
  await once(userSocket, 'call-end-confirmed');

  adminSocket.emit('call-request', { kioskId });
  await once(userSocket, 'call-request');
  userSocket.emit('call-accept', { kioskId });
  await once(adminSocket, 'call-accepted');
  userSocket.emit('toggle-video', { kioskId, enabled: true });
  await once(adminSocket, 'video-toggled');
  adminSocket.emit('toggle-audio', { kioskId, enabled: true });
  await once(userSocket, 'audio-toggled');
  adminSocket.emit('call-end', { kioskId });
  await once(userSocket, 'call-ended');
  await disconnect();
});

test('Media without session: toggle-video without start-monitoring returns error', async () => {
  const adminLogin = await login('admin', 'admin123');
  const u = `u_${Date.now()}`;
  await createUser(adminLogin.accessToken, u, 'NoSession User', 'p');
  const userLogin = await login(u, 'p');
  const adminSocket = await connectSocket(adminLogin.accessToken);
  const userSocket = await connectSocket(userLogin.accessToken);
  adminSocket.emit('register-monitor');
  await once(adminSocket, 'monitor-registered');
  userSocket.emit('register-kiosk');
  await once(userSocket, 'kiosk-registered');
  const errP = once(userSocket, 'error', 3000);
  userSocket.emit('toggle-video', { kioskId: u, enabled: true });
  const err = await errP;
  assert.ok(err?.code);
  assert.ok(String(err?.message || '').toLowerCase().includes('session') || err?.code !== undefined);
  adminSocket.disconnect();
  userSocket.disconnect();
});
