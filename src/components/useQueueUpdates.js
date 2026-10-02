import { useCallback, useEffect, useRef, useState } from 'react';

export function useQueuePolling(load, onError) {
  const errorRef = useRef(onError);
  useEffect(() => { errorRef.current = onError; }, [onError]);
  useEffect(() => {
    let stopped = false;
    let interval;
    let controller;
    let first = true;
    const refresh = async () => {
      if (stopped || document.visibilityState === 'hidden' || controller) return;
      const request = new AbortController();
      controller = request;
      try { await load({ queueOnly: !first, signal: request.signal }); if (!request.signal.aborted) first = false; }
      catch (error) { if (error.name !== 'AbortError' && !stopped) errorRef.current(error.message); }
      finally { if (controller === request) controller = null; }
    };
    const resume = () => {
      clearInterval(interval);
      if (document.visibilityState === 'hidden') { controller?.abort(); controller = null; return; }
      refresh();
      interval = setInterval(refresh, 5000);
    };
    const suspend = () => { clearInterval(interval); controller?.abort(); controller = null; };
    resume();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', resume);
    window.addEventListener('pagehide', suspend);
    return () => {
      stopped = true; suspend();
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('pagehide', suspend);
    };
  }, [load]);
}

export function useQueueAudio(data, staffMode) {
  const [sound, setSound] = useState('waiting');
  const state = useRef({ audio: null, pending: new Map(), heard: new Set(), scope: '', busy: false, blocked: false, mounted: false });
  const drainRef = useRef(() => {});
  const drain = useCallback(async () => {
    const s = state.current;
    if (!s.mounted || s.busy || s.blocked || document.visibilityState === 'hidden' || !s.pending.size) return;
    const [key] = s.pending.keys();
    const audio = s.audio;
    const scope = s.scope;
    s.busy = true;
    audio.currentTime = 0;
    try {
      await audio.play();
      if (!s.mounted || s.audio !== audio || s.scope !== scope) { audio.pause(); return; }
      s.heard.add(key); s.pending.delete(key);
      try { sessionStorage.setItem(s.scope, JSON.stringify([...s.heard])); } catch { /* Private mode may disable storage. */ }
      setSound('ready');
    } catch (error) { s.busy = false; s.blocked = true; if (s.mounted) setSound(error.name === 'NotAllowedError' ? 'blocked' : 'error'); }
  }, []);
  useEffect(() => { drainRef.current = drain; }, [drain]);
  useEffect(() => {
    const s = state.current;
    s.mounted = true;
    s.audio = new Audio('/audio/coffee-call-bright.mp3');
    s.audio.preload = 'auto'; s.audio.loop = false;
    const ended = () => { s.busy = false; drainRef.current(); };
    const failed = () => { s.busy = false; s.blocked = true; setSound('error'); };
    const visibility = () => {
      if (document.visibilityState === 'hidden') { s.audio.pause(); s.busy = false; }
      // A fresh queue response on return decides which announcements are still needed.
    };
    s.audio.addEventListener('ended', ended);
    s.audio.addEventListener('error', failed);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      s.mounted = false; s.audio.pause(); s.pending.clear(); s.busy = false;
      s.audio.removeEventListener('ended', ended); s.audio.removeEventListener('error', failed);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    if (!data?.viewerId || !data.serviceDay) return;
    const s = state.current;
    const scope = `kathin-heard:${data.viewerId}:${staffMode ? 'staff' : 'member'}:${data.serviceDay}`;
    if (s.scope !== scope) {
      s.scope = scope; s.pending.clear(); s.heard = new Set();
      try { const saved = JSON.parse(sessionStorage.getItem(scope) || '[]'); if (Array.isArray(saved)) s.heard = new Set(saved); } catch { /* Ignore invalid storage. */ }
    }
    const calls = staffMode
      ? (data.currentCall?.status === 'accepted' ? [{ id: data.currentCall.orderId, accepted_at: data.currentCall.calledAt }] : [])
      : (data.orders || []).filter(o => o.service_day === data.serviceDay && o.status === 'accepted' && o.accepted_at);
    const active = new Set(calls.map(o => `${o.id}:${o.accepted_at}`));
    for (const key of s.pending.keys()) if (!active.has(key)) s.pending.delete(key);
    for (const key of active) if (!s.heard.has(key)) s.pending.set(key, true);
    drain();
  }, [data, staffMode, drain]);
  const enableSound = useCallback(async () => {
    const s = state.current;
    s.blocked = false;
    if (s.pending.size) { drain(); return; }
    if (s.busy || !s.audio) return;
    s.busy = true; s.audio.currentTime = 0;
    try { await s.audio.play(); setSound('ready'); }
    catch (error) { s.busy = false; s.blocked = true; setSound(error.name === 'NotAllowedError' ? 'blocked' : 'error'); }
  }, [drain]);
  return { sound, enableSound };
}
