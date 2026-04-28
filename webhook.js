// app/api/webhook/route.js  (Next.js App Router)
// OU pages/api/webhook.js  (Next.js Pages Router — veja abaixo)

// ============================================================
// VERSÃO APP ROUTER (pasta app/)
// ============================================================
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { type, data } = body;

    console.log('Webhook MP recebido:', type, data);

    if (type === 'payment') {
      const paymentId = data.id;

      // Consulta o pagamento na API do Mercado Pago
      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          },
        }
      );

      const payment = await response.json();
      console.log('Pagamento:', payment.status, payment.transaction_amount);

      if (payment.status === 'approved') {
        // ✅ PAGAMENTO APROVADO — coloque sua lógica aqui:
        // - Ativar acesso do usuário
        // - Salvar no banco de dados
        // - Enviar e-mail de confirmação
        console.log('Pagamento aprovado! ID:', paymentId);
      }
    }

    // Sempre retorne 200 para o Mercado Pago
    return NextResponse.json({ received: true }, { status: 200 });

  } catch (error) {
    console.error('Erro no webhook:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// ============================================================
// VERSÃO PAGES ROUTER (pasta pages/api/)
// ============================================================
// export default async function handler(req, res) {
//   if (req.method !== 'POST') return res.status(405).end();
//
//   const { type, data } = req.body;
//
//   if (type === 'payment') {
//     const paymentId = data.id;
//     const response = await fetch(
//       `https://api.mercadopago.com/v1/payments/${paymentId}`,
//       { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
//     );
//     const payment = await response.json();
//     if (payment.status === 'approved') {
//       // sua lógica aqui
//     }
//   }
//
//   res.status(200).json({ received: true });
// }
