import crypto from 'crypto';

// The temple owns the LINE credentials. Only signed, persisted calls may use this relay.
export async function notifyQueueCall(order, actorId) {
  const secret = process.env.KATHIN_BRIDGE_SECRET;
  if (!secret) return { status: 'failed' };
  const claim = Buffer.from(JSON.stringify({ aud: 'nathoeng-kathin-queue', orderId: order.id,
    actorId, calledAt: order.accepted_at, exp: Date.now() + 60000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`kathin-queue-notify.${claim}`).digest('base64url');
  try {
    const response = await fetch('https://watt.nathoeng.com/api/line-login?route=kathin-queue-notify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: `${claim}.${signature}` }), signal: AbortSignal.timeout(15000)
    });
    const result = await response.json();
    if (!response.ok || !['sent', 'skipped_unlinked', 'skipped_collected'].includes(result.status)) return { status: 'failed' };
    return { status: result.status };
  } catch { return { status: 'failed' }; }
}
