// ── CONFIG ──────────────────────────────────────────────────
const SUPABASE_URL      = 'https://vyzvmokencerestsrrtm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5enZtb2tlbmNlcmVzdHNycnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4OTczMzUsImV4cCI6MjA5MjQ3MzMzNX0.EhjCtoEcomTG1W3rakn2iqU0o5MJ4rlSh-HilGpJYxc';
// ────────────────────────────────────────────────────────────

// Cliente Supabase manual (sem biblioteca externa)
const _sb = {
  _session: null,

  async _fetch(path, options = {}) {
    const session = this._session || JSON.parse(localStorage.getItem('sb_session') || 'null');
    const headers = {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${session ? session.access_token : SUPABASE_ANON_KEY}`,
      ...options.headers
    };
    const res = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers });
    const data = await res.json();
    return { data, error: res.ok ? null : data };
  },

  auth: {
    async signUp({ email, password, options }) {
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({ email, password, data: options?.data || {} })
        });
        const data = await res.json();
        if (!res.ok) return { data: null, error: data };
        if (data.access_token) {
          localStorage.setItem('sb_session', JSON.stringify(data));
          _sb._session = data;
        }
        return { data: { user: data.user || data }, error: null };
      } catch(e) {
        return { data: null, error: { message: e.message } };
      }
    },

    async signInWithPassword({ email, password }) {
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) return { data: null, error: data };
        localStorage.setItem('sb_session', JSON.stringify(data));
        _sb._session = data;
        return { data: { user: data.user, session: data }, error: null };
      } catch(e) {
        return { data: null, error: { message: e.message } };
      }
    },

    async getUser() {
      try {
        const session = JSON.parse(localStorage.getItem('sb_session') || 'null');
        if (!session) return { data: { user: null } };
        const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${session.access_token}`
          }
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
        const res = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({ email })
        });
        return res.ok ? { error: null } : { error: await res.json() };
      } catch(e) {
        return { error: { message: e.message } };
      }
    },

    async signOut() {
      localStorage.removeItem('sb_session');
      _sb._session = null;
    }
  },

  from(table) {
    return {
      _table: table,
      _filters: [],
      _selectCols: '*',

      select(cols) { this._selectCols = cols || '*'; return this; },
      eq(col, val) { this._filters.push(`${col}=eq.${val}`); return this; },
      single() { this._single = true; return this; },

      async _run(method, body) {
        const session = JSON.parse(localStorage.getItem('sb_session') || 'null');
        const params = this._filters.length ? '?' + this._filters.join('&') : '';
        const url = `${SUPABASE_URL}/rest/v1/${this._table}${params}`;
        const headers = {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session ? session.access_token : SUPABASE_ANON_KEY}`,
          'Prefer': method === 'POST' ? 'return=representation' : ''
        };
        if (this._single) headers['Accept'] = 'application/vnd.pgrst.object+json';
        try {
          const res = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
          });
          const data = await res.json();
          if (!res.ok) return { data: null, error: data };
          return { data: Array.isArray(data) ? data[0] : data, error: null };
        } catch(e) {
          return { data: null, error: { message: e.message } };
        }
      },

      async insert(obj) { return this._run('POST', obj); },
      update(obj) {
        return { eq: (col, val) => {
          this._filters.push(`${col}=eq.${val}`);
          return this._run('PATCH', obj);
        }};
      }
    };
  }
};

async function getUser() {
  const { data: { user } } = await _sb.auth.getUser();
  return user;
}

async function getSubscription() {
  const user = await getUser();
  if (!user) { window.location.href = './login.html'; return null; }
  const { data, error } = await _sb.from('subscriptions')
    .select('*').eq('user_id', user.id).single()._run('GET');
  if (error) { console.error(error); return null; }
  return data;
}

async function createTrialSubscription(userId) {
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 7);
  const { data, error } = await _sb.from('subscriptions').insert({
    user_id: userId,
    status: 'trial',
    trial_ends_at: trialEnd.toISOString(),
    current_period_ends_at: trialEnd.toISOString(),
  });
  if (error) { console.error('[Subscription] Erro ao criar trial:', error); return null; }
  return data;
}

async function requireAccess() {
  const sub = await getSubscription();
  if (!sub) return false;
  const now = new Date();
  if (sub.status === 'trial') {
    const trialEnd = new Date(sub.trial_ends_at);
    if (now < trialEnd) { _showTrialBanner(Math.ceil((trialEnd - now) / 86400000)); return true; }
    await _sb.from('subscriptions').update({ status: 'expired' }).eq('user_id', sub.user_id);
    window.location.href = './paywall.html?reason=trial_expired'; return false;
  }
  if (sub.status === 'active') {
    const periodEnd = new Date(sub.current_period_ends_at);
    if (now < periodEnd) return true;
    await _sb.from('subscriptions').update({ status: 'expired' }).eq('user_id', sub.user_id);
    window.location.href = './paywall.html?reason=subscription_expired'; return false;
  }
  window.location.href = './paywall.html?reason=no_access'; return false;
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
  const user = await getUser();
  if (!user) return { error: 'Não autenticado' };
  const sub = await getSubscription();
  const amounts = { monthly: 2199, yearly: 25000 };
  return _sb.from('payments').insert({
    user_id: user.id,
    subscription_id: sub?.id,
    amount_cents: amounts[plan],
    plan,
    status: 'pending',
  });
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
