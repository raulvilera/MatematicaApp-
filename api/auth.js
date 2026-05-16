// /api/auth.js - Vercel Serverless Function (proxy para Supabase)
const SUPABASE_URL = 'https://vyzvmokencerestsrrtm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5enZtb2tlbmNlcmVzdHNycnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4OTczMzUsImV4cCI6MjA5MjQ3MzMzNX0.EhjCtoEcomTG1W3rakn2iqU0o5MJ4rlSh-HilGpJYxc';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, email, password, data: userData, access_token } = req.body;

  try {
    let endpoint, body, authHeader;

    if (action === 'signup') {
      endpoint = '/auth/v1/signup';
      body = { email, password, data: userData || {} };
      authHeader = `Bearer ${SUPABASE_ANON_KEY}`;
    } else if (action === 'login') {
      endpoint = '/auth/v1/token?grant_type=password';
      body = { email, password };
      authHeader = `Bearer ${SUPABASE_ANON_KEY}`;
    } else if (action === 'user') {
      endpoint = '/auth/v1/user';
      body = null;
      authHeader = `Bearer ${access_token}`;
    } else if (action === 'recover') {
      endpoint = '/auth/v1/recover';
      body = { email };
      authHeader = `Bearer ${SUPABASE_ANON_KEY}`;
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const fetchOptions = {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': authHeader
      }
    };
    if (body) fetchOptions.body = JSON.stringify(body);

    const response = await fetch(`${SUPABASE_URL}${endpoint}`, fetchOptions);
    const result = await response.json();

    return res.status(response.status).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
