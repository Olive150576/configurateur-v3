/**
 * wrap — Enveloppe les handlers IPC pour normaliser les réponses
 * Retourne toujours { ok, data } ou { ok: false, error }
 * Le renderer sait toujours si l'opération a réussi ou échoué.
 */

global.wrap = async function wrap(fn) {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (error) {
    console.error('[IPC Error]', error.message);
    return {
      ok: false,
      error: error.message,
      errors: error.errors || [error.message],
    };
  }
};
