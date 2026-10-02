// Deslop page script. Injected when the toolbar button is pressed.
// Pick a post or paragraph. A character reads it, removes the slop, and puts the rewrite in its place.
// Styles: worker + cannon, ninja + nunchucks, chomper, crane + wrecking ball.
// No innerHTML anywhere: some sites (LinkedIn among them) restrict it, so everything is built node by node.
(() => {
  if (window.__deslop) return window.__deslop.pick();
  // A host page can embed this engine and drive it itself (the Deslop X-ray Mac app does):
  // window.__deslopOptions = { embedded: true, settings: {...}, onDone(message, changed) }.
  const OPT = window.__deslopOptions || {};

  let SPEED = 1.35;
  // The choices on the picker bar: how hard to cut, who does the job, and whether a post that is mostly slop gets binned and rewritten.
  const settings = { level: 2, style: "worker", bin: true };
  const LEVELS = { 1: "Gentle", 2: "Firm", 3: "Ruthless", 4: "To the bone" };
  const STYLE_NAMES = { worker: "Worker", ninja: "Ninja", chomper: "Chomper", crane: "Crane" };
  const STYLE_TIPS = { worker: "Worker: cannon and paint roller", ninja: "Ninja: nunchucks and ink brush", chomper: "Chomper: eats the slop", crane: "Crane: wrecking ball, then lowers the new words in" };
  const store = (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) || null;
  const loaded = new Promise((done) => {
    if (OPT.settings) { Object.assign(settings, OPT.settings); return done(); }
    const take = (v) => { if (v && LEVELS[v.level]) settings.level = Number(v.level); if (v && STYLE_NAMES[v.style]) settings.style = v.style; if (v && typeof v.bin === "boolean") settings.bin = v.bin; done(); };
    if (store) store.get("deslop", (r) => take(r && r.deslop)); else { try { take(JSON.parse(localStorage.getItem("deslop") || "null")); } catch { done(); } }
  });
  const saveSettings = () => { if (store) store.set({ deslop: settings }); else { try { localStorage.setItem("deslop", JSON.stringify(settings)); } catch {} } };
  const NS = "http://www.w3.org/2000/svg";
  const C = { ink: "#c8372d", pencil: "#5d6675", paper: "#fffdf7", hat: "#e8b83a", vest: "#f1e3c8", iron: "#3f4652" };

  // ------------------------------------------------------------ timing (Esc skips to the end)
  let skipping = false, busy = false;
  const live = new Set();
  const ms = (t) => (skipping ? 0 : t / SPEED);
  const sleep = (t) => new Promise((r) => setTimeout(r, ms(t)));
  function play(el, frames, o = {}) {
    const a = el.animate(frames, { fill: "forwards", easing: "ease", ...o, duration: Math.max(1, ms(o.duration ?? 300)), delay: ms(o.delay ?? 0) });
    live.add(a);
    if (skipping) a.finish();
    return a.finished.then(() => { live.delete(a); if (o.keep !== false) { try { a.commitStyles(); } catch {} } a.cancel(); }, () => live.delete(a));
  }
  const skip = () => { skipping = true; for (const a of [...live]) { try { a.finish(); } catch {} } };

  // ------------------------------------------------------------ overlay: the cast lives in a shadow root, in page coordinates
  let host, fx, toastEl;
  const FX_CSS = `
    :host { all: initial; }
    .fx { position: absolute; left: 0; top: 0; pointer-events: none; font: 16px/1.5 system-ui, sans-serif; }
    .fx > * { position: absolute; left: 0; top: 0; will-change: transform; }
    .plank { height: 5px; border-radius: 2px; background: #c9a36b; box-shadow: inset 0 -1.5px 0 #9c7a48; transform-origin: 0 50%; }
    .plank::before, .plank::after { content: ""; position: absolute; top: 5px; width: 3px; height: 13px; background: #9c7a48; border-radius: 0 0 2px 2px; }
    .plank::before { left: 10px; } .plank::after { right: 10px; }
    .plank.bamboo { height: 4px; background: #9aa86a; box-shadow: inset 0 -1.5px 0 #76834a; }
    .plank.bamboo::before, .plank.bamboo::after { background: #76834a; }
    .plank.girder { height: 7px; background: repeating-linear-gradient(90deg, #e8b83a 0 14px, #2b303a 14px 16px); box-shadow: inset 0 -2px 0 rgba(0,0,0,.25); }
    .plank.girder::before, .plank.girder::after { background: #2b303a; width: 4px; }
    .letter { white-space: pre; }
    .ball { width: 11px; height: 11px; margin: -5.5px 0 0 -5.5px; border-radius: 50%; background: ${C.iron}; box-shadow: inset -2px -2px 0 rgba(0,0,0,.25); }
    .puff { width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: #cfd3d9; }
    .boom { width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; border: 2px solid ${C.ink}; }
    .speck { width: 4px; height: 4px; margin: -2px 0 0 -2px; border-radius: 1px; background: ${C.pencil}; }
    svg { display: block; overflow: visible; fill: none; stroke: ${C.pencil}; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    svg * { transform-box: view-box; }
    .wk-flip { transform-origin: 22px 30px; }
    .hero.left .wk-flip { transform: scaleX(-1); }
    .wk-leg { transform-origin: 22px 38px; }
    .wk-arm { transform-origin: 22px 25px; transition: transform .22s ease; }
    .wk-head { transform-origin: 23px 20px; transition: transform .22s ease; }
    .wk-tool { opacity: 0; transition: opacity .15s; }
    .hero.walking .wk-leg.front { animation: step .46s ease-in-out infinite alternate; }
    .hero.walking .wk-leg.back { animation: step .46s ease-in-out infinite alternate-reverse; }
    .hero.walking .wk-bob { animation: bob .23s ease-in-out infinite alternate; }
    .hero.walking:not(.reading):not(.painting) .wk-arm.back { animation: swing .46s ease-in-out infinite alternate; }
    @keyframes step { from { transform: rotate(-24deg); } to { transform: rotate(24deg); } }
    @keyframes swing { from { transform: rotate(18deg); } to { transform: rotate(-18deg); } }
    @keyframes bob { from { transform: translateY(0); } to { transform: translateY(-1.6px); } }
    .hero.reading .wk-arm.front { transform: rotate(-58deg); }
    .hero.reading .wk-head { transform: rotate(13deg); }
    .hero.reading .wk-tool { opacity: 1; }
    .hero.aiming .wk-arm.front { transform: rotate(-78deg); }
    .hero.aiming .wk-arm.back { transform: rotate(-62deg); }
    .hero.painting .wk-arm.front { transform: rotate(-34deg); }
    .hero.painting .wk-arm.back { transform: rotate(-22deg); }
    .hero.cheer .wk-arm { transform: rotate(-150deg); }
    .pole { position: absolute; left: 31px; top: 34px; --len: 0; opacity: 0; transition: opacity .12s; }
    .pole i { position: absolute; left: 0; top: 0; width: 2px; height: 1px; background: ${C.pencil}; transform-origin: 50% 0; transform: scaleY(var(--len)); transition: transform .18s ease; }
    .pole b { position: absolute; left: -4px; top: -26px; width: 10px; height: 30px; border-radius: 4px; background: ${C.ink}; box-shadow: inset 2px 0 0 rgba(255,255,255,.3), inset -2px 0 0 rgba(0,0,0,.18); transform: translateY(calc(var(--len) * 1px)); transition: transform .18s ease; }
    .hero.left .pole { left: 11px; }
    .hero.painting .pole { opacity: 1; }
    .cn-barrel { transform-origin: 20px 20px; transition: transform .2s ease; }
    .cn-flash { opacity: 0; transform-origin: 46px 20px; }
    /* ninja: the same rig, darker; a brush on the pole */
    .hero.ninja svg { stroke: #22252b; stroke-width: 2.2; }
    .hero.ninja.walking .wk-leg { animation-duration: .32s; }
    .hero.ninja.walking .wk-bob { animation-duration: .16s; }
    .hero.ninja.walking .nj-tails { animation: flutter .2s ease-in-out infinite alternate; }
    .nj-tails { transform-origin: 16px 9px; }
    @keyframes flutter { from { transform: rotate(-10deg); } to { transform: rotate(14deg); } }
    .hero.ninja .pole i { background: #6b4a2b; }
    .hero.ninja .pole b { left: -3px; top: -20px; width: 8px; height: 24px; border-radius: 2px 2px 7px 7px; background: #15171b; box-shadow: none; }
    .nun { width: 34px; height: 34px; margin: -17px 0 0 -17px; }
    .nun svg { animation: spin .26s linear infinite; transform-origin: 50% 50%; stroke: none; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .slash { height: 3px; margin-top: -1.5px; border-radius: 2px; background: linear-gradient(90deg, transparent, #15171b 18%, #15171b 82%, transparent); transform-origin: 0 50%; }
    .star { width: 0; height: 0; }
    .star::before, .star::after { content: ""; position: absolute; left: -11px; top: -1.5px; width: 22px; height: 3px; border-radius: 2px; background: ${C.ink}; }
    .star::after { transform: rotate(90deg); }
    /* chomper: two jaws that open and close */
    .jaw { transform-origin: 22px 40px; }
    .hero.chomper .jaw.up { transform: rotate(-9deg); } .hero.chomper .jaw.down { transform: rotate(9deg); }
    .hero.chomper.walking .jaw.up, .hero.chomper.eating .jaw.up { animation: jawU .15s ease-in-out infinite alternate; }
    .hero.chomper.walking .jaw.down, .hero.chomper.eating .jaw.down { animation: jawD .15s ease-in-out infinite alternate; }
    @keyframes jawU { from { transform: rotate(-3deg); } to { transform: rotate(-34deg); } }
    @keyframes jawD { from { transform: rotate(3deg); } to { transform: rotate(34deg); } }
    .hero.chomper.walking svg { animation: bob .18s ease-in-out infinite alternate; }
    .hero.chomper.cheer svg { animation: hop .3s ease-in-out 2 alternate; }
    @keyframes hop { to { transform: translateY(-9px); } }
    /* crane: a trolley on the girder, a chain, and a ball (or a hook when lowering words) */
    .crane { width: 0; height: 0; --len: 14; }
    .crane .trolley { position: absolute; left: -13px; top: -15px; width: 26px; height: 12px; border-radius: 3px; background: #2b303a; box-shadow: inset 0 -3px 0 #e8b83a; }
    .crane .trolley::before, .crane .trolley::after { content: ""; position: absolute; bottom: -4px; width: 7px; height: 7px; border-radius: 50%; background: #5d6675; }
    .crane .trolley::before { left: 2px; } .crane .trolley::after { right: 2px; }
    .crane .arm { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
    .crane .arm i { position: absolute; left: -1px; top: 0; width: 2px; height: 1px; transform-origin: 50% 0; transform: scaleY(var(--len)); background: repeating-linear-gradient(180deg, #5d6675 0 3px, #9aa0aa 3px 5px); transition: transform .3s ease; }
    .crane .arm b { position: absolute; left: -11px; top: -4px; width: 22px; height: 22px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #6a7180, #2b303a 70%); transform: translateY(calc(var(--len) * 1px)); transition: transform .3s ease, width .15s, height .15s, left .15s; }
    .crane.hook .arm b { left: -5px; width: 10px; height: 10px; border-radius: 2px 2px 6px 6px; background: none; border: 2.5px solid #5d6675; border-top-color: transparent; box-sizing: border-box; }
    /* binning: the post as a sheet of paper, torn in two, then a bin */
    .sheet { background-color: #fffdf7; background-image: repeating-linear-gradient(180deg, transparent 0 13px, #d8d3c6 13px 17px, transparent 17px 26px); background-size: calc(100% - 26px) 26px; background-position: 13px 4px; background-repeat: repeat-y; box-shadow: 0 6px 18px -8px rgba(0,0,0,.4); transform-origin: 50% 50%; }
    .sheet.l { clip-path: polygon(0 0, 100% 0, 94% 6%, 100% 12%, 93% 19%, 100% 26%, 94% 33%, 100% 41%, 93% 48%, 100% 56%, 94% 63%, 100% 71%, 93% 78%, 100% 86%, 94% 93%, 100% 100%, 0 100%); }
    .sheet.r { clip-path: polygon(6% 0, 100% 0, 100% 100%, 6% 100%, 0 93%, 6% 86%, 0 78%, 7% 71%, 0 63%, 6% 56%, 0 48%, 7% 41%, 0 33%, 6% 26%, 0 19%, 7% 12%, 0 6%); }
    .bin .lid { transform-origin: 6px 14px; transition: transform .2s ease; }
    .bin.open .lid { transform: rotate(-58deg); }
    /* messages, and the selector wheel that opens where you click */
    .toast { position: fixed; left: 50%; top: 18px; transform: translateX(-50%); z-index: 2; pointer-events: auto; display: flex; align-items: center; gap: 12px; background: #211f1b; color: #f3eee4; font: 12px/1.4 ui-monospace, "SF Mono", Menlo, monospace; padding: 9px 14px; border-radius: 7px; box-shadow: 0 12px 30px -8px rgba(0,0,0,.55); max-width: min(620px, calc(100vw - 32px)); }
    .toast button { all: unset; cursor: pointer; color: #ffb3ac; text-decoration: underline; text-underline-offset: 2px; white-space: nowrap; }
    .wheel { position: fixed; z-index: 4; width: 340px; height: 340px; margin: -170px 0 0 -170px; pointer-events: auto; border-radius: 50%; animation: wheel-in .32s cubic-bezier(.2,1.5,.4,1) both; -webkit-user-select: none; user-select: none; }
    .wheel::before { content: ""; position: absolute; inset: 0; border-radius: 50%; background: rgba(255,247,236,.74); border: 1.5px solid rgba(255,255,255,.75); box-shadow: 0 24px 60px -18px rgba(60,30,10,.55), inset 0 0 0 7px rgba(255,255,255,.2); backdrop-filter: blur(14px) saturate(1.5); -webkit-backdrop-filter: blur(14px) saturate(1.5); }
    @keyframes wheel-in { from { transform: scale(.55) rotate(-24deg); opacity: 0; } }
    .wheel svg { position: absolute; inset: 0; stroke: none; overflow: visible; }
    .wheel .seg { fill: rgba(255,236,208,.97); stroke: rgba(255,236,208,.97); stroke-width: 9; stroke-linejoin: round; cursor: pointer; transition: fill .14s, stroke .14s; }
    .wheel g.s.cur .seg { fill: rgba(255,214,170,.95); stroke: rgba(255,214,170,.95); }
    .wheel g.s:hover .seg, .wheel g.s.hot .seg { fill: #e4572e; stroke: #e4572e; }
    .wheel g.s { transition: transform .16s cubic-bezier(.2,1.4,.4,1); transform-box: fill-box; transform-origin: center; }
    .wheel g.s:hover { transform: scale(1.035); }
    .wheel .ico { fill: none; stroke: #1d1b18; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; transition: stroke .14s; }
    .wheel .ico .solid { fill: #1d1b18; stroke: none; transition: fill .14s; }
    .wheel text { font: 600 10.5px/1 system-ui, -apple-system, "Helvetica Neue", sans-serif; letter-spacing: .12em; fill: #1d1b18; text-anchor: middle; pointer-events: none; transition: fill .14s; }
    .wheel g.s:hover .ico, .wheel g.s.hot .ico { stroke: #fff; } .wheel g.s:hover .ico .solid, .wheel g.s.hot .ico .solid { fill: #fff; }
    .wheel g.s:hover text, .wheel g.s.hot text { fill: #fff; }
    .wheel .hub { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); min-width: 96px; padding: 11px 16px; border-radius: 22px; text-align: center; cursor: pointer; background: rgba(255,238,214,.95); box-shadow: 0 6px 16px -8px rgba(60,30,10,.5); font: 600 11px/1.2 system-ui, -apple-system, "Helvetica Neue", sans-serif; letter-spacing: .12em; color: #1d1b18; white-space: nowrap; transition: background .14s, color .14s; }
    .wheel .hub:hover { background: #e4572e; color: #fff; }
    .wheel .hub small { display: block; font-weight: 500; font-size: 8.5px; letter-spacing: .1em; opacity: .65; margin-top: 3px; }
    @media (prefers-reduced-motion: reduce) { .hero, .cannon, .plank, .nun, .crane, .sheet, .bin { display: none; } }`;
  function overlay() {
    if (host && host.isConnected) return;
    host = document.createElement("div");
    host.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;z-index:2147483646;pointer-events:none";
    host.setAttribute("aria-hidden", "true");
    const root = host.attachShadow({ mode: "open" }), st = document.createElement("style");
    st.textContent = FX_CSS;
    fx = document.createElement("div"); fx.className = "fx";
    root.append(st, fx);
    document.documentElement.append(host);
  }
  function toast(text, action, onAction, hold = 6000) {
    overlay();
    if (toastEl) toastEl.remove();
    const t = (toastEl = document.createElement("div")); t.className = "toast";
    const s = document.createElement("span"); s.textContent = text; t.append(s);
    if (action) { const b = document.createElement("button"); b.textContent = action; b.onclick = () => { t.remove(); onAction(); }; t.append(b); }
    fx.parentNode.append(t);
    if (hold) setTimeout(() => t.isConnected && t === toastEl && t.remove(), hold);
  }
  const at = (r) => ({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height });
  const spawn = (cls) => { const el = document.createElement("div"); el.className = cls; fx.append(el); return el; };
  const put = (el, x, y) => { el._x = x; el._y = y; el.style.transform = `translate(${x}px, ${y}px)`; };
  const tr = (x, y) => `translate(${x}px, ${y}px)`;
  const S = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); el.append(...kids); return el; };

  // ------------------------------------------------------------ the cast, drawn node by node
  const pole = () => { const p = document.createElement("div"); p.className = "pole"; p.append(document.createElement("i"), document.createElement("b")); return p; };
  function makeWorker(hat = C.hat) {
    const el = spawn("hero worker");
    el.append(S("svg", { viewBox: "0 0 44 58", width: 44, height: 58 }, S("g", { class: "wk-flip" }, S("g", { class: "wk-bob" },
      S("g", { class: "wk-leg back" }, S("path", { d: "M21,38 L21,53 L25,53" })),
      S("g", { class: "wk-arm back" }, S("path", { d: "M21,25 L19,36" })),
      S("path", { d: "M15,23 Q22,20 29,23 L29,39 Q22,41.5 15,39 Z", fill: C.vest }), S("path", { d: "M15.5,31 L28.5,31", stroke: C.ink, "stroke-width": 2.2 }),
      S("g", { class: "wk-head" },
        S("circle", { cx: 23, cy: 14, r: 7.4, fill: C.paper }), S("circle", { cx: 27, cy: 14, r: 1.2, fill: C.pencil, stroke: "none" }), S("path", { d: "M26,18 Q28,18.6 29,17.6" }),
        S("path", { d: "M14.6,11.5 Q15,3.4 23,3.4 Q31,3.4 31.4,11.5 Z", fill: hat }), S("path", { d: "M12.6,11.5 L35,11.5" })),
      S("g", { class: "wk-leg front" }, S("path", { d: "M23,38 L23,53 L27,53" })),
      S("g", { class: "wk-arm front" }, S("path", { d: "M23,25 L25,36" }),
        S("g", { class: "wk-tool" }, S("rect", { x: 19.5, y: 33, width: 10, height: 12, rx: 1.2, fill: "#fff" }), S("path", { d: "M22,36.5 L27,36.5 M22,39.5 L27,39.5 M22,42.5 L25,42.5", "stroke-width": 1 })))))));
    el.append(pole());
    return el;
  }
  function makeNinja() {
    const el = spawn("hero ninja"), dark = "#2b303a";
    el.append(S("svg", { viewBox: "0 0 44 58", width: 44, height: 58 }, S("g", { class: "wk-flip" }, S("g", { class: "wk-bob" },
      S("g", { class: "wk-leg back" }, S("path", { d: "M21,38 L21,53 L25,53" })),
      S("g", { class: "wk-arm back" }, S("path", { d: "M21,25 L19,36" })),
      S("path", { d: "M15,23 Q22,20 29,23 L29,39 Q22,41.5 15,39 Z", fill: dark }), S("path", { d: "M15.5,33 L28.5,33", stroke: C.ink, "stroke-width": 2.4 }),
      S("g", { class: "wk-head" },
        S("circle", { cx: 23, cy: 14, r: 7.4, fill: dark }),
        S("path", { d: "M18.5,11.2 L30,11.2 Q30.6,13.4 30,15.6 L18.5,15.6 Z", fill: "#f1d4b3", stroke: "none" }), S("circle", { cx: 27, cy: 13.4, r: 1.2, fill: "#15171b", stroke: "none" }), S("path", { d: "M24.5,11.4 L29.5,12.4", "stroke-width": 1.3 }),
        S("path", { d: "M15.6,8.6 L30.6,8.6", stroke: C.ink, "stroke-width": 2.6 }),
        S("g", { class: "nj-tails" }, S("path", { d: "M16,8.6 Q10,7 6,11 M16,9.4 Q11,12 8.5,16.5", stroke: C.ink, "stroke-width": 2 }))),
      S("g", { class: "wk-leg front" }, S("path", { d: "M23,38 L23,53 L27,53" })),
      S("g", { class: "wk-arm front" }, S("path", { d: "M23,25 L25,36" }),
        S("g", { class: "wk-tool" }, S("rect", { x: 19.5, y: 34, width: 11, height: 9, rx: 1.2, fill: "#fbf3df", stroke: "#6b4a2b", "stroke-width": 1.2 }), S("path", { d: "M22,37 L28,37 M22,40 L26,40", stroke: "#6b4a2b", "stroke-width": 1 })))))));
    el.append(pole());
    return el;
  }
  // A round mouth on legs-free wheels: two half discs hinged at the back.
  function makeChomper() {
    const el = spawn("hero chomper");
    el.append(S("svg", { viewBox: "0 0 44 58", width: 44, height: 58 }, S("g", { class: "wk-flip" },
      S("path", { class: "jaw down", d: "M7,40 A15,15 0 0 0 37,40 Z", fill: C.hat, "stroke-width": 2 }),
      S("g", { class: "jaw up" }, S("path", { d: "M7,40 A15,15 0 0 1 37,40 Z", fill: C.hat, "stroke-width": 2 }), S("circle", { cx: 26, cy: 31, r: 2.3, fill: "#22252b", stroke: "none" }), S("path", { d: "M22,27 L30,25.5", "stroke-width": 1.6 })))));
    return el;
  }
  function makeCannon() {
    const el = spawn("cannon");
    el.append(S("svg", { viewBox: "0 0 56 34", width: 56, height: 34 },
      S("g", { class: "cn-barrel" },
        S("path", { d: "M10,15 Q10,13 12,13 L42,15.5 Q45,16 45,20 Q45,24 42,24.5 L12,27 Q10,27 10,25 Z", fill: C.iron, stroke: "#2b303a" }),
        S("path", { d: "M44,14.5 L47,14.5 L47,25.5 L44,25.5 Z", fill: C.iron, stroke: "#2b303a" }),
        S("path", { class: "cn-flash", d: "M48,20 L55,14 L53,19 L60,20 L53,21 L55,26 Z", fill: C.hat, stroke: C.ink, "stroke-width": 1.2 })),
      S("circle", { cx: 20, cy: 24, r: 8.5, fill: "#c9a36b", stroke: "#9c7a48" }), S("path", { d: "M20,15.5 L20,32.5 M11.5,24 L28.5,24", stroke: "#9c7a48", "stroke-width": 1.3 }), S("circle", { cx: 20, cy: 24, r: 1.8, fill: "#9c7a48", stroke: "none" })));
    return el;
  }
  function makeCrane() {
    const el = spawn("crane"), arm = document.createElement("div"), trolley = document.createElement("div");
    trolley.className = "trolley"; arm.className = "arm"; arm.append(document.createElement("i"), document.createElement("b"));
    el.append(arm, trolley);
    return el;
  }
  function makeNunchaku() {
    const el = spawn("nun");
    el.append(S("svg", { viewBox: "-17 -17 34 34", width: 34, height: 34 },
      S("rect", { x: -15, y: -11, width: 15, height: 5, rx: 2.2, fill: "#6b4a2b", transform: "rotate(-24 -7 -8)" }),
      S("rect", { x: 0, y: 6, width: 15, height: 5, rx: 2.2, fill: "#6b4a2b", transform: "rotate(-24 7 8)" }),
      S("path", { d: "M-1,-5 L1,5", stroke: "#8a8f98", "stroke-width": 1.6, "stroke-dasharray": "2 1.6", fill: "none" })));
    return el;
  }
  function makeBin() {
    const el = spawn("bin");
    el.append(S("svg", { viewBox: "0 0 48 60", width: 48, height: 60 },
      S("path", { d: "M9,18 L12,56 Q12.4,58 14.5,58 L33.5,58 Q35.6,58 36,56 L39,18 Z", fill: "#dfe3e8", "stroke-width": 2 }),
      S("path", { d: "M17,25 L18.5,51 M24,25 L24,51 M31,25 L29.5,51", "stroke-width": 1.5 }),
      S("g", { class: "lid" }, S("path", { d: "M5,14 L43,14 L41,18 L7,18 Z", fill: "#c9ced6", "stroke-width": 2 }), S("path", { d: "M19,14 L19,10.5 L29,10.5 L29,14", "stroke-width": 2 }))));
    return el;
  }
  function poof(x, y, n = 6) {
    for (let i = 0; i < n; i++) { const s = spawn("puff"), a = (i / n) * Math.PI * 2, d = 14 + Math.random() * 16; play(s, [{ transform: `${tr(x, y)} scale(.6)`, opacity: .95 }, { transform: `${tr(x + Math.cos(a) * d, y + Math.sin(a) * d - 8)} scale(${1.8 + Math.random()})`, opacity: 0 }], { duration: 460 + Math.random() * 200, keep: false }).then(() => s.remove()); }
  }

  // The hero walks the plank (x only) or glides anywhere (the chomper leaves the plank to eat).
  const W = { el: null, feet: 54, lo: 0, hi: 0 };
  const walkTo = async (x, pace = 150) => {
    const el = W.el; x = Math.max(W.lo, Math.min(W.hi, x));
    const dx = x - el._x; if (Math.abs(dx) < 1) return;
    el.classList.toggle("left", dx < 0); el.classList.add("walking");
    await play(el, [{ transform: tr(el._x, el._y) }, { transform: tr(x, el._y) }], { duration: Math.abs(dx) / pace * 1000, easing: "linear" });
    put(el, x, el._y); el.classList.remove("walking");
  };
  const glide = async (el, x, y, pace = 320, easing = "ease-in-out") => {
    const d = Math.hypot(x - el._x, y - el._y); if (d < 1) return;
    if (el === W.el) el.classList.toggle("left", x < el._x - 2);
    await play(el, [{ transform: tr(el._x, el._y) }, { transform: tr(x, y) }], { duration: Math.max(120, d / pace * 1000), easing });
    put(el, x, y);
  };
  const pose = (...names) => { W.el.classList.remove("reading", "aiming", "painting", "cheer", "eating"); W.el.classList.add(...names); };

  // ------------------------------------------------------------ the page's text
  const hiddenEl = (el) => { const cs = getComputedStyle(el); return cs.display === "none" || cs.visibility === "hidden" || el.classList.contains("visually-hidden") || (el.offsetWidth <= 1 && el.offsetHeight <= 1 && cs.position === "absolute"); };
  // The text as a reader sees it, with a line break for each <br> and block, plus where each text node sits in it.
  function textMap(root) {
    let text = ""; const nodes = [];
    const nl = () => { if (text && !text.endsWith("\n")) text += "\n"; };
    (function walk(n) {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { if (c.nodeValue) { nodes.push({ n: c, start: text.length }); text += c.nodeValue; } continue; }
        if (c.nodeType !== 1 || c === host || /^(SCRIPT|STYLE|BUTTON|SVG|NOSCRIPT)$/i.test(c.tagName) || hiddenEl(c)) continue;
        if (c.tagName === "BR") { text += "\n"; continue; }
        const block = !/^inline/.test(getComputedStyle(c).display);
        if (block) nl();
        walk(c);
        if (block) nl();
      }
    })(root);
    return { text, nodes };
  }
  const textNodesOf = (root) => textMap(root).nodes;
  function rangeAt(root, start, end) {
    const nodes = textNodesOf(root); if (!nodes.length) return null;
    const loc = (pos) => { for (let i = nodes.length - 1; i >= 0; i--) if (nodes[i].start <= pos) return [nodes[i].n, Math.max(0, Math.min(pos - nodes[i].start, nodes[i].n.nodeValue.length))]; return [nodes[0].n, 0]; };
    const r = document.createRange(); r.setStart(...loc(start)); r.setEnd(...loc(end)); return r;
  }
  // Wrap characters [start, end) of the mapped text in spans, one per text node touched.
  function wrapText(root, start, end, cls) {
    const out = [];
    for (const { n, start: off } of textNodesOf(root)) {
      const len = n.nodeValue.length, a = Math.max(start, off), b = Math.min(end, off + len);
      if (a >= b) continue;
      let node = n;
      if (a > off) node = node.splitText(a - off);
      if (b < off + len) node.splitText(b - a);
      const w = document.createElement("span"); w.className = cls;
      node.parentNode.insertBefore(w, node); w.appendChild(node); out.push(w);
    }
    return out;
  }
  function wrapWords(root) {
    for (const { n } of textNodesOf(root)) {
      if (n.parentElement.classList.contains("dsl-w") || !n.nodeValue.trim()) continue;
      const frag = document.createDocumentFragment();
      for (const part of n.nodeValue.split(/(\s+)/)) { if (!part) continue; if (/^\s+$/.test(part)) frag.append(part); else { const s = document.createElement("span"); s.className = "dsl-w"; s.textContent = part; frag.append(s); } }
      n.replaceWith(frag);
    }
  }
  function unwrap(root) { for (const el of root.querySelectorAll(".dsl-w, .dsl-fix, .dsl-slop")) el.replaceWith(...el.childNodes); root.normalize(); }
  // Cut lines leave empty links and stacks of line breaks behind. Close them up: nothing at the
  // start or end of the text, and at most one blank line between paragraphs.
  function tidy(root) {
    for (const el of [...root.querySelectorAll("a, span, strong, em, b, i")]) if (!el.firstChild) el.remove();
    root.normalize();
    const blank = (n) => n && n.nodeType === 3 && !n.nodeValue.trim();
    for (const br of [...root.querySelectorAll("br")]) {
      if (!br.isConnected) continue;
      let p = br.previousSibling; while (blank(p)) p = p.previousSibling;
      if (p && p.nodeName === "BR") continue;                      // only act at the start of a run
      const run = [br]; let n = br.nextSibling;
      while (n && (n.nodeName === "BR" || blank(n))) { if (n.nodeName === "BR") run.push(n); n = n.nextSibling; }
      run.slice(!p || !n ? 0 : Math.min(run.length, 2)).forEach((b) => b.remove());
    }
  }
  function flip(change, root) {
    const things = [...root.querySelectorAll(".dsl-w")], before = new Map(things.map((el) => [el, el.getBoundingClientRect()]));
    change();
    const moves = [];
    for (const [el, b] of before) {
      if (!el.isConnected) continue;
      const a = el.getBoundingClientRect(), dx = b.left - a.left, dy = b.top - a.top;
      if (Math.abs(dx) > .5 || Math.abs(dy) > .5) moves.push(play(el, [{ transform: tr(dx, dy) }, { transform: "none" }], { duration: 340, easing: "cubic-bezier(.2,.7,.2,1)", keep: false, fill: "backwards" }));
    }
    return Promise.all(moves);
  }
  const words = (s) => (s.match(/\b[\w'’-]+\b/g) || []).length;
  // Word elements grouped into the lines they sit on, top to bottom, each line left to right.
  function linesOf(wordEls) {
    const lines = [];
    for (const w of wordEls) { const b = at(w.getBoundingClientRect()); if (!b.w) continue; const line = lines.find((l) => Math.abs(l.y - b.y) < 6); line ? line.words.push({ w, b }) : lines.push({ y: b.y, h: b.h, words: [{ w, b }] }); }
    for (const l of lines) { l.words.sort((a, b) => a.b.x - b.b.x); l.x1 = l.words[0].b.x; const last = l.words[l.words.length - 1].b; l.x2 = last.x + last.w; }
    return lines.sort((a, b) => a.y - b.y);
  }

  // ------------------------------------------------------------ reading
  // One reading pass: the hero crosses the plank while a yellow window runs through the text.
  async function readPass(root, plank, total, dur) {
    pose("reading");
    const walk = walkTo(plank.x2 - 44, Math.max(40, (plank.x2 - 44 - W.el._x) / dur * 1000));
    const t0 = performance.now();
    await new Promise((done) => {
      const tick = () => {
        const k = skipping ? 1 : Math.min(1, (performance.now() - t0) * SPEED / dur), i = Math.round(k * total);
        if (window.Highlight && CSS.highlights) { const r = rangeAt(root, Math.max(0, i - 36), i); if (r) CSS.highlights.set("dsl-reading", new Highlight(r)); }
        k < 1 ? requestAnimationFrame(tick) : done();
      };
      tick();
    });
    if (window.Highlight && CSS.highlights) CSS.highlights.delete("dsl-reading");
    await walk;
  }

  // ------------------------------------------------------------ removing a phrase, four ways
  const targetOf = (slop) => { const first = slop.parts.flatMap((p) => [...p.getClientRects()]).filter((r) => r.width > 1).map(at)[0]; return first ? { x: first.x + Math.min(first.w / 2, 90), y: first.y + first.h / 2, w: first.w, left: first.x } : null; };
  // What a hit does: copies of the letters fly off, and the phrase itself becomes a hatched hole of the same size.
  function blast(slop, target, root, sliced) {
    const cs = getComputedStyle(slop.parts[0]), chars = [];
    for (const part of slop.parts) for (const { n } of textNodesOf(part)) for (let i = 0; i < n.nodeValue.length; i++) {
      if (!n.nodeValue[i].trim()) continue;
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); const b = r.getBoundingClientRect(); if (b.width) chars.push({ c: n.nodeValue[i], b: at(b) });
    }
    const every = Math.ceil(chars.length / 70);
    chars.forEach(({ c, b }, i) => {
      if (i % every) return;
      const el = spawn("letter"); el.textContent = c; el.style.font = cs.font; el.style.color = cs.color;
      const spin = (Math.random() - .5) * 520;
      // a ball throws letters up and out; a slice sends half up-left and half down-right
      const away = sliced ? (i % 2 ? 1 : -1) * (40 + Math.random() * 70) : (b.x - target.x) * (.5 + Math.random() * .9) + (Math.random() - .5) * 46;
      const up = sliced ? (i % 2 ? -6 : 22) + Math.random() * 10 : 26 + Math.random() * 54, down = sliced ? (i % 2 ? 46 : -30) + Math.random() * 30 : 60 + Math.random() * 70;
      play(el, [{ transform: `${tr(b.x, b.y)} rotate(0deg)`, opacity: 1 }, { transform: `${tr(b.x + away * .5, b.y - up)} rotate(${spin * .5}deg)`, opacity: 1, offset: .35, easing: "ease-in" }, { transform: `${tr(b.x + away, b.y + down)} rotate(${spin}deg)`, opacity: 0 }], { duration: (sliced ? 480 : 640) + Math.random() * 320, easing: "ease-out", keep: false }).then(() => el.remove());
    });
    crumbs(target.x, target.y, 7);
    for (const p of slop.parts) { p.classList.remove("dsl-spotted"); p.classList.add("dsl-hole"); }
    play(root, [{ transform: "translate(0,0)" }, { transform: "translate(2px,-1px)" }, { transform: "translate(-2px,1px)" }, { transform: "translate(0,0)" }], { duration: 170, keep: false });
  }
  function crumbs(x, y, n) { for (let i = 0; i < n; i++) { const s = spawn("speck"), a = Math.random() * Math.PI * 2, d = 14 + Math.random() * 28; play(s, [{ transform: tr(x, y), opacity: 1 }, { transform: tr(x + Math.cos(a) * d, y + Math.sin(a) * d + 12), opacity: 0 }], { duration: 400, keep: false }).then(() => s.remove()); } }
  const arc = (start, target, lift) => { const apex = Math.min(start.y, target.y) - lift, N = 16, frames = []; for (let i = 0; i <= N; i++) { const t = i / N; frames.push({ transform: tr(start.x + (target.x - start.x) * t, (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * apex + t * t * target.y) }); } return frames; };

  async function fireCannon(slop, ctx) {
    const target = targetOf(slop), cannon = ctx.prop; if (!target) return;
    const barrel = cannon.querySelector(".cn-barrel"), dist0 = Math.hypot(target.x - (cannon._x + 48), target.y - (cannon._y + 20));
    const tilt = -Math.max(18, Math.min(62, 70 - dist0 / 9));
    barrel.style.transform = `rotate(${tilt}deg)`;
    await sleep(230);
    const rad = tilt * Math.PI / 180, start = { x: cannon._x + 20 + Math.cos(rad) * 28, y: cannon._y + 20 + Math.sin(rad) * 28 }, dist = Math.hypot(target.x - start.x, target.y - start.y);
    play(cannon.querySelector(".cn-flash"), [{ opacity: 0, transform: "scale(.3)" }, { opacity: 1, transform: "scale(1.15)", offset: .3 }, { opacity: 0, transform: "scale(.6)" }], { duration: 240, keep: false });
    play(cannon, [{ transform: tr(cannon._x, cannon._y) }, { transform: tr(cannon._x - 7, cannon._y), offset: .2 }, { transform: tr(cannon._x, cannon._y) }], { duration: 300, keep: false });
    play(W.el, [{ transform: tr(W.el._x, W.el._y) }, { transform: tr(W.el._x - 4, W.el._y), offset: .25 }, { transform: tr(W.el._x, W.el._y) }], { duration: 320, keep: false });
    for (let i = 0; i < 3; i++) { const s = spawn("puff"); play(s, [{ transform: `${tr(start.x, start.y)} scale(.5)`, opacity: .9 }, { transform: `${tr(start.x + 8 + i * 9, start.y - 12 - i * 8)} scale(${1.6 + i * .5})`, opacity: 0 }], { duration: 520 + i * 90, keep: false }).then(() => s.remove()); }
    const ball = spawn("ball");
    await play(ball, arc(start, target, 34 + dist * .16), { duration: 330 + dist * .55, easing: "linear" });
    ball.remove();
    const ring = spawn("boom"); play(ring, [{ transform: `${tr(target.x, target.y)} scale(.2)`, opacity: 1 }, { transform: `${tr(target.x, target.y)} scale(1.9)`, opacity: 0 }], { duration: 360, keep: false }).then(() => ring.remove());
    blast(slop, target, ctx.root, false);
    await sleep(300);
    barrel.style.transform = "";
  }

  // The ninja hops, throws spinning nunchucks at the phrase, a slash cuts it, and the nunchucks fly back to his hand.
  async function fireNunchaku(slop, ctx) {
    const target = targetOf(slop); if (!target) return;
    const el = W.el, hand = { x: el._x + 32, y: el._y + 20 };
    play(el, [{ transform: tr(el._x, el._y) }, { transform: tr(el._x, el._y - 11), offset: .4 }, { transform: tr(el._x, el._y) }], { duration: 300, keep: false });
    await sleep(150);
    const dist = Math.hypot(target.x - hand.x, target.y - hand.y), nun = makeNunchaku();
    await play(nun, arc(hand, target, 22 + dist * .1), { duration: 280 + dist * .5, easing: "linear" });
    const len = Math.max(60, Math.min(target.w, 220)), sx = Math.max(target.left - 6, target.x - len / 2);
    const slash = spawn("slash"); slash.style.width = len + 12 + "px";
    play(slash, [{ transform: `${tr(sx, target.y + 5)} rotate(-7deg) scaleX(0)`, opacity: 1 }, { transform: `${tr(sx, target.y + 5)} rotate(-7deg) scaleX(1)`, opacity: 1, offset: .45 }, { transform: `${tr(sx, target.y + 5)} rotate(-7deg) scaleX(1)`, opacity: 0 }], { duration: 320, keep: false }).then(() => slash.remove());
    const star = spawn("star"); play(star, [{ transform: `${tr(target.x, target.y)} rotate(20deg) scale(.3)`, opacity: 1 }, { transform: `${tr(target.x, target.y)} rotate(65deg) scale(1.5)`, opacity: 0 }], { duration: 320, keep: false }).then(() => star.remove());
    blast(slop, target, ctx.root, true);
    play(nun, arc(target, hand, 30 + dist * .08), { duration: 240 + dist * .42, easing: "linear" }).then(() => nun.remove());
    await sleep(330);
  }

  // The chomper leaves the plank, runs along the phrase with its mouth going, and each word disappears as it passes.
  const MOUTH = { dx: 30, dy: 40 };   // where the mouth is inside the 44x58 sprite
  async function chomp(slop, ctx) {
    const el = W.el, lines = linesOf(slop.parts.flatMap((p) => [...p.querySelectorAll(".dsl-w")]));
    for (const p of slop.parts) p.classList.remove("dsl-spotted");
    for (const line of lines) {
      const y = line.y + line.h / 2 - MOUTH.dy;
      el.classList.remove("eating");
      await glide(el, line.x1 - MOUTH.dx - 8, y, 520);
      el.classList.remove("left"); el.classList.add("eating");
      const pace = 250, dur = (line.x2 - line.x1 + 10) / pace * 1000;
      for (const { w, b } of line.words) setTimeout(() => { w.style.visibility = "hidden"; crumbs(b.x + b.w / 2, b.y + b.h / 2, 2); }, ms((b.x - line.x1 + 4) / pace * 1000));
      await play(el, [{ transform: tr(el._x, y) }, { transform: tr(line.x2 - MOUTH.dx + 2, y) }], { duration: dur, easing: "linear" });
      put(el, line.x2 - MOUTH.dx + 2, y);
      for (const { w } of line.words) w.style.visibility = "hidden";
    }
    for (const p of slop.parts) p.classList.add("dsl-eaten");
    el.classList.remove("eating");
    await sleep(90);
  }

  // The trolley rolls along the girder to above the phrase, lets the chain out, and the ball swings through it.
  async function fireBall(slop, ctx) {
    const target = targetOf(slop), crane = ctx.prop; if (!target) return;
    const arm = crane.querySelector(".arm"), py = ctx.plank.y + 6, L = Math.max(30, target.y - py - 11);
    crane.classList.remove("hook");
    await glide(crane, target.x, py, 420);
    const pull = Math.asin(Math.min(.82, 120 / L)) * 180 / Math.PI;
    arm.style.transform = `rotate(${pull}deg)`;
    crane.style.setProperty("--len", L);
    await sleep(380);
    const swing = play(arm, [{ transform: `rotate(${pull}deg)` }, { transform: "rotate(0deg)", offset: .55, easing: "ease-in" }, { transform: `rotate(${-pull * .35}deg)`, offset: .8 }, { transform: "rotate(0deg)" }], { duration: 760, easing: "ease-out" });
    await sleep(760 * .55);
    const ring = spawn("boom"); play(ring, [{ transform: `${tr(target.x, target.y)} scale(.2)`, opacity: 1 }, { transform: `${tr(target.x, target.y)} scale(2.2)`, opacity: 0 }], { duration: 380, keep: false }).then(() => ring.remove());
    poof(target.x, target.y, 5);
    blast(slop, target, ctx.root, false);
    await swing;
    arm.style.transform = "";
    crane.style.setProperty("--len", 14);
    await sleep(260);
  }

  // ------------------------------------------------------------ putting words on the page, three ways
  // Roller or brush: the hero walks above each line with a pole reaching down, and the words appear behind it.
  async function revealPaint(wordEls, ctx) {
    pose("painting");
    const pole = W.el.querySelector(".pole"), reach = (y) => pole.style.setProperty("--len", Math.max(8, y - (W.el._y + 34) + 26));
    for (const line of linesOf(wordEls)) {
      const dur = Math.max(260, (line.x2 - line.x1) * 3.4);
      await walkTo(line.x1 - 31, 320 * ctx.pace); W.el.classList.remove("left"); reach(line.y); await sleep(140);
      for (const { w, b } of line.words) play(w, [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], { duration: Math.max(90, b.w * 3.4), delay: (b.x - line.x1) * 3.4, easing: "linear" });
      await walkTo(line.x2 - 31, (line.x2 - line.x1) / dur * 1000);
    }
    pole.style.setProperty("--len", 0);
  }
  // Chomper: it runs along each line again and the new words pop out behind it.
  async function revealPop(wordEls, ctx) {
    const el = W.el;
    for (const line of linesOf(wordEls)) {
      const y = line.y + line.h / 2 - MOUTH.dy, pace = 300;
      await glide(el, line.x1 - MOUTH.dx - 8, y, 520);
      el.classList.remove("left"); el.classList.add("walking");
      for (const { w, b } of line.words) play(w, [{ opacity: 0, transform: "scale(.2)" }, { opacity: 1, transform: "scale(1.18)", offset: .7 }, { opacity: 1, transform: "scale(1)" }], { duration: 260, delay: (b.x + b.w - line.x1) / pace * 1000, easing: "ease-out" });
      await play(el, [{ transform: tr(el._x, y) }, { transform: tr(line.x2 - MOUTH.dx + 14, y) }], { duration: (line.x2 - line.x1 + 22) / pace * 1000, easing: "linear" });
      put(el, line.x2 - MOUTH.dx + 14, y); el.classList.remove("walking");
    }
    await sleep(240);
  }
  // Crane: each line of new words comes down from the girder on the chain.
  async function revealLower(wordEls, ctx) {
    const crane = ctx.prop, py = ctx.plank.y + 6;
    crane.classList.add("hook"); crane.querySelector(".arm").style.transform = "";
    for (const line of linesOf(wordEls)) {
      const drop = line.y - py - 4;
      await glide(crane, (line.x1 + line.x2) / 2, py, 520);
      crane.style.setProperty("--len", Math.max(14, drop));
      await Promise.all(line.words.map(({ w }) => play(w, [{ opacity: 0, transform: tr(0, -drop) }, { opacity: 1, transform: tr(0, -drop * .82), offset: .12 }, { opacity: 1, transform: tr(0, 3), offset: .86, easing: "ease-out" }, { opacity: 1, transform: "none" }], { duration: 300 + Math.min(420, drop * 1.6), easing: "cubic-bezier(.3,.1,.3,1)" })));
      crane.style.setProperty("--len", 14);
      await sleep(200);
    }
  }
  // Swap a flagged phrase for its replacement, then bring the replacement in the style's way.
  async function rebuild(slop, ctx) {
    const fix = document.createElement("span"); fix.className = "dsl-fix " + ctx.ST.fixClass;
    if (slop.fix) { fix.textContent = slop.fix; wrapWords(fix); }
    await flip(() => { slop.parts[0].replaceWith(fix); slop.parts.slice(1).forEach((p) => p.remove()); }, ctx.root);
    if (!slop.fix) return sleep(110);
    await ctx.ST.reveal([...fix.querySelectorAll(".dsl-w")], ctx);
    fix.classList.add("dsl-dry");
  }

  // ------------------------------------------------------------ the styles
  const STYLES = {
    worker: { speed: 1.35, pace: 1, plank: "plank", hero: () => makeWorker(), prop: makeCannon, fire: fireCannon, reveal: revealPaint, fixClass: "dsl-paint" },
    ninja: { speed: 1.4, pace: 1.3, plank: "plank bamboo", hero: makeNinja, prop: null, fire: fireNunchaku, reveal: revealPaint, fixClass: "dsl-paint dsl-ink", smoke: true },
    chomper: { speed: 1.3, pace: 1.25, plank: "plank", hero: makeChomper, prop: null, fire: chomp, reveal: revealPop, fixClass: "dsl-pop", roams: true },
    crane: { speed: 1.35, pace: 1, plank: "plank girder", hero: () => makeWorker("#f08a3c"), prop: makeCrane, fire: fireBall, reveal: revealLower, fixClass: "dsl-lower" },
  };

  // ------------------------------------------------------------ binning: mostly slop, so tear it up and write it again
  async function binIt(ctx, res, before, finish) {
    const { root, home, pace, ST } = ctx, box = at(root.getBoundingClientRect());
    pose(); if (ST.roams) await glide(W.el, home.x, home.y, 520); else await walkTo(home.x, 330 * pace);
    W.el.classList.remove("left"); pose("aiming");
    const h = Math.min(box.h, innerHeight * .8), half = box.w / 2;
    // the post becomes a sheet of paper, in two halves
    const L = spawn("sheet l"), R = spawn("sheet r");
    for (const s of [L, R]) { s.style.width = half + 8 + "px"; s.style.height = h + 8 + "px"; }
    put(L, box.x - 6, box.y - 4); put(R, box.x + half - 2, box.y - 4);
    await Promise.all([L, R].map((s) => play(s, [{ opacity: 0 }, { opacity: 1 }], { duration: 180, keep: false })));
    root.style.visibility = "hidden";
    await sleep(260);
    // rip
    await Promise.all([
      play(L, [{ transform: tr(L._x, L._y) }, { transform: `${tr(L._x - 18, L._y + 8)} rotate(-7deg)` }], { duration: 340, easing: "cubic-bezier(.3,1.5,.5,1)" }),
      play(R, [{ transform: tr(R._x, R._y) }, { transform: `${tr(R._x + 18, R._y + 5)} rotate(6deg)` }], { duration: 340, easing: "cubic-bezier(.3,1.5,.5,1)" }),
    ]);
    await sleep(160);
    // the bin arrives beside the post, inside the window
    const bin = makeBin(), bx = Math.min(box.x + box.w + 14, scrollX + innerWidth - 60), by = Math.min(box.y + h - 34, scrollY + innerHeight - 78);
    put(bin, bx, by);
    await play(bin, [{ opacity: 0, transform: tr(bx, by + 26) }, { opacity: 1, transform: tr(bx, by) }], { duration: 260, easing: "ease-out" });
    bin.classList.add("open");
    // each half is crumpled into a ball and thrown in
    const mouth = { x: bx + 24, y: by + 16 };
    const toss = async (s, dx, rot, delay) => {
      await sleep(delay);
      const w = s.offsetWidth, hh = s.offsetHeight, cx = s._x + dx + w / 2, cy = s._y + 6 + hh / 2, k = Math.min(.22, 34 / Math.max(w, hh));
      await play(s, [{ transform: `${tr(s._x + dx, s._y + 6)} rotate(${rot}deg) scale(1)` }, { transform: `${tr(s._x + dx, s._y + 6)} rotate(${rot * 14}deg) scale(${k})` }], { duration: 380, easing: "ease-in" });
      s.style.borderRadius = "50%"; s.style.clipPath = "none";
      const frames = [], N = 14, apex = Math.min(cy, mouth.y) - 70;
      for (let i = 0; i <= N; i++) { const t = i / N, x = cx + (mouth.x - cx) * t, y = (1 - t) * (1 - t) * cy + 2 * (1 - t) * t * apex + t * t * mouth.y; frames.push({ transform: `${tr(x - w / 2, y - hh / 2)} rotate(${rot * 14 + t * 300}deg) scale(${k})`, opacity: i === N ? 0 : 1 }); }
      await play(s, frames, { duration: 520, easing: "linear" });
      s.remove();
      play(bin, [{ transform: tr(bx, by) }, { transform: tr(bx, by + 4), offset: .4 }, { transform: tr(bx, by) }], { duration: 180, keep: false });
    };
    await Promise.all([toss(L, -18, -7, 0), toss(R, 18, 6, 220)]);
    bin.classList.remove("open");
    await sleep(320);
    play(bin, [{ opacity: 1, transform: tr(bx, by) }, { opacity: 0, transform: tr(bx, by + 26) }], { duration: 300 }).then(() => bin.remove());

    // the post, written again from scratch: paragraphs separated by a blank line
    const fix = document.createElement("span"); fix.className = "dsl-fix " + ST.fixClass;
    res.rewrite.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).forEach((para, i) => {
      if (i) fix.append(document.createElement("br"), document.createElement("br"));
      para.split(/\n/).forEach((line, j) => { if (j) fix.append(document.createElement("br")); fix.append(line); });
    });
    root.replaceChildren(fix);
    wrapWords(fix);
    root.style.visibility = "";
    pose();
    await ST.reveal([...fix.querySelectorAll(".dsl-w")], ctx);
    fix.classList.add("dsl-dry");
    await sleep(700);
    unwrap(root);
    return finish(`Binned: ${Math.round(res.fraction * 100)}% of it was slop. Rewritten from scratch, ${words(before.text)} → ${words(textMap(root).text)} words.`, true);
  }

  // ------------------------------------------------------------ the whole job on one element
  const askServer = (text) => new Promise((resolve) => {
    if (window.__deslopBackend) return window.__deslopBackend(text, settings.level, settings.bin).then(resolve);   // test pages plug in here
    try { chrome.runtime.sendMessage({ type: "deslop", text, level: settings.level, bin: settings.bin }, (res) => resolve(res || { ok: false, error: chrome.runtime.lastError ? chrome.runtime.lastError.message : "No answer from the extension." })); }
    catch (e) { resolve({ ok: false, error: "The extension was reloaded. Refresh this page and try again." }); }
  });

  async function run(root) {
    if (busy) return; busy = true; skipping = false;
    const ST = STYLES[settings.style] || STYLES.worker, pace = ST.pace;
    SPEED = ST.speed;
    overlay(); fx.replaceChildren();
    const original = root.cloneNode(true), before = textMap(root);
    const request = askServer(before.text);
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const oldMargin = root.style.marginTop;
    if (!OPT.embedded) {
      root.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
      await sleep(420);
      // scaffolding: room above the text for the plank and the hero
      root.classList.add("dsl-site");
      root.style.marginTop = (parseFloat(getComputedStyle(root).marginTop) || 0) + 62 + "px";
      await new Promise((r) => setTimeout(r, calm ? 0 : 330));
    }
    const b = at(root.getBoundingClientRect()), left = Math.max(6, b.x - 96);
    const plank = { x1: left, x2: Math.max(left + 220, b.x + b.w + 24), y: b.y - 9 };
    const plankEl = spawn(ST.plank); plankEl.style.width = plank.x2 - plank.x1 + "px"; put(plankEl, plank.x1, plank.y);
    const hero = (W.el = ST.hero()), prop = ST.prop ? ST.prop() : null;
    const home = { x: plank.x1 + 4, y: plank.y - W.feet }, gun = { x: plank.x1 + 46, y: plank.y - 33 };
    const ctx = { root, plank, home, gun, hero, prop, pace, ST };
    W.lo = plank.x1 - 200; W.hi = plank.x2 - 44;
    play(plankEl, [{ transform: `${tr(plank.x1, plank.y)} scaleX(0)` }, { transform: `${tr(plank.x1, plank.y)} scaleX(1)` }], { duration: 300, keep: false });
    if (ST.smoke) {
      // he drops in from above in a puff of smoke
      put(hero, home.x, home.y); poof(home.x + 22, home.y + 30, 8);
      await play(hero, [{ transform: tr(home.x, home.y - 90), opacity: 0 }, { transform: tr(home.x, home.y), opacity: 1 }], { duration: 280, easing: "cubic-bezier(.3,0,.6,1)" });
      put(hero, home.x, home.y);
    } else {
      put(hero, plank.x1 - 80, home.y);
      if (prop === null) { /* nothing to bring */ }
      else if (ST.prop === makeCannon) { put(prop, plank.x1 - 150, gun.y); play(prop, [{ transform: tr(plank.x1 - 150, gun.y), opacity: 0 }, { transform: tr(gun.x, gun.y), opacity: 1 }], { duration: 620, easing: "ease-out" }).then(() => put(prop, gun.x, gun.y)); }
      else { put(prop, gun.x + 20, plank.y + 6); play(prop, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, keep: false }); }
      play(hero, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, keep: false });
      await walkTo(home.x, 150 * pace);
      if (ST.prop === makeCannon) put(prop, gun.x, gun.y);
    }

    // act 1: read it. The hero keeps pacing and re-reading until the edits come back.
    let res = null; request.then((r) => (res = r));
    const total = before.text.length, dur = Math.min(3200, Math.max(1500, total * 9));
    await walkTo(gun.x + 62, 190 * pace);
    await readPass(root, plank, total, dur / pace);
    while (!res && !skipping) { pose(); await walkTo(gun.x + 62, 300 * pace); await readPass(root, plank, total, dur * .8 / pace); }
    if (!res) res = await request;

    const finish = async (message, undoable) => {
      pose();
      if (ST.roams) await glide(hero, home.x, home.y, 520); else await walkTo(home.x, 330 * pace);
      hero.classList.remove("left");
      if (undoable) { pose("cheer"); await sleep(560); pose(); }
      if (ST.smoke) poof(hero._x + 22, hero._y + 30, 9);
      await play(plankEl, [{ transform: `${tr(plank.x1, plank.y)} scaleX(1)` }, { transform: `${tr(plank.x1, plank.y)} scaleX(0)` }], { duration: 200, keep: false });
      plankEl.style.opacity = 0;
      if (prop) play(prop, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
      await play(hero, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
      fx.replaceChildren();
      root.style.marginTop = oldMargin; root.style.visibility = "";
      setTimeout(() => root.classList.remove("dsl-site"), 400);
      busy = false; skipping = false;
      if (OPT.embedded) return OPT.onDone && OPT.onDone(message, undoable);
      toast(message, undoable ? "Undo" : null, () => { root.replaceChildren(...original.cloneNode(true).childNodes); }, undoable ? 12000 : 6000);
    };
    if (!res.ok) return finish(res.error || "Could not get the rewrite.", false);
    const edits = (res.edits || []).map((e) => ({ ...e, at: before.text.indexOf(e.quote) })).filter((e) => e.at >= 0).sort((a, b) => a.at - b.at);
    if (!edits.length) return finish("Nothing to remove. This one reads clean.", false);
    if (settings.bin && res.rewrite) return binIt(ctx, res, before, finish);

    // mark the slop (last to first, so earlier positions stay valid), then go back to the start of the plank
    const slops = [];
    for (const e of [...edits].reverse()) { const parts = wrapText(root, e.at, e.at + e.quote.length, "dsl-slop"); if (parts.length) slops.unshift({ parts, fix: e.fix }); }
    // a long list of cuts runs faster, so a ruthless pass does not take minutes
    SPEED *= 1 + Math.min(1.6, Math.max(0, slops.length - 6) * 0.13);
    pose();
    const back = walkTo(home.x, 330 * pace);
    for (const s of slops) { s.parts.forEach((p) => p.classList.add("dsl-spotted")); await sleep(110); }
    await back; hero.classList.remove("left"); pose("aiming");

    // act 2: remove each phrase.  act 3: put the replacements in.
    wrapWords(root);
    for (const s of slops) await ST.fire(s, ctx);
    pose();
    for (const s of slops) await rebuild(s, ctx);
    await sleep(700);
    unwrap(root); tidy(root);
    const now = words(textMap(root).text), was = words(before.text);
    return finish(`Deslopped: ${was} → ${now} words, ${slops.length} phrase${slops.length === 1 ? "" : "s"} removed.`, true);
  }

  // ------------------------------------------------------------ picking what to deslop
  // Only the words of a post are ever touched: never the author line, the avatar, or the buttons.
  // Known sites name their post text; elsewhere the picker drills down to the block that holds most of the text.
  const POST = "[data-testid='tweetText'], .update-components-text, .feed-shared-inline-show-more-text, .feed-shared-update-v2__description, .feed-shared-text, .attributed-text-segment-list__content, [data-test-id*='commentary'], [data-deslop]";
  const CARD = "article, [data-urn], .feed-shared-update-v2, [role='article']";
  const len = (el) => (el.innerText || "").trim().length;
  function candidate(t) {
    if (!t || t.nodeType !== 1 || (host && host.contains(t))) return null;
    const post = t.closest(POST);
    if (post) return post;
    // clicked somewhere else on a post card (the author, the padding): use that card's text
    const card = t.closest(CARD), inner = card && card.querySelector(POST);
    if (inner && len(inner) >= 20) return inner;
    let el = t;
    while (el && el !== document.body && len(el) < 60) el = el.parentElement;
    if (!el || el === document.body || el === document.documentElement) return null;
    // drill down: while one child holds most of the text, that child is the content and the rest is chrome
    for (;;) {
      const total = len(el), kids = [...el.children].filter((c) => !/^(BR|SCRIPT|STYLE)$/.test(c.tagName) && getComputedStyle(c).display !== "inline");
      const best = kids.sort((a, b) => len(b) - len(a))[0];
      if (!best || len(best) < total * 0.6 || len(best) < 60) break;
      el = best;
    }
    return len(el) > 9000 ? null : el;
  }
  let hot = null, picking = false, wheelEl = null;
  const overUi = (e) => !!host && e.composedPath().includes(host);
  const mark = (el) => { if (hot === el) return; if (hot) hot.classList.remove("dsl-pick"); hot = el; if (hot) hot.classList.add("dsl-pick"); };
  const onMove = (e) => { if (!wheelEl) mark(overUi(e) ? null : candidate(e.target)); };
  const onClick = (e) => {
    if (overUi(e)) return;                    // a click on the wheel itself
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (wheelEl) return closeWheel(true);     // a click outside the wheel cancels
    const el = candidate(e.target);
    if (!el) { stopPick(); return toast("No text there to deslop."); }
    mark(el);
    showWheel(e.clientX, e.clientY, el);
  };
  const onKey = (e) => { if (e.key === "Escape") { if (wheelEl) closeWheel(true); else if (picking) stopPick(); else if (busy) skip(); } };
  const begin = (el) => {
    stopPick();
    // a truncated LinkedIn post: open it first, so the whole text is read
    const more = el.parentElement && el.parentElement.querySelector("button[class*='see-more'], button.see-more");
    if (more && /more/i.test(more.textContent)) more.click();
    setTimeout(() => run(el), more ? 250 : 0);
  };

  // The selector: a wheel that opens where you clicked. Four styles start the job; two segments set
  // how hard to cut and whether a mostly-slop post is binned. The hub runs it with the last style used.
  const ICONS = {
    worker: () => [S("path", { d: "M-9,4 Q-9,-8 0,-8 Q9,-8 9,4 Z" }), S("path", { d: "M-12,4 L12,4" })],
    ninja: () => [S("path", { class: "solid", d: "M0,-11 L3,-3 L11,0 L3,3 L0,11 L-3,3 L-11,0 L-3,-3 Z" })],
    chomper: () => [S("path", { d: "M8,-6 A10,10 0 1 0 8,6 L0,0 Z" }), S("circle", { class: "solid", cx: -1, cy: -5, r: 1.5 })],
    crane: () => [S("path", { d: "M-10,-9 L10,-9 M0,-9 L0,0" }), S("circle", { class: "solid", cx: 0, cy: 5, r: 5 })],
    bin: () => [S("path", { d: "M-8,-5 L8,-5 M-5.5,-5 L-4.5,9 L4.5,9 L5.5,-5 M-2.5,-8.5 L2.5,-8.5" })],
    level: () => [S("path", { d: "M-10,6 A10,10 0 0 1 10,6" }), S("path", { class: "needle", d: "M0,6 L0,-4" }), S("circle", { class: "solid", cx: 0, cy: 6, r: 1.8 })],
  };
  function showWheel(x, y, target) {
    overlay();
    if (toastEl) toastEl.remove();
    const R = 170, rIn = 62, rOut = 150, gap = 7;
    const el = (wheelEl = document.createElement("div")); el.className = "wheel";
    el.style.left = Math.max(R + 8, Math.min(innerWidth - R - 8, x)) + "px"; el.style.top = Math.max(R + 8, Math.min(innerHeight - R - 8, y)) + "px";
    const svg = S("svg", { viewBox: `${-R} ${-R} ${2 * R} ${2 * R}`, width: 2 * R, height: 2 * R });
    const hub = document.createElement("div"); hub.className = "hub";
    const hubMain = document.createElement("span"), hubSub = document.createElement("small"); hub.append(hubMain, hubSub);
    const rest = () => { hubMain.textContent = "DESLOP"; hubSub.textContent = `${STYLE_NAMES[settings.style]} · ${LEVELS[settings.level]}`.toUpperCase(); };
    const pt = (r, deg) => { const a = deg * Math.PI / 180; return [r * Math.cos(a), r * Math.sin(a)]; };
    const sector = (a0, a1) => {
      // inset by the corner radius; the same gap in pixels at the inner and outer edge
      const ri = rIn + 5, ro = rOut - 5, go = (gap / ro) * 90 / Math.PI * 2 / 2 + 1.4, gi = (gap / ri) * 90 / Math.PI * 2 / 2 + 3.2;
      const [x1, y1] = pt(ro, a0 + go), [x2, y2] = pt(ro, a1 - go), [x3, y3] = pt(ri, a1 - gi), [x4, y4] = pt(ri, a0 + gi);
      return `M${x1},${y1} A${ro},${ro} 0 0 1 ${x2},${y2} L${x3},${y3} A${ri},${ri} 0 0 0 ${x4},${y4} Z`;
    };
    const items = [
      { id: "worker", label: () => "WORKER", tip: "CANNON + ROLLER", style: true },
      { id: "ninja", label: () => "NINJA", tip: "NUNCHUCKS + INK", style: true },
      { id: "chomper", label: () => "CHOMPER", tip: "EATS THE SLOP", style: true },
      { id: "crane", label: () => "CRANE", tip: "WRECKING BALL", style: true },
      { id: "bin", label: () => (settings.bin ? "BIN ON" : "BIN OFF"), tip: "TEAR UP IF 60%+ SLOP" },
      { id: "level", label: () => LEVELS[settings.level].toUpperCase(), tip: "HOW HARD TO CUT" },
    ];
    items.forEach((it, i) => {
      const a0 = -120 + i * 60, mid = a0 + 30, [cx, cy] = pt((rIn + rOut) / 2 + 2, mid);
      const text = S("text", { x: cx, y: cy + 21 }), ico = S("g", { class: "ico", transform: `translate(${cx} ${cy - 5})` }, ...ICONS[it.id]());
      const g = S("g", { class: "s" + (it.style && settings.style === it.id ? " cur" : "") }, S("path", { class: "seg", d: sector(a0, a0 + 60) }), ico, text);
      const paint = () => {
        text.textContent = it.label();
        if (it.id === "level") ico.querySelector(".needle").setAttribute("transform", `rotate(${-60 + (settings.level - 1) * 40} 0 6)`);
        if (it.id === "bin") ico.style.opacity = settings.bin ? 1 : .35;
      };
      paint();
      g.addEventListener("mouseenter", () => { hubMain.textContent = it.label(); hubSub.textContent = it.tip; });
      g.addEventListener("mouseleave", rest);
      g.addEventListener("click", () => {
        if (it.style) { settings.style = it.id; saveSettings(); closeWheel(false); return begin(target); }
        if (it.id === "bin") settings.bin = !settings.bin; else settings.level = settings.level % 4 + 1;
        saveSettings(); paint(); hubMain.textContent = it.label();
      });
      svg.append(g);
    });
    hub.addEventListener("click", () => { closeWheel(false); begin(target); });
    rest();
    el.append(svg, hub);
    fx.parentNode.append(el);
  }
  function closeWheel(cancel) { if (wheelEl) { wheelEl.remove(); wheelEl = null; } if (cancel) stopPick(); }
  function stopPick() { picking = false; mark(null); if (wheelEl) { wheelEl.remove(); wheelEl = null; } if (toastEl) toastEl.remove(); removeEventListener("mousemove", onMove, true); removeEventListener("click", onClick, true); }
  function pick() {
    if (busy) return toast("Still working on the last one. Esc skips to the end.");
    if (picking) return;
    picking = true;
    loaded.then(() => { if (picking) toast("Deslop: click a post or paragraph. Esc cancels.", null, null, 0); });
    addEventListener("mousemove", onMove, true); addEventListener("click", onClick, true);
  }
  addEventListener("keydown", onKey, true);

  window.__deslop = { pick, run, settings };
  if (!OPT.embedded) pick();
})();
