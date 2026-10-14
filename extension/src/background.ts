import { supabase } from './lib/supabase';
import { DataType } from '@shadowai/shared';

// Cache for the current user's policy to avoid hitting the DB on every page load.
// MV3 service workers are terminated after ~30s idle, so anything kept only in a
// module-level variable is lost between events. companyId is therefore mirrored
// into chrome.storage.session, which survives worker restarts.
let cachedPolicy: Record<string, string> | null = null;
let cachedCompanyId: string | null = null;
let sessionEmail: string | null = null;

async function readStoredCompanyId(): Promise<string | null> {
  if (cachedCompanyId) return cachedCompanyId;
  try {
    const stored = await chrome.storage.session.get('companyId');
    const value = stored.companyId;
    if (typeof value === 'string' && value) {
      cachedCompanyId = value;
      return value;
    }
  } catch {
    // storage.session is unavailable outside an extension context; fall through.
  }
  return null;
}

async function writeStoredCompanyId(companyId: string): Promise<void> {
  cachedCompanyId = companyId;
  try {
    await chrome.storage.session.set({ companyId });
  } catch {
    // Non-fatal: the in-memory cache still serves this worker's lifetime.
  }
}

async function clearStoredCompanyId(): Promise<void> {
  cachedPolicy = null;
  cachedCompanyId = null;
  sessionEmail = null;
  try {
    await chrome.storage.session.remove('companyId');
  } catch {
    // Non-fatal.
  }
}

// Helper to ensure we have a valid session and policy
async function getPolicy() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    sessionEmail = null;
    return null;
  }
  sessionEmail = session.user.email ?? null;

  // Fetch company_id and role
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('id', session.user.id)
    .single();

  if (!profile?.company_id) return null;
  await writeStoredCompanyId(profile.company_id);

  // Fetch policies for this company
  const { data: policies } = await supabase
    .from('policies')
    .select('data_type, action')
    .eq('company_id', profile.company_id);

  if (policies) {
    cachedPolicy = policies.reduce((acc, curr) => {
      acc[curr.data_type] = curr.action;
      return acc;
    }, {} as Record<string, string>);
  }

  return cachedPolicy;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_POLICY') {
    getPolicy().then(policy => {
      sendResponse({
        policy,
        companyId: cachedCompanyId,
        // The account the policy belongs to, so the popup can show it.
        email: sessionEmail,
      });
    });
    return true; // Keep channel open for async response
  }

  if (request.type === 'REPORT_EVENT') {
    // CRITICAL PRIVACY: We only accept and store metadata.
    // request.payload MUST NOT contain 'text' or 'content'.
    const { data_type, action, hostname } = request.payload;

    // We need to get the session again to ensure we have the user_id and company_id
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        console.warn('Cannot report event: No active session.');
        sendResponse({ success: false });
        return;
      }

      // Rehydrate after a service-worker restart; previously this was null on wake
      // and every event was silently dropped.
      let companyId = await readStoredCompanyId();
      if (!companyId) {
        await getPolicy();
        companyId = await readStoredCompanyId();
      }

      if (!companyId) {
        console.warn('Cannot report event: No company for this user.');
        sendResponse({ success: false });
        return;
      }

      const { error } = await supabase.from('events').insert({
        company_id: companyId,
        user_id: session.user.id,
        ai_tool: hostname, // e.g., 'chatgpt.com', 'mail.google.com'
        data_type: data_type,
        action: action,
        count: 1
      });

      if (error) {
        console.error('Failed to report event:', error);
        sendResponse({ success: false });
      } else {
        sendResponse({ success: true });
      }
    });
    return true; // Keep channel open for async response
  }

  if (request.type === 'LOGIN') {
    const { email, password } = request.payload;
    supabase.auth.signInWithPassword({ email, password }).then(({ data, error }) => {
      if (error) {
        sendResponse({ success: false, error: error.message });
      } else {
        sendResponse({ success: true });
        // Refresh policy cache after login
        getPolicy(); 
      }
    });
    return true;
  }
  
  if (request.type === 'LOGOUT') {
    supabase.auth.signOut().then(async () => {
      await clearStoredCompanyId();
      sendResponse({ success: true });
    });
    return true;
  }
});
