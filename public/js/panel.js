function widgetUrl() {
  const origin = (typeof window !== 'undefined' && window.location && window.location.origin)
    ? window.location.origin.replace(/\/$/, '')
    : 'http://localhost';
  const w = store?.state?.config?.widget || {};
  const q = [];
  const ch = currentChannel || store?.state?.config?.channel;
  if (ch) q.push('channel=' + encodeURIComponent(ch));
  if (w.playAudio === 0) q.push('audio=0');
  if (w.layout) q.push('layout=' + encodeURIComponent(w.layout));
  if (w.theme) q.push('theme=' + encodeURIComponent(w.theme));
  if (w.scale && Number(w.scale) !== 100) q.push('scale=' + encodeURIComponent(w.scale));
  if (w.accent) q.push('accent=' + encodeURIComponent(w.accent));
  if (w.bg) q.push('bg=' + encodeURIComponent(w.bg));
  if (w.opacity !== undefined) q.push('opacity=' + encodeURIComponent(w.opacity));
  if (w.text && w.text !== '#ffffff') q.push('text=' + encodeURIComponent(w.text));
  if (w.video && w.video !== 'off') q.push('video=' + encodeURIComponent(w.video));
  if (w.hideIdle) q.push('hideIdle=1');
  if (w.showArt === 0) q.push('art=0');
  if (w.showEq === 0) q.push('eq=0');
  if (w.showProgress === 0) q.push('prog=0');
  if (w.showRequester === 0) q.push('req=0');
  if (w.showQueue === 0) q.push('queue=0');
  if (w.showHint === 0) q.push('hint=0');
  if (w.showLogo === 0) q.push('logo=0');
  if (w.marquee === 0) q.push('marquee=0');
  return origin + '/widget' + (q.length ? '?' + q.join('&') : '');
}
