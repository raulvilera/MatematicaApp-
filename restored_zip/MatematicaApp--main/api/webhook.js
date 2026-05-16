import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
  console.log('[webhook] method:', req.method);

  // Responde GET para teste manual no navegador
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'webhook ativo', ts: new Date().toISOString() });
  }

  if (req.method !== 'POST') return res.status(405).end();

  console.log('[webhook] body:', JSON.stringify(req.body));
  console.log('[webhook] query:', JSON.stringify(req.query));

  const { type, data } = req.body || {};

  // O MP também envia notificações com type="payment" via query param
  const paymentId = data?.id || req.query?.['data.id'] || req.query?.id;

  console.log('[webhook] type:', type, '| paymentId:', paymentId);

  if ((type === 'payment' || req.query?.topic === 'payment') && paymentId) {
    try {
      console.log('[webhook] buscando pagamento na API do MP:', paymentId);

      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` }
      });
      const payment = await mpRes.json();

      console.log('[webhook] status:', payment.status, '| uid:', payment.external_reference, '| plan:', payment.metadata?.plan);

      if (payment.status === 'approved') {
        const uid = payment.external_reference;
        const plan = payment.metadata?.plan || 'monthly';
        const studentsCount = parseInt(payment.metadata?.studentsCount, 10) || 35;

        if (!uid) {
          console.error('[webhook] uid ausente no pagamento', paymentId);
          return res.status(200).json({ received: true, warning: 'uid missing' });
        }

        const now = new Date();
        const periodEnd = new Date(now);
        if (plan === 'yearly') {
          periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        } else {
          periodEnd.setMonth(periodEnd.getMonth() + 1);
        }

        console.log('[webhook] gravando no Firestore uid:', uid);

        await db.collection('users').doc(uid).update({
          'subscription.status': 'active',
          'subscription.plan': plan,
          'subscription.maxStudents': studentsCount,
          'subscription.currentPeriodStart': now.toISOString(),
          'subscription.currentPeriodEnd': periodEnd.toISOString(),
          'subscription.cancelledAt': null,
          updatedAt: now.toISOString()
        });

        await db.collection('users').doc(uid).collection('payments').add({
          mpPaymentId: String(paymentId),
          amount: payment.transaction_amount,
          method: 'pix',
          status: 'approved',
          plan,
          createdAt: now.toISOString()
        });

        console.log('[webhook] Firestore atualizado com sucesso ✅ uid:', uid);
      } else {
        console.log('[webhook] pagamento não aprovado, status:', payment.status);
      }
    } catch (e) {
      console.error('[webhook] erro:', e.message);
      return res.status(500).json({ error: e.message });
    }
  } else {
    console.log('[webhook] tipo ignorado:', type || req.query?.topic);
  }

  return res.status(200).json({ received: true });
}
