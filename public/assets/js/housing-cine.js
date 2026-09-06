/**
 * Scrollytelling + keyboard for the housing film.
 * Chapters live in the HTML. This file only drives place / metric / camera.
 */
(function (global) {
  "use strict";

  const HousingCine = {
    i: 0,
    lockUntil: 0,
    played: {},
    scenes: [],
    dash: null,

    bind(dash) {
      this.dash = dash;
      this.scenes = Array.prototype.slice.call(document.querySelectorAll(".cine-scene"));
      if (!this.scenes.length) return;
      this.buildRail();
      this.bindKeys();
      this.bindScroll();
      this.apply(0, { scroll: false, silent: true });
      document.body.classList.add("is-cine-ready");
    },

    reduce() {
      return global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    },

    buildRail() {
      const nav = document.getElementById("cine-progress");
      if (!nav) return;
      nav.innerHTML = this.scenes.map((el, i) => {
        const chap = (el.querySelector(".cine-chap") || {}).textContent || ("Scene " + (i + 1));
        const short = String(chap).split("·")[0].trim();
        return `<button type="button" class="cine-tick" data-i="${i}" aria-label="${esc(chap)}" title="${esc(chap)}"><span>${esc(short)}</span></button>`;
      }).join("");
      nav.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-i]");
        if (!btn) return;
        this.go(+btn.getAttribute("data-i"), { scroll: true });
      });
    },

    bindKeys() {
      document.addEventListener("keydown", (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const tag = (e.target && e.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target && e.target.isContentEditable)) return;
        const next = e.key === "ArrowDown" || e.key === "PageDown" || e.key === "j" || e.key === "J" || e.key === " ";
        const prev = e.key === "ArrowUp" || e.key === "PageUp" || e.key === "k" || e.key === "K";
        const home = e.key === "Home";
        const end = e.key === "End";
        if (next) { e.preventDefault(); this.go(this.i + 1, { scroll: true }); }
        else if (prev) { e.preventDefault(); this.go(this.i - 1, { scroll: true }); }
        else if (home) { e.preventDefault(); this.go(0, { scroll: true }); }
        else if (end) { e.preventDefault(); this.go(this.scenes.length - 1, { scroll: true }); }
      });
    },

    bindScroll() {
      let ticking = false;
      const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          if (Date.now() < this.lockUntil) return;
          const n = this.nearest();
          if (n != null && n !== this.i) this.apply(n, { scroll: false });
        });
      };
      window.addEventListener("scroll", onScroll, { passive: true });
    },

    nearest() {
      const line = innerHeight * 0.32;
      let best = 0;
      let bestDist = Infinity;
      this.scenes.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (r.bottom < 48 || r.top > innerHeight - 48) return;
        const anchor = r.top + Math.min(120, r.height * 0.18);
        const dist = Math.abs(anchor - line);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      return best;
    },

    go(i, opts) {
      i = Math.max(0, Math.min(this.scenes.length - 1, i));
      const reduce = this.reduce();
      if (opts && opts.scroll) {
        this.lockUntil = Date.now() + (reduce ? 80 : 720);
        this.scenes[i].scrollIntoView({
          behavior: reduce ? "auto" : "smooth",
          block: "start"
        });
      }
      this.apply(i, opts || {});
    },

    goPlace(place) {
      const i = this.scenes.findIndex((el) => el.getAttribute("data-place") === place);
      if (i >= 0) this.go(i, { scroll: true });
    },

    read(el) {
      return {
        place: el.getAttribute("data-place"),
        metric: el.getAttribute("data-metric"),
        select: el.getAttribute("data-select") || null,
        camera: el.getAttribute("data-camera") || "focus",
        focus: el.getAttribute("data-focus") || "map",
        play: el.getAttribute("data-play") === "1",
        id: el.id
      };
    },

    apply(i, opts) {
      if (!this.scenes[i]) return;
      this.i = i;
      this.scenes.forEach((el, n) => {
        el.classList.toggle("is-on", n === i);
        el.setAttribute("aria-current", n === i ? "true" : "false");
      });
      document.querySelectorAll(".cine-tick").forEach((btn) => {
        btn.classList.toggle("is-on", +btn.getAttribute("data-i") === i);
      });
      const scene = this.read(this.scenes[i]);
      document.body.dataset.scene = scene.id || "";
      document.body.dataset.focus = scene.focus;
      if (opts && opts.silent) return;
      if (this.dash && this.dash.applyScene) this.dash.applyScene(scene);
      if (scene.play && !this.played[scene.id] && this.dash && this.dash.playWalk) {
        this.played[scene.id] = true;
        if (!this.reduce()) {
          setTimeout(() => this.dash.playWalk(), 280);
        }
      }
    }
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  global.HousingCine = HousingCine;
})(window);
