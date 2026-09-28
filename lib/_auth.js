import crypto from 'crypto';

const COOKIE_NAME = 'nathoeng_session';

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  let base64 = value
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  while (base64.length % 4) {
    base64 += '=';
  }

  return Buffer.from(base64, 'base64').toString();
}

function sign(value, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(value)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function createSessionToken(user) {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error('SESSION_SECRET is missing');
  }

  const payload = {
    memberId: user.memberId,
    lineUid: user.lineUid || null,
    telegramUid: user.telegramUid || null,
    authProvider: user.authProvider || (user.telegramUid ? 'telegram' : 'line'),
    role: user.role,
    studentId: user.studentId || null,
    actingAdminId: user.actingAdminId || null,
    actingAdminAuthProvider: user.actingAdminAuthProvider || null,
    exp: Date.now() + 1000 * 60 * 60 * (user.actingAdminId ? 4 : 24 * 7)
  };

  const encodedPayload = base64UrlEncode(
    JSON.stringify(payload)
  );

  const signature = sign(
    encodedPayload,
    secret
  );

  return encodedPayload + '.' + signature;
}

export function verifySessionToken(token) {
  const secret = process.env.SESSION_SECRET;

  if (!secret || !token) {
    return null;
  }

  const parts = token.split('.');

  if (parts.length !== 2) {
    return null;
  }

  const encodedPayload = parts[0];
  const receivedSignature = parts[1];

  const expectedSignature = sign(
    encodedPayload,
    secret
  );

  const receivedBuffer = Buffer.from(
    receivedSignature
  );

  const expectedBuffer = Buffer.from(
    expectedSignature
  );

  if (
    receivedBuffer.length !== expectedBuffer.length
  ) {
    return null;
  }

  if (
    !crypto.timingSafeEqual(
      receivedBuffer,
      expectedBuffer
    )
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      base64UrlDecode(encodedPayload)
    );

    if (!payload.exp || Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch (error) {
    console.error('Invalid session payload:', error);
    return null;
  }
}

export function getSessionFromRequest(req) {
  const cookieHeader = req.headers.cookie || '';

  const cookies = cookieHeader
    .split(';')
    .map((item) => item.trim());

  const sessionCookie = cookies.find(
    (item) =>
      item.startsWith(COOKIE_NAME + '=')
  );

  if (!sessionCookie) {
    return null;
  }

  const token = decodeURIComponent(
    sessionCookie.substring(
      COOKIE_NAME.length + 1
    )
  );

  const session = verifySessionToken(token);
  if (!session?.actingAdminId || req.method === 'GET') return session;

  // Staff acting as a member may record a donation or leave this mode.
  // All other member mutations (credentials, profile, account links, stays)
  // require the member's own login or the existing explicit admin workflow.
  const pathname = new URL(req.url || '/', 'https://temple.local').pathname;
  if (req.method === 'POST' && pathname === '/api/donation' && !req.body?.action) return session;
  if (req.method === 'POST' && pathname === '/api/donation-profile' &&
      ['stop_as_member', 'member_card_number'].includes(req.body?.action)) return session;
  return null;
}

export function setSessionCookie(res, token, maxAgeSeconds = 604800) {
  res.setHeader(
    'Set-Cookie',
    COOKIE_NAME +
      '=' +
      encodeURIComponent(token) +
      `; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    COOKIE_NAME +
      '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
  );
}

export function requireStudent(req, res) {
  const session = getSessionFromRequest(req);

  if (!session || session.role !== 'temple_student' || !session.studentId) {
    res.status(403).json({ success: false, message: 'Student permission required' });
    return null;
  }

  return session;
}

export function requireAdminOrStudent(req, res) {
  const session = getSessionFromRequest(req);

  if (!session || !['admin', 'temple_student'].includes(session.role)) {
    res.status(403).json({ success: false, message: 'Permission required' });
    return null;
  }

  return session;
}

export function requireAdmin(req, res) {
  const session = getSessionFromRequest(req);

  if (
    !session ||
    session.role !== 'admin'
  ) {
    res.status(403).json({
      success: false,
      message: 'Admin permission required'
    });

    return null;
  }

  return session;
}
