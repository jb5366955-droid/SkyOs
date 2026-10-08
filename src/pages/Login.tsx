import React, { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, AlertTriangle, ShieldCheck, Cpu, Terminal, Radio } from 'lucide-react';

export const Login: React.FC = () => {
  const { signIn, user, loading: authLoading, isConfigured } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Si ya tiene sesión, redirigir al dashboard
  if (user && !authLoading) {
    const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('Por favor ingrese correo electrónico y contraseña.');
      return;
    }

    setSubmitting(true);
    const { error } = await signIn(email.trim(), password);
    setSubmitting(false);

    if (error) {
      setErrorMessage(error.message || 'Error al autenticar credenciales en Supabase.');
    } else {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
      navigate(from, { replace: true });
    }
  };

  return (
    <div className="hud-grid-background" style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      position: 'relative'
    }}>
      {/* Background HUD Decor */}
      <div style={{
        position: 'absolute',
        top: '1.5rem',
        left: '2rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.75rem',
        color: 'var(--text-dim)'
      }}>
        <Radio size={14} className="pulse-dot" style={{ color: 'var(--cyan-primary)' }} />
        <span>SYS.SURVEILLANCE // ACCESS POINT 01-A</span>
      </div>

      <div style={{
        position: 'absolute',
        top: '1.5rem',
        right: '2rem',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.75rem',
        color: 'var(--text-dim)',
        letterSpacing: '0.05em'
      }}>
        AUTH PROTOCOL: SUPABASE RBAC
      </div>

      {/* Main Login Card */}
      <div style={{ width: '100%', maxWidth: '440px' }}>
        {/* Warning banner if .env is missing or default */}
        {!isConfigured && (
          <div style={{
            marginBottom: '1rem',
            padding: '0.85rem 1rem',
            backgroundColor: 'rgba(255, 183, 3, 0.1)',
            border: '1px solid var(--amber-warn)',
            borderRadius: '2px',
            color: 'var(--amber-warn)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.78rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.65rem'
          }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>
                CONFIGURACIÓN SUPABASE PENDIENTE
              </div>
              Define <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en tu archivo <code>.env</code> para conectar con la base de datos de SkyOS.
            </div>
          </div>
        )}

        <div className="hud-panel" style={{ padding: '2.25rem 2rem' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              width: '56px',
              height: '56px',
              margin: '0 auto 1rem auto',
              backgroundColor: 'rgba(0, 229, 255, 0.08)',
              border: '1px solid var(--cyan-primary)',
              borderRadius: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--cyan-primary)',
              boxShadow: '0 0 20px var(--cyan-glow)'
            }}>
              <Cpu size={32} />
            </div>

            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: '#ffffff',
              margin: 0,
              lineHeight: 1.1
            }}>
              SKY<span style={{ color: 'var(--cyan-primary)' }}>OS</span>
            </h1>

            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: 'var(--text-tactical)',
              marginTop: '0.35rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase'
            }}>
              Centro de Control · Dron de Vigilancia
            </p>
          </div>

          {/* Subheader status bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.4rem 0.75rem',
            backgroundColor: 'rgba(5, 10, 20, 0.7)',
            border: '1px solid rgba(56, 189, 248, 0.15)',
            borderRadius: '2px',
            marginBottom: '1.5rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            color: 'var(--text-dim)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Terminal size={12} color="var(--cyan-primary)" />
              <span>TERMINAL AUTORIZADA</span>
            </div>
            <div style={{ color: 'var(--emerald-radar)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span className="pulse-dot" style={{ width: '5px', height: '5px' }}></span>
              LISTO
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div style={{
              marginBottom: '1.25rem',
              padding: '0.75rem 1rem',
              backgroundColor: 'rgba(255, 51, 102, 0.1)',
              border: '1px solid var(--crimson-crit)',
              borderRadius: '2px',
              color: '#ff99b3',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem'
            }}>
              <AlertTriangle size={16} color="var(--crimson-crit)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>{errorMessage}</div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label
                htmlFor="input-email"
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  marginBottom: '0.45rem',
                  letterSpacing: '0.05em'
                }}
              >
                CORREO DE OPERADOR
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="input-email"
                  type="email"
                  className="hud-input"
                  style={{ paddingLeft: '2.5rem' }}
                  placeholder="operador@skyos.mil"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
                <Mail size={16} style={{
                  position: 'absolute',
                  left: '0.85rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-dim)',
                  pointerEvents: 'none'
                }} />
              </div>
            </div>

            <div>
              <label
                htmlFor="input-password"
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  marginBottom: '0.45rem',
                  letterSpacing: '0.05em'
                }}
              >
                CLAVE DE ACCESO
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="input-password"
                  type="password"
                  className="hud-input"
                  style={{ paddingLeft: '2.5rem' }}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <Lock size={16} style={{
                  position: 'absolute',
                  left: '0.85rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-dim)',
                  pointerEvents: 'none'
                }} />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-tactical"
              style={{
                width: '100%',
                marginTop: '0.5rem',
                padding: '0.8rem 1rem'
              }}
              id="btn-login-submit"
            >
              {submitting ? (
                <>
                  <span className="pulse-dot" style={{ color: 'var(--cyan-primary)' }}></span>
                  <span>AUTENTICANDO...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={18} />
                  <span>AUTORIZAR ACCESO</span>
                </>
              )}
            </button>
          </form>

          {/* Roles reference info for evaluation */}
          <div style={{
            marginTop: '1.75rem',
            paddingTop: '1rem',
            borderTop: '1px solid rgba(56, 189, 248, 0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.7rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-dim)'
          }}>
            <span>ROLES DE SEGURIDAD:</span>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <span className="badge-role ADMIN" style={{ fontSize: '0.65rem' }}>ADMIN</span>
              <span className="badge-role USER" style={{ fontSize: '0.65rem' }}>USER</span>
              <span className="badge-role GUEST" style={{ fontSize: '0.65rem' }}>GUEST</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
