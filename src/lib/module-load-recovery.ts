/** A stale document may reference a module removed by a new deployment. */
export const MODULE_LOAD_RECOVERY_SCRIPT = `(() => {
  const key = 'evermind:module-reload';
  const isModuleFailure = (message) => /Importing a module script failed|Failed to fetch dynamically imported module|Loading chunk .+ failed|error loading dynamically imported module/i.test(String(message || ''));
  const recover = () => {
    try {
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last < 60000) return false;
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
      return true;
    } catch { return false; }
  };
  window.addEventListener('vite:preloadError', (event) => { if (recover()) event.preventDefault(); });
  window.addEventListener('unhandledrejection', (event) => {
    if (isModuleFailure(event.reason?.message || event.reason) && recover()) event.preventDefault();
  });
  window.addEventListener('error', (event) => {
    const target = event.target;
    if ((target instanceof HTMLScriptElement && target.type === 'module') || isModuleFailure(event.message)) recover();
  }, true);
})();`;