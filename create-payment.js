// api/create-payment.js - Cria cobrança PIX no Mercado Pago
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://mate-pied.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    // Verificar token Firebase
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });
    
    const decoded = await getAuth().verifyIdToken(token);
    const uid = decoded.uid;
    const email = decoded.email;

    const { plan } = req.body;
    if (!['monthly', 'yearly'].includes(plan)) {
      return res.status(400).json({ error: 'Plano inválido' });
    }

    const amounts = { monthly: 21.99, yearly: 250.00 };
    const descriptions = { monthly: 'Matematica@App - Mensal', yearly: 'Matematica@App - Anual' };

    const payment = {
      transaction_amount: amounts[plan],
      description: descriptions[plan],
      payment_method_id: 'pix',
      payer: { email },
      external_reference: uid,
      metadata: { plan, uid },
      notification_url: `https://mate-pied.vercel.app/api/webhook`,
      date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 min
    };

    const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `${uid}-${plan}-${Date.now()}`
      },
      body: JSON.stringify(payment)
    });

    const result = await mpRes.json();
    
    if (!mpRes.ok) {
      return res.status(400).json({ error: result.message || 'Erro ao criar pagamento' });
    }

    return res.status(200).json({
      paymentId: result.id,
      qrCode: result.point_of_interaction?.transaction_data?.qr_code,
      qrCodeBase64: result.point_of_interaction?.transaction_data?.qr_code_base64,
      amount: amounts[plan],
      plan
    });

  } catch (e) {
    console.error('Payment error:', e);
    return res.status(500).json({ error: e.message });
  }
}
