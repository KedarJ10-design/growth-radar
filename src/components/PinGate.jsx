import { useState, useEffect } from 'react';
import { api } from '../api';

export default function PinGate({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    // Check if already authenticated via HTTP-only cookie
    api.checkAuth()
      .then(res => {
        if (res.authenticated) {
          setIsAuthenticated(true);
        }
      })
      .catch(() => {
        // Not authenticated, just show login screen
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pin) return;
    
    setChecking(true);
    setError('');
    
    try {
      const res = await api.login(pin);
      if (res.success) {
        setIsAuthenticated(true);
      }
    } catch (err) {
      setError(err.message || 'Invalid PIN');
      setPin('');
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--text-muted)' }}>Loading...</div>;
  }

  if (isAuthenticated) {
    return children;
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'var(--bg)',
      padding: '20px'
    }}>
      <div className="card slide-up" style={{
        maxWidth: '400px',
        width: '100%',
        padding: '40px',
        textAlign: 'center',
        background: 'var(--card-bg)',
        border: '1px solid var(--border)'
      }}>
        <div style={{ marginBottom: '30px' }}>
          <div style={{ fontSize: '48px', marginBottom: '10px' }}>🔒</div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>Growth Radar</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Enter your PIN to access your data.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="input"
              style={{ 
                textAlign: 'center', 
                fontSize: '24px', 
                letterSpacing: '8px',
                padding: '16px'
              }}
              placeholder="••••••"
              autoFocus
              maxLength={6}
            />
          </div>

          {error && (
            <div style={{ color: 'var(--red)', fontSize: '13px', marginBottom: '20px', fontWeight: 600 }}>
              {error}
            </div>
          )}

          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={checking || !pin}
            style={{ width: '100%', padding: '16px', fontSize: '16px' }}
          >
            {checking ? 'Verifying...' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  );
}
