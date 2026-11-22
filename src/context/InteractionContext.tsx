import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { isSoundEnabled, setSoundEnabled, subscribeSoundEnabled } from '../lib/sound';

interface InteractionContextType {
  // Paleta de comandos (Ctrl+K)
  isPaletteOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;

  // Panel lateral de ayuda "¿Qué estoy viendo?" (?)
  isHelpOpen: boolean;
  openHelp: () => void;
  closeHelp: () => void;
  toggleHelp: () => void;

  // Recorrido guiado (5 pasos)
  isTourActive: boolean;
  startTour: () => void;
  endTour: () => void;

  // Interruptor de sonidos suaves
  soundEnabled: boolean;
  toggleSound: () => void;

  // Atajos tácticos en secuencia (G -> K, M, R, F)
  pendingKeySequence: string | null;
}

const InteractionContext = createContext<InteractionContextType | undefined>(undefined);

export const InteractionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();

  // Estados de modales y paneles
  const [isPaletteOpen, setIsPaletteOpen] = useState<boolean>(false);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
  const [isTourActive, setIsTourActive] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => isSoundEnabled());
  const [pendingKeySequence, setPendingKeySequence] = useState<string | null>(null);

  const sequenceTimeoutRef = useRef<number | null>(null);

  // Sincronización de sonido
  useEffect(() => {
    return subscribeSoundEnabled((enabled) => {
      setSoundEnabledState(enabled);
    });
  }, []);

  const toggleSound = useCallback(() => {
    const next = !soundEnabled;
    setSoundEnabled(next);
  }, [soundEnabled]);

  const openPalette = useCallback(() => setIsPaletteOpen(true), []);
  const closePalette = useCallback(() => setIsPaletteOpen(false), []);
  const togglePalette = useCallback(() => setIsPaletteOpen((prev) => !prev), []);

  const openHelp = useCallback(() => setIsHelpOpen(true), []);
  const closeHelp = useCallback(() => setIsHelpOpen(false), []);
  const toggleHelp = useCallback(() => setIsHelpOpen((prev) => !prev), []);

  const startTour = useCallback(() => {
    setIsHelpOpen(false);
    setIsPaletteOpen(false);
    setIsTourActive(true);
  }, []);

  const endTour = useCallback(() => {
    setIsTourActive(false);
    localStorage.setItem('skyos_tour_completed', 'true');
  }, []);

  // Verificar primer ingreso para lanzar el recorrido guiado automáticamente
  useEffect(() => {
    const hasCompletedTour = localStorage.getItem('skyos_tour_completed');
    if (!hasCompletedTour) {
      // Pequeño retardo para dar tiempo a renderizar la vista inicial
      const timer = window.setTimeout(() => {
        setIsTourActive(true);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, []);

  // Manejo de atajos globales de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement ||
        activeEl?.getAttribute('contenteditable') === 'true';

      // 1. Atajo Ctrl+K o Cmd+K para Paleta de Comandos
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        togglePalette();
        return;
      }

      // 2. Escape: cierra paleta o panel de ayuda
      if (e.key === 'Escape') {
        if (isPaletteOpen) {
          e.preventDefault();
          closePalette();
          return;
        }
        if (isHelpOpen) {
          e.preventDefault();
          closeHelp();
          return;
        }
      }

      // Si está escribiendo en un input, ignorar atajos de un solo carácter
      if (isInput) return;

      // 3. Atajo '?' abre la ayuda interactiva
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        toggleHelp();
        return;
      }

      // 4. Atajos en secuencia: 'g' seguido de 'k', 'm', 'r', 'f'
      const key = e.key.toLowerCase();

      if (pendingKeySequence === 'g') {
        // Segunda tecla de la secuencia
        if (sequenceTimeoutRef.current) {
          clearTimeout(sequenceTimeoutRef.current);
          sequenceTimeoutRef.current = null;
        }
        setPendingKeySequence(null);

        switch (key) {
          case 'k':
            e.preventDefault();
            navigate('/kernel');
            break;
          case 'm':
            e.preventDefault();
            navigate('/memoria');
            break;
          case 'r':
            e.preventDefault();
            navigate('/ruta');
            break;
          case 'f':
            e.preventDefault();
            navigate('/fallos');
            break;
          case 'p':
            e.preventDefault();
            navigate('/processes');
            break;
          case 'd':
            e.preventDefault();
            navigate('/gemelo');
            break;
          case 'b':
            e.preventDefault();
            navigate('/benchmark');
            break;
          case 'h':
            e.preventDefault();
            navigate('/');
            break;
          default:
            // Tecla no reconocida para la secuencia, simplemente se cancela
            break;
        }
        return;
      }

      if (key === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Primera tecla 'g' presionada: esperamos la segunda tecla
        setPendingKeySequence('g');
        if (sequenceTimeoutRef.current) {
          clearTimeout(sequenceTimeoutRef.current);
        }
        sequenceTimeoutRef.current = window.setTimeout(() => {
          setPendingKeySequence(null);
        }, 1500);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (sequenceTimeoutRef.current) clearTimeout(sequenceTimeoutRef.current);
    };
  }, [
    isPaletteOpen,
    isHelpOpen,
    pendingKeySequence,
    togglePalette,
    closePalette,
    toggleHelp,
    closeHelp,
    navigate,
  ]);

  return (
    <InteractionContext.Provider
      value={{
        isPaletteOpen,
        openPalette,
        closePalette,
        togglePalette,
        isHelpOpen,
        openHelp,
        closeHelp,
        toggleHelp,
        isTourActive,
        startTour,
        endTour,
        soundEnabled,
        toggleSound,
        pendingKeySequence,
      }}
    >
      {children}
    </InteractionContext.Provider>
  );
};

export const useInteraction = (): InteractionContextType => {
  const context = useContext(InteractionContext);
  if (!context) {
    throw new Error('useInteraction debe usarse dentro de un InteractionProvider');
  }
  return context;
};
