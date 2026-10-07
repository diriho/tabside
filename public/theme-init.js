// Apply the saved theme before first paint to avoid a flash. External (not inline) so the
// Content-Security-Policy can forbid inline scripts.
try {
  var t = localStorage.getItem('tabside-theme')
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t
} catch (e) {}
