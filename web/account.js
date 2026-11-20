(() => {
  // Keep OAuth cookies and callbacks on the canonical hosted origin.
  if (location.hostname === 'page-signal.vercel.app') location.replace('https://www.pagesignal.studio' + location.pathname + location.search + location.hash);
  let signingIn = false;
  let state = { configured: false, authRequired: true, authConfigured: false, user: null, providers: {} };
  const dialog = document.getElementById('account-dialog');
  const button = document.getElementById('account-button');
  const message = document.getElementById('account-message');
  function render() {
    button.hidden = state.authRequired === false;
    button.textContent = state.user ? 'Account · ' + (state.usage ? state.usage.remaining + ' requests left' : 'Signed in') : 'Sign in';
    document.getElementById('account-signed-in').hidden = !state.user;
    document.getElementById('account-sign-in').hidden = Boolean(state.user);
    document.getElementById('account-name').textContent = state.user?.email || '';
    document.getElementById('account-usage').textContent = state.usage
      ? `${state.usage.used} of ${state.usage.dailyLimit} AI requests used today. Resets at ${new Date(state.usage.resetsAt).toLocaleString()}. Each page extraction or question counts as one request; attempts can count even if extraction fails.` : '';
    document.getElementById('login-github').disabled = signingIn;
    document.getElementById('login-linkedin').hidden = !state.authConfigured || !state.providers.linkedin;
    document.getElementById('login-linkedin').disabled = signingIn || !state.authConfigured || !state.providers.linkedin;
    document.getElementById('email-submit').disabled = !state.authConfigured || !state.providers.email;
    document.getElementById('email-address').disabled = !state.authConfigured || !state.providers.email;
    document.getElementById('account-setup').hidden = state.authConfigured && Object.values(state.providers).some(Boolean);
    window.dispatchEvent(new CustomEvent('pagesignal:account', { detail: state }));
  }
  async function refresh() {
    try {
      const response = await fetch('/api/ai/status', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('Account service unavailable');
      state = { ...state, ...(await response.json()), statusUnavailable: false };
    } catch { state = { ...state, configured: false, user: null, authConfigured: false, providers: {}, statusUnavailable: true }; }
    render();return state;
  }
  async function post(path, body) {
    const response = await fetch('/api/auth/'+path, { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let data;try { data=await response.json(); } catch {}
    if (!response.ok) throw new Error('Sign-in could not complete. If you already have an account, use your original sign-in provider. Otherwise please try again.');
    return data;
  }
  button.addEventListener('click', () => { message.textContent='';dialog.showModal();void refresh(); });
  document.getElementById('account-close').addEventListener('click', () => dialog.close());
  for (const provider of ['github','linkedin']) document.getElementById('login-'+provider).addEventListener('click', async event => {
    if (window.pageSignalHasDocuments?.() && !confirm('Social sign-in reloads this tab. Export your results first; you will need to upload the original documents again. Continue?')) return;
    const target=event.currentTarget;signingIn=true;render();target.disabled=true;message.textContent='Opening secure sign-in…';
    try {
      const data = await post('sign-in/social', { provider, callbackURL: '/', errorCallbackURL: '/?signin=failed' });
      const url=new URL(data.url);
      if (url.protocol!=='https:') throw new Error('Invalid sign-in destination');
      location.assign(url.href);
    } catch (error) { signingIn=false;message.textContent=error.message;render(); }
  });
  document.getElementById('email-sign-in').addEventListener('submit', async event => {
    event.preventDefault();const submit=document.getElementById('email-submit');submit.disabled=true;
    message.textContent='Sending sign-in link…';
    try {
      await post('sign-in/magic-link', { email: document.getElementById('email-address').value.trim(), callbackURL: '/', errorCallbackURL: '/?signin=failed' });
      message.textContent='If this address can sign in, a one-time link will arrive shortly. Check your inbox and spam folder. It expires in 10 minutes. Return to this tab after signing in.';
    } catch (error) { message.textContent=error.message; }
    finally { render(); }
  });
  document.getElementById('sign-out').addEventListener('click', async () => {
    try { await post('sign-out', {});state={...state,user:null,statusUnavailable:false};render();await refresh();message.textContent='You are signed out.'; }
    catch (error) { message.textContent=error.message; }
  });
  window.addEventListener('focus', () => { void refresh(); });
  window.PageSignalAccount = {
    get state() { return state; }, refresh,
    async ensureSignedIn() {
      await ready;
      if (state.statusUnavailable) await refresh();
      if (state.authRequired === false || state.user) return true;
      message.textContent='Sign in with an available provider to upload documents. After signing in, choose or drop your files again.';
      if (!dialog.open) dialog.showModal();
      return false;
    }
  };
  const ready=refresh();window.PageSignalAccount.ready=ready;
  if (new URLSearchParams(location.search).get('signin')==='failed') {
    message.textContent='Sign-in failed or the link expired. Please try again.';dialog.showModal();
  }
})();
