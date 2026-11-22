/**
 * Módulo de Audio Táctico para SkyOS
 * Utiliza exclusivamente la Web Audio API nativa (sin librerías ni archivos externos).
 * Sintetiza tonos suaves y no intrusivos para alertas CRITICAL / EMERGENCY.
 */

const SOUND_STORAGE_KEY = 'skyos_sound_enabled';

let soundEnabledCache: boolean | null = null;
const listeners = new Set<(enabled: boolean) => void>();

/**
 * Retorna si el sonido está habilitado.
 * Por defecto está APAGADO (false) según los requerimientos de SkyOS.
 */
export function isSoundEnabled(): boolean {
  if (soundEnabledCache !== null) return soundEnabledCache;
  const stored = localStorage.getItem(SOUND_STORAGE_KEY);
  soundEnabledCache = stored === 'true';
  return soundEnabledCache;
}

/**
 * Cambia el estado de sonido y notifica a los suscriptores.
 */
export function setSoundEnabled(enabled: boolean): void {
  soundEnabledCache = enabled;
  localStorage.setItem(SOUND_STORAGE_KEY, enabled ? 'true' : 'false');
  listeners.forEach((callback) => {
    try {
      callback(enabled);
    } catch (err) {
      console.warn('[SkyOS Sound] Error en suscriptor de sonido:', err);
    }
  });
}

/**
 * Alterna el estado actual de sonido.
 */
export function toggleSoundEnabled(): boolean {
  const next = !isSoundEnabled();
  setSoundEnabled(next);
  return next;
}

/**
 * Suscribe un componente a cambios en la configuración de sonido.
 */
export function subscribeSoundEnabled(callback: (enabled: boolean) => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Emite un tono táctico suave de advertencia utilizando osciladores con envolvente sinusoidal.
 * Diseñado específicamente para ser agradable al oído y no generar sobresaltos.
 */
export function playTacticalAlertSound(): void {
  if (!isSoundEnabled()) return;

  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Tono primario: barrido de frecuencia suave 540 Hz -> 780 Hz
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(540, now);
    osc1.frequency.exponentialRampToValueAtTime(780, now + 0.14);

    // Tono armónico secundario para calidez acústica
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(270, now);
    osc2.frequency.exponentialRampToValueAtTime(390, now + 0.14);

    // Envolvente de volumen muy suave (fade in rápido de 30ms, fade out suave de 220ms)
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.09, now + 0.035);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.3);
    osc2.stop(now + 0.3);

    // Cierre limpio del contexto para liberar recursos
    setTimeout(() => {
      try {
        ctx.close();
      } catch {
        // Silencioso
      }
    }, 450);
  } catch (err) {
    console.warn('[SkyOS Sound] No se pudo reproducir alerta acústica:', err);
  }
}
