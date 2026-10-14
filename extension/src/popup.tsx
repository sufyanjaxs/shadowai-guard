import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

type PolicyAction = 'WARN' | 'REDACT' | 'BLOCK';

// The dashboard the extension authenticates against. Kept in sync with
// web/.env.local's APP_URL; changing it only requires a rebuild.
const DASHBOARD_URL = 'https://app.shadowaiguard.com';

const ACTION_COLOR: Record<PolicyAction, string> = {
  WARN: 'bg-amber-100 text-amber-800',
  REDACT: 'bg-blue-100 text-blue-800',
  BLOCK: 'bg-red-100 text-red-800',
};

function PolicySummary({ policy }: { policy: Record<string, string> }) {
  const rows = Object.entries(policy);
  if (rows.length === 0) {
    return <p style={{ color: '#6b7280', fontSize: 12 }}>No company policy found — built-in defaults apply.</p>;
  }

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid #e5e7eb', paddingTop: 10 }}>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Company policy
      </div>
      {rows.map(([type, action]) => (
        <div key={type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
          <span style={{ fontSize: 12 }}>{type.replace(/_/g, ' ')}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${ACTION_COLOR[action as PolicyAction] || 'bg-gray-100 text-gray-700'}`}>
            {action}
          </span>
        </div>
      ))}
    </div>
  );
}

function Popup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Checking status...');
  const [syncing, setSyncing] = useState(false);
  const [accountEmail, setAccountEmail] = useState('');
  const [policy, setPolicy] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_POLICY' }, (response) => {
      if (response?.policy) {
        setIsLoggedIn(true);
        setPolicy(response.policy);
        setAccountEmail(response.email || '');
        setStatus('Active: Protecting your data.');
      } else {
        setIsLoggedIn(false);
        setStatus('Please log in to activate protection.');
      }
    });
  }, []);

  const handleLogin = () => {
    setError('');
    chrome.runtime.sendMessage(
      { type: 'LOGIN', payload: { email, password } },
      (response) => {
        if (response?.success) {
          setIsLoggedIn(true);
          setStatus('Active: Protecting your data.');
          setEmail('');
          setPassword('');
          chrome.runtime.sendMessage({ type: 'GET_POLICY' }, (r) => setPolicy(r?.policy ?? null));
        } else {
          setError(response?.error || 'Login failed');
        }
      }
    );
  };

  const handleLogout = () => {
    chrome.runtime.sendMessage({ type: 'LOGOUT' }, () => {
      setIsLoggedIn(false);
      setPolicy(null);
      setStatus('Please log in to activate protection.');
    });
  };

  const handleSync = () => {
    setSyncing(true);
    chrome.runtime.sendMessage({ type: 'GET_POLICY' }, (response) => {
      setSyncing(false);
      if (response?.policy) {
        setPolicy(response.policy);
        setStatus('Policy synced successfully!');
        setTimeout(() => setStatus('Active: Protecting your data.'), 2000);
      }
    });
  };

  if (isLoggedIn) {
    return (
      <div>
        <h2>🛡️ ShadowAI Guard</h2>
        <div className="status">{status}</div>
        {accountEmail && (
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{accountEmail}</div>
        )}
        {policy && <PolicySummary policy={policy} />}
        <button onClick={handleSync} disabled={syncing} style={{ marginTop: 12, background: '#10b981' }}>
          {syncing ? 'Syncing...' : 'Sync Policy'}
        </button>
        <button
          onClick={() => chrome.tabs.create({ url: `${DASHBOARD_URL}/dashboard` })}
          style={{ marginTop: 8, background: '#6b7280' }}
        >
          Open Dashboard
        </button>
        <button onClick={handleLogout} style={{ marginTop: 8, background: '#ef4444' }}>
          Log Out
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2>🛡️ ShadowAI Guard</h2>
      <div className="status" style={{ marginBottom: 16 }}>{status}</div>
      {error && <div className="error">{error}</div>}
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
      />
      <button onClick={handleLogin}>Log In</button>
    </div>
  );
}

const root = createRoot(document.getElementById('app')!);
root.render(<React.StrictMode><Popup /></React.StrictMode>);