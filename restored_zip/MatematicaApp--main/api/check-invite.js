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
  res.setHeader('Access-Control-Allow-Origin', 'https://mate-pied.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { inviteCode } = req.body;
    if (!inviteCode) return res.status(400).json({ error: 'Código não fornecido' });

    // Buscar convite
    const inviteDoc = await db.collection('invites').doc(inviteCode).get();
    if (!inviteDoc.exists) {
      return res.status(404).json({ error: 'Código de professor inválido' });
    }

    const teacherId = inviteDoc.data().teacherId;
    const teacherDoc = await db.collection('users').doc(teacherId).get();
    if (!teacherDoc.exists) {
      return res.status(404).json({ error: 'Professor não encontrado' });
    }

    const teacherData = teacherDoc.data();
    const maxStudents = teacherData.subscription?.maxStudents || 35;

    // Contar alunos atuais
    const studentsSnap = await db.collection('users')
      .where('teacherId', '==', teacherId)
      .where('role', '==', 'student')
      .count()
      .get();
      
    const currentStudents = studentsSnap.data().count;

    if (currentStudents >= maxStudents) {
      return res.status(403).json({ error: 'O limite de alunos deste professor foi atingido.' });
    }

    return res.status(200).json({
      teacherId,
      teacherName: teacherData.name,
      available: true
    });

  } catch (e) {
    console.error('Invite check error:', e);
    return res.status(500).json({ error: 'Erro ao validar código' });
  }
}
