// ── CONFIG ──────────────────────────────────────────────────
// Usa proxy Vercel para evitar bloqueio CORS do Supabase
const AUTH_PROXY = '/api/auth';
// ────────────────────────────────────────────────────────────

const _sb = {
  auth: {
    async signUp({ email, password, options }) {
      try {
        const res = await fetch(AUTH_PROXY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'signup', email, password, data: options?.data || {} })
        });
        const data = await res.json();
        if (!res.ok) return { data: null, error: { message: data.msg || data.message || data.error_description || JSON.stringify(data) } };
        if (data.access_token) localStorage.setItem('sb_session', JSON.stringify(data));
        return { data: { user: data.user || data }, error: null };
      } catch(e) {
        return { data: null, error: { message: e.message } };
      }
    },

    async signInWithPassword({ email, password }) {
      try {
        const res = await fetch(AUTH_PROXY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'login', email, password })
        });
        const data = await res.json();
        if (!res.ok) return { data: null, error: { message: data.msg || data.message || data.error_description || JSON.stringify(data) } };
        localStorage.setItem('sb_session', JSON.stringify(data));
        return { data: { user: data.user, session: data }, error: null };
      } catch(e) {
        return { data: null, error: { message: e.message } };
      }
    },

    async getUser() {
      try {
        const session = JSON.parse(localStorage.getItem('sb_session') || 'null');
        if (!session) return { data: { user: null } };
        const res = await fetch(AUTH_PROXY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'user', access_token: session.access_token })
        });
        if (!res.ok) return { data: { user: null } };
        const user = await res.json();
        return { data: { user } };
      } catch(e) {
        return { data: { user: null } };
      }
    },

    async resetPasswordForEmail(email) {
      try {
        const res = await fetch(AUTH_PROXY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'recover', email })
        });
        return res.ok ? { error: null } : { error: await res.json() };
      } catch(e) {
        return { error: { message: e.message } };
      }
    },

    async signOut() {
      localStorage.removeItem('sb_session');
    }
  }
};

async function getUser() {
  const { data: { user } } = await _sb.auth.getUser();
  return user;
}

async function getSubscription() {
  const user = await getUser();
  if (!user) { window.location.href = './login.html'; return null; }
  // Por enquanto retorna trial ativo para todos os usuários logados
  // TODO: implementar tabela subscriptions
  return { status: 'trial', trial_ends_at: new Date(Date.now() + 7*86400000).toISOString(), user_id: user.id };
}

async function createTrialSubscription(userId) {
  // Trial criado localmente por enquanto
  return { status: 'trial', user_id: userId };
}

async function requireAccess() {
  const user = await getUser();
  if (!user) return false;
  _showTrialBanner(7);
  return true;
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
    <span>Período gratuito: <strong>${days} ${plural} restante${days > 1 ? 's' : ''}</strong></span>
    <a href="./paywall.html" style="background:white;color:#B71C1C;padding:0.3rem 0.85rem;
      border-radius:99px;font-size:0.78rem;font-weight:900;text-decoration:none;">Assinar agora</a>
    <button onclick="this.parentElement.parentElement.remove()"
      style="background:none;border:none;color:rgba(255,255,255,0.7);font-size:1.2rem;cursor:pointer;">✕</button>
  </div>`;
  document.body.appendChild(div);
}

async function registerPaymentIntent(plan) {
  return { data: null, error: 'Pagamento não implementado' };
}

async function signOut() {
  await _sb.auth.signOut();
  window.location.href = './login.html';
}

window.SubscriptionService = {
  supabase: _sb,
  getUser,
  getSubscription,
  createTrialSubscription,
  requireAccess,
  registerPaymentIntent,
  signOut
};
