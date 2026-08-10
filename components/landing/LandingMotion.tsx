"use client";

import { useEffect } from "react";

// Behaviour for the landing page, ported from the design project's own script
// ("Bridgetx Landing v2.dc.html"). It runs against data-attributes rather than
// owning any markup, which keeps app/page.tsx a server component — the page is
// static marketing content and should not ship as a client bundle.
//
// The design ran inside a canvas runtime (support.js / DCLogic). That runtime is
// authoring scaffolding and is deliberately NOT carried over; only the six
// behaviours it drove are:
//   field()     — the pointer-reactive SVG bridge in the hero
//   ctaMagnet() — the CTA glow that leans toward the cursor
//   counters()  — count-up numerals on first view
//   steps()     — staggered reveal of the three how-it-works steps
//   tabs()      — the data-stream tab switcher
//   motion      — the --rv distance the rise keyframe travels
//
// Every listener is removed and every rAF cancelled on unmount.
export default function LandingMotion() {
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    document.documentElement.style.setProperty("--rv", reduced ? "0px" : "22px");

    /* ------------------------------ stream tabs ---------------------------- */
    const tabs = Array.from(document.querySelectorAll<HTMLElement>("[data-stab]"));
    const panels = Array.from(document.querySelectorAll<HTMLElement>("[data-spanel]"));
    const pick = (i: string) => {
      tabs.forEach((t) => {
        const on = t.dataset.stab === i;
        t.style.background = on ? "rgba(255,255,255,.07)" : "transparent";
        t.style.color = on ? "#fff" : "rgba(255,255,255,.5)";
        t.setAttribute("aria-selected", String(on));
      });
      panels.forEach((p) => {
        const on = p.dataset.spanel === i;
        p.style.opacity = on ? "1" : "0";
        p.style.pointerEvents = on ? "auto" : "none";
      });
    };
    tabs.forEach((t) => {
      const onClick = () => pick(t.dataset.stab ?? "0");
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
      };
      t.addEventListener("click", onClick);
      t.addEventListener("keydown", onKey);
      cleanups.push(() => { t.removeEventListener("click", onClick); t.removeEventListener("keydown", onKey); });
    });

    /* ------------------------------- counters ------------------------------ */
    const counted = Array.from(document.querySelectorAll<HTMLElement>("[data-count]"));
    if (counted.length) {
      const timers: number[] = [];
      const run = (el: HTMLElement) => {
        if (el.dataset.counted) return;
        el.dataset.counted = "1";
        const target = parseFloat(el.dataset.count ?? "");
        if (!isFinite(target)) return;
        if (reduced) { el.textContent = Math.round(target).toLocaleString("en-US"); return; }
        const dur = 1100, t0 = performance.now();
        const id = window.setInterval(() => {
          const p = Math.min(1, (performance.now() - t0) / dur);
          el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString("en-US");
          if (p >= 1) window.clearInterval(id);
        }, 16);
        timers.push(id);
      };
      const io = new IntersectionObserver(
        (es) => es.forEach((e) => { if (e.isIntersecting) { run(e.target as HTMLElement); io.unobserve(e.target); } }),
        { threshold: 0.35 }
      );
      counted.forEach((el) => io.observe(el));
      cleanups.push(() => { io.disconnect(); timers.forEach((t) => window.clearInterval(t)); });
    }

    /* -------------------------------- steps -------------------------------- */
    const stepsWrap = document.querySelector<HTMLElement>("[data-steps]");
    if (stepsWrap) {
      const els = Array.from(stepsWrap.querySelectorAll<HTMLElement>("[data-seq]"));
      const delays = [0.1, 0, 0.2, 0.38, 0.58, 0.76, 0.96];
      els.forEach((el, i) => {
        // animation-timeline / animation-range are scroll-driven-animation
        // properties; TS lib.dom has no typings for them yet, so set them
        // through setProperty rather than casting the whole style object.
        el.style.setProperty("animation-timeline", "auto");
        el.style.setProperty("animation-range", "normal");
        el.style.animationDelay = (delays[i] ?? 0) + "s";
        el.style.animationPlayState = "paused";
      });
      const io = new IntersectionObserver(
        (es) => es.forEach((e) => {
          if (!e.isIntersecting) return;
          els.forEach((el) => { el.style.animationPlayState = "running"; });
          io.disconnect();
        }),
        { threshold: 0.25 }
      );
      io.observe(stepsWrap);
      cleanups.push(() => io.disconnect());
    }

    if (reduced) return () => cleanups.forEach((f) => f());

    /* --------------------------- hero bridge field ------------------------- */
    const root = document.querySelector<HTMLElement>("[data-field]");
    if (root) {
      const svg = root.querySelector("svg");
      const glow = root.querySelector<HTMLElement>("[data-glow]");
      const el = (sel: string) => root.querySelector(sel);
      const st = { rise: 82, mx: 210, near: 0, cx: 0, cy: 0, live: false, p: [0.02, 0.27, 0.52, 0.77] };
      let last = performance.now();
      let raf = 0;
      const onMove = (e: PointerEvent) => {
        if (!svg) return;
        const r = svg.getBoundingClientRect();
        st.cx = ((e.clientX - r.left) / r.width) * 420;
        st.cy = ((e.clientY - r.top) / r.height) * 340;
        st.live = true;
      };
      const onLeave = () => { st.live = false; };
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("blur", onLeave);

      const tick = () => {
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const t = now / 1000;
        const on = st.live && st.cx > -120 && st.cx < 540 && st.cy > -120 && st.cy < 460;
        st.near += ((on ? 1 : 0) - st.near) * 0.06;
        const targetRise = on ? Math.max(30, Math.min(150, 300 - st.cy)) : 88 + Math.sin(t * 0.26) * 34;
        st.rise += (targetRise - st.rise) * 0.07;
        st.mx += ((on ? st.cx : 210 + Math.sin(t * 0.2) * 150) - st.mx) * 0.07;
        const lowY = 284;
        const deckY = (x: number) => { const u = (x - 30) / 360; return lowY - st.rise * u * u * (3 - 2 * u); };
        const archY = (x: number) => { const u = (x - 30) / 360; return deckY(x) - 128 * Math.sin(Math.PI * u) - 8; };
        let d = "", ad = "", hg = "", hl = "";
        for (let x = 30; x <= 390; x += 8) {
          d += (d ? "L" : "M") + x + " " + deckY(x).toFixed(1);
          ad += (ad ? "L" : "M") + x + " " + archY(x).toFixed(1);
        }
        for (let x = 54; x <= 366; x += 26) {
          const seg = "M" + x + " " + archY(x).toFixed(1) + "L" + x + " " + deckY(x).toFixed(1);
          hg += seg;
          if (Math.exp(-Math.abs(x - st.mx) / 52) > 0.06) hl += seg;
        }
        el("[data-deck]")?.setAttribute("d", d);
        el("[data-arch]")?.setAttribute("d", ad);
        el("[data-hangers]")?.setAttribute("d", hg);
        el("[data-hangerlit]")?.setAttribute("d", hl);
        el("[data-hangerlit]")?.setAttribute("opacity", (0.25 + st.near * 0.55).toFixed(3));
        el("[data-perflabel]")?.setAttribute("y", (deckY(390) + 26).toFixed(1));
        root.querySelectorAll("[data-adot]").forEach((dot, i) => {
          const x0 = 30 + st.p[i] * 360;
          const slope = (deckY(x0 + 6) - deckY(x0 - 6)) / 12;
          const f = Math.max(0.6, Math.min(1.9, 1 - slope * 3.4));
          st.p[i] = (st.p[i] + dt * (0.048 + i * 0.003) * f * (1 + st.near * 0.3)) % 1;
          const x = 30 + st.p[i] * 360;
          dot.setAttribute("cx", x.toFixed(1));
          dot.setAttribute("cy", (deckY(x) - 8).toFixed(1));
        });
        if (glow) {
          glow.style.transform =
            "translate3d(" + ((st.mx - 210) * 0.12).toFixed(1) + "px," + (-st.rise * 0.18).toFixed(1) + "px,0) scale(" +
            (1 + st.near * 0.08).toFixed(3) + ")";
        }
        raf = requestAnimationFrame(tick);
      };
      tick();
      cleanups.push(() => {
        cancelAnimationFrame(raf);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("blur", onLeave);
      });
    }

    /* ------------------------------ CTA magnet ----------------------------- */
    const btn = document.querySelector<HTMLElement>("[data-cta-btn]");
    const ctaGlow = document.querySelector<HTMLElement>("[data-cta-glow]");
    const section = document.getElementById("demo");
    if (btn && section) {
      let px = 0, py = 0, prox = 0, tx = 0, ty = 0, tp = 0, raf = 0;
      const t0 = performance.now();
      const onMove = (e: PointerEvent) => {
        const b = btn.getBoundingClientRect();
        const dx = e.clientX - (b.left + b.width / 2);
        const dy = e.clientY - (b.top + b.height / 2);
        const near = Math.hypot(dx, dy);
        tp = near > 150 ? 0 : Math.pow(1 - near / 150, 1.4);
        const pull = Math.pow(tp, 1.6);
        tx = Math.max(-16, Math.min(16, dx * 0.22 * pull));
        ty = Math.max(-12, Math.min(12, dy * 0.22 * pull));
      };
      const onLeave = () => { tx = 0; ty = 0; tp = 0; };
      window.addEventListener("pointermove", onMove, { passive: true });
      section.addEventListener("pointerleave", onLeave);
      window.addEventListener("blur", onLeave);
      const tick = () => {
        px += (tx - px) * 0.12;
        py += (ty - py) * 0.12;
        prox += (tp - prox) * 0.09;
        const breathe = Math.sin(((performance.now() - t0) / 16000) * Math.PI * 2);
        if (ctaGlow) {
          ctaGlow.style.transform =
            "translate3d(" + px * 2.6 + "px," + (py * 2.2 - prox * 26) + "px,0) scale(" + (1 + prox * 0.12 + breathe * 0.05) + ")";
          ctaGlow.style.opacity = String(0.7 + prox * 0.45 + breathe * 0.15);
        }
        raf = requestAnimationFrame(tick);
      };
      tick();
      cleanups.push(() => {
        cancelAnimationFrame(raf);
        window.removeEventListener("pointermove", onMove);
        section.removeEventListener("pointerleave", onLeave);
        window.removeEventListener("blur", onLeave);
      });
    }

    return () => cleanups.forEach((f) => f());
  }, []);

  return null;
}
