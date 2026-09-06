/**
 * Scrollytelling: chapters drive place, metric, and a bounds camera.
 * Scroll progress inside a chapter eases the zoom; j/k flies to the landing.
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
      this.apply(0, { fly: false });
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
        this.go(+btn.getAttribute("data-i"), { fly: true });
      });
    },

    bindKeys() {
      document.addEventListener("keydown", (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const tag = (e.target && e.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target && e.target.isContentEditable)) return;
        const next = e.key === "ArrowDown" || e.key === "PageDown" || e.key === "j" || e.key === "J" || e.key === " ";
        const prev = e.key === "ArrowUp" || e.key === "PageUp" || e.key === "k" || e.key === "K";
        if (next) { e.preventDefault(); this.go(this.i + 1, { fly: true }); }
        else if (prev) { e.preventDefault(); this.go(this.i - 1, { fly: true }); }
        else if (e.key === "Home") { e.preventDefault(); this.go(0, { fly: true }); }
        else if (e.key === "End") { e.preventDefault(); this.go(this.scenes.length - 1, { fly: true }); }
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
          if (n != null && n !== this.i) this.apply(n, { fly: false });
          this.scrubCamera();
        });
      };
      window.addEventListener("scroll", onScroll, { passive: true });
    },

    nearest() {
      const line = innerHeight * 0.36;
      let best = 0;
      let bestDist = Infinity;
      this.scenes.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (r.bottom < 64 || r.top > innerHeight - 48) return;
        const anchor = r.top + Math.min(160, r.height * 0.22);
        const dist = Math.abs(anchor - line);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      return best;
    },

    progress(el) {
      if (!el) return 1;
      const r = el.getBoundingClientRect();
      const t0 = innerHeight * 0.78;
      const t1 = innerHeight * 0.16;
      const p = (t0 - r.top) / Math.max(80, t0 - t1);
      return Math.max(0, Math.min(1, p));
    },

    scrubCamera() {
      if (!global.HousingMaps || !HousingMaps.cameraScrub) return;
      if (this.reduce()) {
        HousingMaps.cameraScrub(1);
        return;
      }
      const ease = d3.easeCubicInOut(this.progress(this.scenes[this.i]));
      HousingMaps.cameraScrub(ease);
    },

    go(i, opts) {
      i = Math.max(0, Math.min(this.scenes.length - 1, i));
      const reduce = this.reduce();
      this.lockUntil = Date.now() + (reduce ? 80 : 900);
      this.scenes[i].scrollIntoView({
        behavior: reduce ? "auto" : "smooth",
        block: "start"
      });
      this.apply(i, { fly: !!(opts && opts.fly) });
    },

    goPlace(place) {
      const i = this.scenes.findIndex((el) => el.getAttribute("data-place") === place);
      if (i >= 0) this.go(i, { fly: true });
    },

    read(el) {
      const select = el.getAttribute("data-select");
      return {
        place: el.getAttribute("data-place"),
        metric: el.getAttribute("data-metric"),
        select: select,
        pair: el.getAttribute("data-pair") || null,
        camera: el.getAttribute("data-camera") || "wide",
        stage: el.getAttribute("data-stage") || "map",
        focus: el.getAttribute("data-focus") || "map",
        dim: el.getAttribute("data-dim") || null,
        kicker: el.getAttribute("data-kicker") || "",
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
      document.body.dataset.stage = scene.stage || "map";
      document.body.dataset.focus = scene.focus;
      document.body.classList.toggle("is-coda", scene.id === "scene-coda");
      if (opts && opts.silent) return;
      if (this.dash && this.dash.applyScene) {
        this.dash.applyScene(scene, { fly: !!(opts && opts.fly) });
      }
      if (!(opts && opts.fly)) this.scrubCamera();
      if (scene.play && !this.played[scene.id] && this.dash && this.dash.playWalk) {
        this.played[scene.id] = true;
        if (!this.reduce()) setTimeout(() => this.dash.playWalk(), 400);
      }
    }
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  global.HousingCine = HousingCine;
})(window);
