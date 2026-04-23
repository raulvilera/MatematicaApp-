// api/webhook.js - Recebe notificações do Mercado Pago e atualiza Firebase
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Verificar assinatura do Mercado Pago
  const secret = process.env.MP_WEBHOOK_SECRET;
  const signature = req.headers['x-signature'];
  const requestId = req.headers['x-request-id'];
  
  if (secret && signature) {
    const [tsPart, v1Part] = signature.split(',');
    const ts = tsPart?.split('=')[1];
    const v1 = v1Part?.split('=')[1];
    const manifest = `id:${req.query.data?.id};request-id:${requestId};ts:${ts};`;
    const hmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
    if (hmac !== v1) return res.status(401).json({ error: 'Invalid signature' });
  }

  const { type, data } = req.body;
  
  if (type === 'payment') {
    try {
      // Buscar detalhes do pagamento no MP
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
        headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` }
      });
      const payment = await mpRes.json();
      
      if (payment.status === 'approved') {
        const uid = payment.external_reference;
        const plan = payment.metadata?.plan || 'monthly';
        
        const now = new Date();
        const periodEnd = new Date(now);
        if (plan === 'yearly') {
          periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        } else {
          periodEnd.setMonth(periodEnd.getMonth() + 1);
        }

        await db.collection('users').doc(uid).update({
          'subscription.status': 'active',
          'subscription.plan': plan,
          'subscription.currentPeriodStart': now.toISOString(),
          'subscription.currentPeriodEnd': periodEnd.toISOString(),
          'subscription.cancelledAt': null,
          updatedAt: now.toISOString()
        });

        await db.collection('users').doc(uid).collection('payments').add({
          mpPaymentId: String(data.id),
          amount: payment.transaction_amount,
          method: 'pix',
          status: 'approved',
          plan,
          createdAt: now.toISOString()
        });
      }
    } catch (e) {
      console.error('Webhook error:', e);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(200).json({ received: true });
}
