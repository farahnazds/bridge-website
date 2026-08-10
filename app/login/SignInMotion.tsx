"use client";

import { useEffect } from "react";

// The sign-in backdrop's pointer parallax, ported from the design project's
// own script ("Bridgetx Sign In.dc.html", glow()). The orb eases toward the
// cursor and the SVG bridge layer counter-shifts, which is what gives the
// backdrop depth.
//
// Operates on data attributes so the page itself stays a server component.
// Skipped entirely under prefers-reduced-motion — this is decorative, and a
// continuous rAF loop is exactly what that preference is asking us not to run.
export default function SignInMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const page = document.querySelector<HTMLElement>("[data-page]");
    const orb = page?.querySelector<HTMLElement>("[data-glow]");
    if (!page || !orb) return;
    const par = page.querySelector<HTMLElement>("[data-parallax]");

    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const onMove = (e: PointerEvent) => {
      const r = page.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 64;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 44;
    };
    const tick = () => {
      cx += (tx - cx) * 0.05;
      cy += (ty - cy) * 0.05;
      orb.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0)`;
      if (par) par.style.transform = `translate3d(${(-cx * 0.34).toFixed(1)}px,${(-cy * 0.28).toFixed(1)}px,0)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return null;
}
