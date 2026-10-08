import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Radio } from 'lucide-react';

export const ProtectedRoute: React.FC = () => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="hud-grid-background" style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '1.25rem'
      }}>
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            border: '2px solid rgba(0, 229, 255, 0.2)',
            borderTopColor: 'var(--cyan-primary)',
            animation: 'spin 1s linear infinite'
          }} />
          <Radio size={24} style={{ position: 'absolute', color: 'var(--cyan-primary)' }} />
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          color: 'var(--cyan-primary)',
          fontSize: '0.85rem',
          letterSpacing: '0.1em',
          textTransform: 'uppercase'
        }}>
          Verificando credenciales de acceso...
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
};
