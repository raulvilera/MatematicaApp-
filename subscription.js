// ── CONFIG ──────────────────────────────────────────────────
const SUPABASE_URL      = 'https://bttkwnnwmcuthcmdzdrh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0dGt3bm53bWN1dGhjbWR6ZHJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MTQ2ODQsImV4cCI6MjA5MjM5MDY4NH0.pihYj_B6zp3p5SowTkUPK4YQp3c615FHNwU5wXENA2c';
// ────────────────────────────────────────────────────────────

const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function getUser() {
  const { data: { user } } = await _sb.auth.getUser();
  return user;
}

async function getSubscription() {
  const user = await getUser();
  if (!user) { window.location.href = './login.html'; return null; }
  const { data, error } = await _sb.from('subscriptions')
    .select('*').eq('user_id', user.id).single();
  if (error) { console.error('[Sub]', error); return null; }
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
  }).select().single();
  if (error) console.error('[Trial]', error);
  return data || null;
}

async function requireAccess() {
  const sub = await getSubscription();
  if (!sub) return false;
  const now = new Date();

  if (sub.status === 'trial') {
    const trialEnd = new Date(sub.trial_ends_at);
    if (now < trialEnd) {
      const days = Math.ceil((trialEnd - now) / 86400000);
      _showTrialBanner(days);
      return true;
    }
    await _sb.from('subscriptions').update({ status: 'expired' }).eq('user_id', sub.user_id);
    window.location.href = './paywall.html?reason=trial_expired';
    return false;
  }

  if (sub.status === 'active') {
    const periodEnd = new Date(sub.current_period_ends_at);
    if (now < periodEnd) return true;
    await _sb.from('subscriptions').update({ status: 'expired' }).eq('user_id', sub.user_id);
    window.location.href = './paywall.html?reason=subscription_expired';
    return false;
  }

  window.location.href = './paywall.html?reason=no_access';
  return false;
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
  const { data, error } = await _sb.from('payments').insert({
    user_id: user.id,
    subscription_id: sub?.id,
    amount_cents: amounts[plan],
    plan,
    status: 'pending',
  }).select().single();
  return { data, error };
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
