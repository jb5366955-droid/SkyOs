import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { AuthContextType, UserProfile, UserRole } from '../types/auth.types';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Obtener el perfil y rol del usuario desde la tabla user_profiles
  const fetchProfile = useCallback(async (userId: string, currentUser?: User | null): Promise<UserProfile | null> => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, full_name, role, created_at, updated_at')
        .eq('id', userId)
        .single();

      if (error) {
        console.warn('[SkyOS Auth] No se pudo leer user_profiles o perfil inexistente:', error.message);
        // Fallback preventivo si el trigger no terminó de insertar el perfil
        if (currentUser) {
          const fallbackProfile: UserProfile = {
            id: userId,
            email: currentUser.email || '',
            full_name: (currentUser.user_metadata?.full_name as string) || currentUser.email?.split('@')[0] || 'Operador',
            role: 'GUEST',
          };
          setProfile(fallbackProfile);
          setRole('GUEST');
          return fallbackProfile;
        }
        setProfile(null);
        setRole(null);
        return null;
      }

      if (data) {
        const userProfile: UserProfile = {
          id: data.id,
          email: data.email,
          full_name: data.full_name,
          role: data.role as UserRole,
          created_at: data.created_at,
          updated_at: data.updated_at,
        };
        setProfile(userProfile);
        setRole(userProfile.role);
        return userProfile;
      }
    } catch (err) {
      console.error('[SkyOS Auth] Error inesperado consultando perfil:', err);
    }
    return null;
  }, []);

  // Inicializar sesión y escuchar cambios de autenticación
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      try {
        if (!isSupabaseConfigured) {
          if (isMounted) setLoading(false);
          return;
        }

        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('[SkyOS Auth] Error al obtener sesión inicial:', error);
        }

        if (isMounted) {
          setSession(initialSession);
          setUser(initialSession?.user ?? null);
          if (initialSession?.user) {
            await fetchProfile(initialSession.user.id, initialSession.user);
          }
        }
      } catch (err) {
        console.error('[SkyOS Auth] Error en inicialización:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initAuth();

    // Suscripción reactiva a eventos de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      if (!isMounted) return;

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        await fetchProfile(currentSession.user.id, currentSession.user);
      } else {
        setProfile(null);
        setRole(null);
      }

      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setLoading(false);
        return { error };
      }

      if (data.user) {
        await fetchProfile(data.user.id, data.user);
      }

      setLoading(false);
      return { error: null };
    } catch (err) {
      setLoading(false);
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      setProfile(null);
      setRole(null);
      setLoading(false);
      return { error };
    } catch (err) {
      setLoading(false);
      return { error: err as Error };
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id, user);
    }
  };

  const value: AuthContextType = {
    user,
    session,
    profile,
    role,
    loading,
    isConfigured: isSupabaseConfigured,
    signIn,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
};
