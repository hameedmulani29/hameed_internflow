import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/* ============ Reduced motion preference ============ */

function subscribeMotionPref(callback) {
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getMotionPref() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getMotionPrefServer() {
  return false;
}

export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribeMotionPref, getMotionPref, getMotionPrefServer);
}

/* ============ Scroll reveal (IntersectionObserver) ============ */

export function useRevealAll() {
  const containerRef = useRef(null);

  useEffect(() => {
    const rootEl = containerRef.current || document;
    const targets = rootEl.querySelectorAll('[data-reveal]');
    if (targets.length === 0) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-revealed'));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return containerRef;
}

/* ============ Global scroll progress (0 → 1) ============ */

export function useScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return progress;
}

/* ============ Header scrolled state ============ */

export function useScrolled(threshold = 16) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  return scrolled;
}

/* ============ Scroll spy — highlights nav for section in view ============ */

export function useScrollSpy(idsString, enabled = true) {
  const [activeId, setActiveId] = useState(null);

  useEffect(() => {
    if (!enabled || !idsString) {
      const clear = window.setTimeout(() => setActiveId(null), 0);
      return () => window.clearTimeout(clear);
    }

    const ids = idsString.split(',');
    let frame = 0;
    let fallbackTimer = 0;
    let pending = false;

    const update = () => {
      frame = 0;
      const marker = window.innerHeight * 0.35;
      let current = null;
      let bestTop = -Infinity;
      // Pick the section whose top is closest to the marker from above
      // (order-independent, so nav order need not match document order)
      ids.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const top = el.getBoundingClientRect().top;
        if (top <= marker && top > bestTop) {
          bestTop = top;
          current = id;
        }
      });
      // At (or near) page bottom, force the last section active
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        const lastId = ids[ids.length - 1];
        if (document.getElementById(lastId)) current = lastId;
      }
      setActiveId((prev) => (prev === current ? prev : current));
    };

    // requestAnimationFrame is suspended in hidden tabs, so pair it with a
    // short timeout fallback — otherwise programmatic scrolls (nav clicks,
    // restored scroll position) would never update the spy.
    const run = () => {
      if (!pending) return;
      pending = false;
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = 0;
      }
      update();
    };

    const schedule = () => {
      if (pending) return;
      pending = true;
      frame = window.requestAnimationFrame(run);
      fallbackTimer = window.setTimeout(run, 120);
    };

    const onScroll = () => schedule();

    schedule();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [idsString, enabled]);

  return activeId;
}

/* ============ Cursor glow (hero) ============ */

export function useCursorGlow(reducedMotion) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion) return undefined;
    if (window.matchMedia('(hover: none)').matches) return undefined;

    let frame = 0;
    let x = 0;
    let y = 0;
    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
      if (!frame) {
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          el.style.setProperty('--glow-x', `${x}px`);
          el.style.setProperty('--glow-y', `${y}px`);
          el.classList.add('glow-active');
        });
      }
    };
    const onLeave = () => el.classList.remove('glow-active');

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [reducedMotion]);

  return ref;
}

/* ============ Subtle parallax (hero visual) ============ */

export function useHeroParallax(reducedMotion, strength = 18) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion) return undefined;

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const rect = el.getBoundingClientRect();
        const ratio = Math.max(-0.3, Math.min(0.3, rect.top / window.innerHeight));
        el.style.transform = `translateY(${(-ratio * strength).toFixed(1)}px)`;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, [reducedMotion, strength]);

  return ref;
}

/* ============ Magnetic buttons ============ */

export function useMagnetic(reducedMotion, maxShift = 5) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion) return undefined;
    if (window.matchMedia('(hover: none)').matches) return undefined;

    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      const dx = ((e.clientX - rect.left) / rect.width - 0.5) * 2 * maxShift;
      const dy = ((e.clientY - rect.top) / rect.height - 0.5) * 2 * maxShift;
      el.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    };
    const onLeave = () => {
      el.style.transform = 'translate(0, 0)';
    };

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [reducedMotion, maxShift]);

  return ref;
}

/* ============ Workflow scroll activation ============ */

const WORKFLOW_STEP_COUNT = 7;

export function useWorkflowScroll(reducedMotion, stepCount = WORKFLOW_STEP_COUNT) {
  const sectionRef = useRef(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return undefined;

    if (reducedMotion) {
      const settle = window.setTimeout(() => setProgress(1), 0);
      return () => window.clearTimeout(settle);
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when the node row enters the lower third, 1 once it passes the upper third
      const raw = (vh * 0.75 - rect.top) / (vh * 0.55);
      setProgress(Math.max(0, Math.min(1, raw)));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [reducedMotion]);

  const totalSegments = stepCount - 1;
  const activeNodeCount = progress === 0 ? 1 : Math.min(stepCount, Math.max(1, Math.ceil(progress * stepCount)));
  const pathFraction = Math.min(1, progress * (stepCount / totalSegments));
  const pulseFraction = Math.min(1, Math.max(0, (progress - 0.04) * (stepCount / totalSegments)));
  const activeIndex = Math.min(stepCount - 1, Math.floor(progress * stepCount));

  return {
    sectionRef,
    progress,
    activeNodeCount,
    pathFraction,
    pulseFraction,
    activeIndex,
    totalSegments
  };
}
