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
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });
    
    const decoded = await getAuth().verifyIdToken(token);
    const uid = decoded.uid;
    const email = decoded.email;

    const { plan, studentsCount } = req.body;
    if (!['monthly', 'yearly'].includes(plan)) {
      return res.status(400).json({ error: 'Plano inválido' });
    }

    const count = parseInt(studentsCount, 10) || 35;
    const additional = Math.max(0, count - 35);
    
    const amounts = { 
      monthly: 21.99 + additional * 1.00, 
      yearly: 250.00 + additional * 10.00 
    };
    
    // Formata os decimais corretamente
    amounts.monthly = Math.round(amounts.monthly * 100) / 100;
    amounts.yearly = Math.round(amounts.yearly * 100) / 100;
    
    const descriptions = { 
      monthly: `Matematica@App - Mensal (${count} alunos)`, 
      yearly: `Matematica@App - Anual (${count} alunos)` 
    };

    const payment = {
      transaction_amount: amounts[plan],
      description: descriptions[plan],
      payment_method_id: 'pix',
      payer: { email },
      external_reference: uid,
      metadata: { plan, uid, studentsCount: count },
      notification_url: 'https://mate-pied.vercel.app/api/webhook',
      date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString()
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
