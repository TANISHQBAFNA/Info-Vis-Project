/**
 * Pager: one chapter per wheel / key. Camera flies on the step.
 */
(function (global) {
  "use strict";

  const HousingCine = {
    i: 0,
    lockUntil: 0,
    played: {},
    scenes: [],
    dash: null,
    camU: 0,
    camTarget: 0,
    camRaf: 0,
    scrollT: null,
    camKey: null,

    bind(dash) {
      this.dash = dash;
      this.scenes = Array.prototype.slice.call(document.querySelectorAll(".cine-scene"));
      if (!this.scenes.length) return;
      this.buildRail();
      this.bindKeys();
      this.bindWheel();
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

    bindWheel() {
      let acc = 0;
      let last = 0;
      const onWheel = (e) => {
        if (e.ctrlKey) return;
        e.preventDefault();
        if (Date.now() < this.lockUntil) return;
        const now = Date.now();
        if (now - last > 280) acc = 0;
        last = now;
        const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
        acc += dy;
        if (acc > 56) {
          acc = 0;
          this.go(this.i + 1, { fly: true });
        } else if (acc < -56) {
          acc = 0;
          this.go(this.i - 1, { fly: true });
        }
      };
      window.addEventListener("wheel", onWheel, { passive: false });
      let y0 = null;
      window.addEventListener("touchstart", (e) => {
        y0 = e.touches && e.touches[0] ? e.touches[0].clientY : null;
      }, { passive: true });
      window.addEventListener("touchmove", (e) => {
        if (y0 == null || !e.touches || !e.touches[0]) return;
        if (Math.abs(e.touches[0].clientY - y0) > 10) e.preventDefault();
      }, { passive: false });
      window.addEventListener("touchend", (e) => {
        if (y0 == null || !e.changedTouches || !e.changedTouches[0]) return;
        const dy = y0 - e.changedTouches[0].clientY;
        y0 = null;
        if (Date.now() < this.lockUntil) return;
        if (Math.abs(dy) < 52) return;
        this.go(this.i + (dy > 0 ? 1 : -1), { fly: true });
      }, { passive: true });
    },

    bindKeys() {
      window.addEventListener("keydown", (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const el = e.target;
        const tag = (el && el.tagName) || "";
        const typing = (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el && el.isContentEditable))
          && el && el.offsetParent !== null;
        if (typing) return;
        if (e.repeat) return;
        const code = e.code || "";
        const next = e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "PageDown" || e.key === "j" || e.key === "J" || e.key === " "
          || code === "ArrowDown" || code === "ArrowRight" || code === "PageDown" || code === "Space";
        const prev = e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "PageUp" || e.key === "k" || e.key === "K"
          || code === "ArrowUp" || code === "ArrowLeft" || code === "PageUp";
        if (next) { e.preventDefault(); this.go(this.i + 1, { fly: true }); }
        else if (prev) { e.preventDefault(); this.go(this.i - 1, { fly: true }); }
        else if (e.key === "Home") { e.preventDefault(); this.go(0, { fly: true }); }
        else if (e.key === "End") { e.preventDefault(); this.go(this.scenes.length - 1, { fly: true }); }
      }, { capture: true });
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
          if (!this.isHold(this.scenes[this.i] && this.scenes[this.i].id)) this.scrubCamera();
        });
      };
      window.addEventListener("scroll", onScroll, { passive: true });
    },

    nearest() {
      const mid = innerHeight * 0.5;
      let best = this.i;
      let bestDist = Infinity;
      this.scenes.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const dist = Math.abs((r.top + r.bottom) / 2 - mid);
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
      const t0 = innerHeight * 0.82;
      const t1 = innerHeight * 0.12;
      const p = (t0 - r.top) / Math.max(120, t0 - t1);
      return Math.max(0, Math.min(1, p));
    },

    smooth(t) {
      const x = Math.max(0, Math.min(1, t));
      return x * x * x * (x * (x * 6 - 15) + 10);
    },

    scrubCamera() {
      if (!global.HousingMaps || !HousingMaps.cameraScrub) return;
      if (this.reduce()) {
        this.camU = 1;
        this.camTarget = 1;
        HousingMaps.cameraScrub(1);
        return;
      }
      this.camTarget = this.smooth(this.progress(this.scenes[this.i]));
      this.nudgeCam();
    },

    nudgeCam() {
      if (this.camRaf) return;
      const step = () => {
        this.camRaf = 0;
        if (!global.HousingMaps || !HousingMaps.cameraScrub) return;
        const t = this.camTarget;
        const u = this.camU;
        const k = this.reduce() ? 1 : 0.13;
        const next = u + (t - u) * k;
        this.camU = next;
        HousingMaps.cameraScrub(next);
        if (Math.abs(t - next) > 0.0012) {
          this.camRaf = requestAnimationFrame(step);
        } else {
          this.camU = t;
          HousingMaps.cameraScrub(t);
        }
      };
      this.camRaf = requestAnimationFrame(step);
    },

    go(i, opts) {
      i = Math.max(0, Math.min(this.scenes.length - 1, i));
      if (i === this.i) return;
      const reduce = this.reduce();
      const dur = reduce ? 0 : 780;
      this.lockUntil = Date.now() + (reduce ? 80 : dur + 160);
      this.scrollTo(this.scenes[i], dur);
      this.apply(i, { fly: !!(opts && opts.fly) });
    },

    scrollTo(el, ms) {
      if (!el) return;
      if (this.scrollRaf) cancelAnimationFrame(this.scrollRaf);
      const start = window.scrollY || document.documentElement.scrollTop || 0;
      const r = el.getBoundingClientRect();
      const to = Math.max(0, start + r.top);
      if (!Number.isFinite(to) || Math.abs(to - start) < 1) return;
      if (ms <= 0 || this.reduce()) {
        window.scrollTo(0, to);
        this.scrollRaf = 0;
        return;
      }
      const t0 = performance.now();
      const dur = ms;
      const step = (now) => {
        const u = Math.max(0, Math.min(1, (now - t0) / dur));
        const e = 0.5 - 0.5 * Math.cos(Math.PI * u);
        window.scrollTo(0, start + (to - start) * e);
        if (u < 1) this.scrollRaf = requestAnimationFrame(step);
        else this.scrollRaf = 0;
      };
      this.scrollRaf = requestAnimationFrame(step);
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
        callouts: (el.getAttribute("data-callouts") || "").split(",").map((s) => s.trim()).filter(Boolean),
        camera: el.getAttribute("data-camera") || "wide",
        stage: el.getAttribute("data-stage") || "map",
        focus: el.getAttribute("data-focus") || "map",
        dim: el.getAttribute("data-dim") || null,
        kicker: el.getAttribute("data-kicker") || "",
        play: el.getAttribute("data-play") === "1",
        id: el.id
      };
    },

    isHold(id) {
      return id === "scene-fairfax" || id === "scene-years" || id === "scene-cone";
    },

    apply(i, opts) {
      if (!this.scenes[i]) return;
      const prevId = this.scenes[this.i] && this.scenes[this.i].id;
      this.i = i;
      this.scenes.forEach((el, n) => {
        el.classList.toggle("is-on", n === i);
        el.setAttribute("aria-current", n === i ? "true" : "false");
      });
      document.querySelectorAll(".cine-tick").forEach((btn) => {
        btn.classList.toggle("is-on", +btn.getAttribute("data-i") === i);
      });
      const scene = this.read(this.scenes[i]);
      const camKey = [scene.place, scene.camera, scene.select || "", scene.pair || "", (scene.callouts || []).join(",")].join("|");
      const stayHold = this.isHold(scene.id) && this.isHold(prevId);
      const enterHold = this.isHold(scene.id) && !this.isHold(prevId);
      this.camKey = camKey;
      document.body.dataset.scene = scene.id || "";
      document.body.dataset.stage = scene.stage || "map";
      document.body.dataset.focus = scene.focus;
      document.body.classList.toggle("is-coda", scene.id === "scene-coda");
      if (opts && opts.silent) return;
      const fly = stayHold ? false : (!!(opts && opts.fly) || enterHold);
      const hold = stayHold;
      if (this.dash && this.dash.applyScene) {
        this.dash.applyScene(scene, { fly: fly, hold: hold });
      }
      if (global.HousingRail && HousingRail.draw) HousingRail.draw(scene.id);
      if (hold || fly) {
        this.camU = 1;
        this.camTarget = 1;
      } else {
        this.scrubCamera();
      }
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
