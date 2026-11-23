/**
 * Utilidades para formateo y presentación de errores de Supabase y de red en SkyOS.
 */

export function formatSupabaseError(error: any, fallbackMessage = 'Error en la operación'): string {
  console.error('[SkyOS Supabase Error]:', error);

  if (!error) return fallbackMessage;

  const isAccessDenied = String(error.code) === '42501';
  const parts: string[] = [];

  // 1. Mensaje real (error.message)
  const messageText = error.message || fallbackMessage;
  parts.push(messageText);

  // 2. Código (error.code)
  if (error.code) {
    parts.push(`[Código: ${error.code}]`);
  }

  // 3. Detalles (error.details)
  if (error.details) {
    parts.push(`Detalles: ${error.details}`);
  }

  // 4. Pista opcional (error.hint)
  if (error.hint) {
    parts.push(`Pista: ${error.hint}`);
  }

  const baseText = parts.join(' - ');

  // Solo si el código es 42501 antepón "ACCESO DENEGADO: "
  if (isAccessDenied) {
    return `ACCESO DENEGADO: ${baseText}`;
  }

  return baseText;
}
