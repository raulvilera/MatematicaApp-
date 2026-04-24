// ── Firebase Config ──────────────────────────────────────────
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
         signOut as fbSignOut, onAuthStateChanged, sendPasswordResetEmail,
         updateProfile } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, updateDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyDJ4ZxM-1DmDrUj3yIar4C_tPqS3Gp1S1Q",
  authDomain: "matematica-app-a59ef.firebaseapp.com",
  projectId: "matematica-app-a59ef",
  storageBucket: "matematica-app-a59ef.firebasestorage.app",
  messagingSenderId: "1080081552143",
  appId: "1:1080081552143:web:2316e6b57bc1097f25a47a",
  measurementId: "G-4FG0XMPKP2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ── Funções de Autenticação ──────────────────────────────────

async function signUp(name, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 7);

  await setDoc(doc(db, 'users', cred.user.uid), {
    name,
    email,
    createdAt: new Date().toISOString(),
    subscription: {
      status: 'trial',
      plan: null,
      trialEndsAt: trialEnd.toISOString(),
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelledAt: null
    },
    updatedAt: new Date().toISOString()
  });

  return cred.user;
}

async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

async function signOut() {
  await fbSignOut(auth);
  window.location.href = './login.html';
}

async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

// ── getUser com espera correta pelo Firebase ─────────────────
// onAuthStateChanged pode demorar para resolver o estado real.
// Aguardamos até 8s antes de desistir e retornar null.
async function getUser() {
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) { resolved = true; unsub(); resolve(null); }
    }, 8000);
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        unsub();
        resolve(user);
      }
    });
  });
}

// ── Funções de Assinatura ────────────────────────────────────

async function getSubscription() {
  const user = await getUser();
  if (!user) return null;
  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) return null;
  return snap.data().subscription;
}

async function requireAccess() {
  const user = await getUser();
  if (!user) {
    window.location.href = './login.html';
    return false;
  }

  const snap = await getDoc(doc(db, 'users', user.uid));

  // Documento não existe: usuário novo — cria trial e libera acesso
  if (!snap.exists()) {
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 7);
    await setDoc(doc(db, 'users', user.uid), {
      name: user.displayName || '',
      email: user.email,
      createdAt: new Date().toISOString(),
      subscription: {
        status: 'trial',
        plan: null,
        trialEndsAt: trialEnd.toISOString(),
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelledAt: null
      },
      updatedAt: new Date().toISOString()
    });
    _showTrialBanner(7);
    return true;
  }

  const sub = snap.data().subscription;
  if (!sub) {
    window.location.href = './paywall.html?reason=no_access';
    return false;
  }

  const now = new Date();

  if (sub.status === 'trial') {
    const trialEnd = new Date(sub.trialEndsAt);
    if (now < trialEnd) {
      const days = Math.ceil((trialEnd - now) / 86400000);
      _showTrialBanner(days);
      return true;
    }
    window.location.href = './paywall.html?reason=trial_expired';
    return false;
  }

  if (sub.status === 'active') {
    const periodEnd = new Date(sub.currentPeriodEnd);
    if (now < periodEnd) return true;
    await updateDoc(doc(db, 'users', user.uid), {
      'subscription.status': 'expired',
      updatedAt: new Date().toISOString()
    });
    window.location.href = './paywall.html?reason=expired';
    return false;
  }

  window.location.href = './paywall.html?reason=no_access';
  return false;
}

async function createPayment(plan) {
  const user = await getUser();
  if (!user) throw new Error('Não autenticado');

  const token = await user.getIdToken();

  const res = await fetch('/api/create-payment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ plan })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Erro ao criar pagamento');
  }

  return res.json();
}

function _showTrialBanner(days) {
  if (document.getElementById('_trial_banner')) return;
  const plural = days === 1 ? 'dia' : 'dias';
  const div = document.createElement('div');
  div.id = '_trial_banner';
  div.innerHTML = `<div style="position:fixed;bottom:0;left:0;right:0;z-index:9999;
    background:linear-gradient(90deg,#B71C1C,#FF5252);color:white;
    text-align:center;padding:0.55rem 1rem;font-family:'Nunito',sans-serif;
    font-weight:800;font-size:0.82rem;display:flex;align-items:center;
    justify-content:center;gap:0.8rem;box-shadow:0 -4px 20px rgba(0,0,0,0.4);">
    <span>Trial: <strong>${days} ${plural} restante${days > 1 ? 's' : ''}</strong></span>
    <a href="./paywall.html" style="background:white;color:#B71C1C;padding:0.3rem 0.85rem;
      border-radius:99px;font-size:0.78rem;font-weight:900;text-decoration:none;">Assinar agora</a>
    <button onclick="this.parentElement.parentElement.remove()"
      style="background:none;border:none;color:rgba(255,255,255,0.7);font-size:1.2rem;cursor:pointer;">✕</button>
  </div>`;
  document.body.appendChild(div);
}

window.SubscriptionService = {
  auth, db, signUp, signIn, signOut, resetPassword,
  getUser, getSubscription, requireAccess, createPayment
};
