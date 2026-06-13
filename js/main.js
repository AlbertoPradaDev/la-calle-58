/**
 * La Calle 58 — Main Script
 *
 * Modules:
 *   0. Noise Pre-bake    — generate static PNG noise, replacing live SVG feTurbulence
 *   1. Canvas Hero       — scroll-scrub via GSAP (mobile: 61 frames @ 640×360, desktop: 121 @ 1280×720)
 *   2. Hero Text Fade    — integrated into mobile rAF loop; passive scroll listener on desktop
 *   3. Navigation        — scroll state + hamburger menu
 *   4. Kinetic Marquee   — rAF loop, paused by IntersectionObserver when offscreen
 *   5. Spotlight Cards   — CSS custom-property cursor tracking (cached rects)
 *   6. Odometer Counter  — digit-strip animation on scroll enter
 *   7. Color Shift       — body background transition per section
 *   8. Fade-up Animations — GSAP ScrollTrigger on .fade-up elements
 *   9. Magnetic Button   — subtle cursor-pull on .btn-primary hover
 */

(function () {
  'use strict';

  gsap.registerPlugin(ScrollTrigger);


  /* ─────────────────────────────────────────────────────
     0. NOISE PRE-BAKE
     The SVG <feTurbulence> filter is rasterized in software on every initial render
     and on every viewport resize. We replace it with a one-time canvas-generated
     noise PNG tiled as background-image. After this runs the filter never executes again.
  ───────────────────────────────────────────────────── */

  (function bakeNoise() {
    var el = document.querySelector('.noise-layer');
    if (!el) return;
    try {
      var nc = document.createElement('canvas');
      nc.width = nc.height = 256;
      var ncx = nc.getContext('2d');
      var id = ncx.createImageData(256, 256);
      var px = id.data;
      for (var i = 0, len = px.length; i < len; i += 4) {
        var v = (Math.random() * 255) | 0;
        px[i] = px[i + 1] = px[i + 2] = v;
        px[i + 3] = 255;
      }
      ncx.putImageData(id, 0, 0);
      el.style.backgroundImage = 'url(' + nc.toDataURL('image/png') + ')';
      el.style.backgroundSize = '256px 256px';
      el.style.backgroundRepeat = 'repeat';
    } catch (e) { /* secure-context block — noise layer simply shows nothing */ }
  })();


  /* ─────────────────────────────────────────────────────
     1. CANVAS HERO — scroll-driven frame sequence
     Mobile:  61 frames, 640×360, assets/frames-mobile/
     Desktop: 121 frames, 1280×720, assets/frames/
  ───────────────────────────────────────────────────── */

  var isMobile = window.innerWidth < 768;
  var TOTAL    = isMobile ? 61 : 121;
  var FOLDER   = isMobile ? 'assets/frames-mobile' : 'assets/frames';

  var canvas = document.getElementById('heroCanvas');
  // alpha:false → canvas is opaque; drawImage becomes a straight blit with no alpha-blend pass.
  // ~15-25% faster per draw on mobile GPU.
  var ctx = canvas.getContext('2d', { alpha: false });

  // Cover-fit geometry — computed once, cached here, updated only on resize.
  // Without this cache, r/dw/dh/ox/oy are recalculated on every drawFrame call (60×/s).
  var drawGeom = { dw: 0, dh: 0, ox: 0, oy: 0 };

  // Mobile: DPR=1 → canvas pixels = logical pixels.
  // 640×360 mobile frames at DPR=1 still fill the screen with cover-fit;
  // DPR=2 would make the canvas 4× larger (half-width × half-height cost) with no visible gain.
  var DPR = 1;

  var frames        = new Array(TOTAL);
  var imagesLoaded  = 0;
  var bitmapsReady  = 0;
  var currentFrame  = 0;

  // Cache loader elements — queried by ID on every bitmap load in the hot path
  var loaderFill  = document.getElementById('loaderFill');
  var loaderCount = document.getElementById('loaderCount');

  // Hero fade vars — declared here so the consolidated resize handler can reach them
  var heroEl        = document.querySelector('.hero');
  var heroContentEl = document.querySelector('.hero-content');
  var scrollHintEl  = document.querySelector('.scroll-hint');
  var heroFadeH     = heroEl.offsetHeight;
  var lastFadeProg  = -1;
  var lastHintProg  = -1;

  // Mobile-only scroll vars — hoisted so resize handler can update them.
  // viewH uses window.innerHeight (= "large viewport" on iOS 13+, matches 100vh in CSS).
  // visualViewport.height shrinks when the browser chrome is visible and grows when it hides —
  // using it here would cause heroScrollRange to jump on the first scroll (zoom artifact).
  var heroScrollEl    = isMobile ? heroEl : null;
  var heroH           = isMobile ? heroEl.offsetHeight : 0;
  var viewH           = window.innerHeight;
  var heroScrollRange = isMobile ? heroH - viewH : 0;

  function updateDrawGeom() {
    // Use frame 0 for source dimensions; fall back to first available frame
    var src = frames[0];
    if (!src) {
      for (var fi = 0; fi < frames.length; fi++) {
        if (frames[fi]) { src = frames[fi]; break; }
      }
    }
    if (!src) return;
    var srcW = src.naturalWidth  || src.width;
    var srcH = src.naturalHeight || src.height;
    if (!srcW || !srcH) return;
    var r      = Math.max(canvas.width / srcW, canvas.height / srcH);
    drawGeom.dw = srcW * r;
    drawGeom.dh = srcH * r;
    drawGeom.ox = (canvas.width  - drawGeom.dw) / 2;
    drawGeom.oy = (canvas.height - drawGeom.dh) / 2;
  }

  function resizeCanvas() {
    var w = window.innerWidth;
    // window.innerHeight = "large viewport" on iOS 13+ — stable across chrome show/hide.
    // visualViewport.height would be smaller when the chrome is visible and would grow
    // on first scroll, triggering a cover-fit recalculation that appears as a zoom.
    var h = window.innerHeight;
    canvas.width  = w * DPR;
    canvas.height = h * DPR;
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    updateDrawGeom();
    if (bitmapsReady > 0) drawFrame(currentFrame);
  }

  // Track the last resize width so we can skip height-only changes on mobile.
  // On iOS, the browser chrome hiding/showing fires a resize event but only changes
  // the height — ignoring these prevents the cover-fit zoom on first scroll.
  var prevResizeW = window.innerWidth;

  // Single consolidated resize handler (was two separate listeners before)
  window.addEventListener('resize', function () {
    var nowW = window.innerWidth;
    if (isMobile && nowW === prevResizeW) return; // height-only = iOS chrome toggle
    prevResizeW = nowW;

    resizeCanvas();
    heroFadeH = heroEl.offsetHeight;
    if (isMobile) {
      heroH           = heroScrollEl.offsetHeight;
      viewH           = window.innerHeight;
      heroScrollRange = heroH - viewH;
    }
    var nowMobile = window.innerWidth < 768;
    if (nowMobile !== isMobile) window.location.reload();
  });
  resizeCanvas();

  /** Cover-fit draw — uses cached geometry.
   *  clearRect is intentionally absent: cover-fit guarantees the image always fills
   *  the full canvas (r = max of both axis ratios), so drawImage completely overwrites
   *  the previous frame with no transparent gaps. */
  function drawFrame(idx) {
    var src = frames[idx];
    if (!src || !drawGeom.dw) return;
    ctx.drawImage(src, drawGeom.ox, drawGeom.oy, drawGeom.dw, drawGeom.dh);
  }

  function dismissLoader() {
    var loader = document.getElementById('loader');
    loader.style.opacity = '0';
    setTimeout(function () {
      loader.style.display = 'none';
      // Hero entrance — fromTo avoids the opacity:0→snap flash
      gsap.fromTo('.hero-badge',    { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.55, delay: 0.05, ease: 'power3.out' });
      gsap.fromTo('.hero h1',       { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.75, delay: 0.18, ease: 'power3.out' });
      gsap.fromTo('.hero-tagline',  { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.55, delay: 0.32, ease: 'power3.out' });
      gsap.fromTo('.hero-actions',  { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5,  delay: 0.46, ease: 'power3.out' });
      gsap.fromTo('.hero-features', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5,  delay: 0.58, ease: 'power3.out' });
    }, 700);
  }

  function checkAllReady() {
    if (bitmapsReady < TOTAL) return;

    if (!frames[0]) {
      var fallback = new Image();
      fallback.onload = function () {
        frames[0] = fallback;
        resizeCanvas();
        drawFrame(0);
        dismissLoader();
      };
      fallback.onerror = dismissLoader;
      fallback.src = 'assets/hero.jpg';
      return;
    }

    resizeCanvas();
    requestAnimationFrame(function () {
      drawFrame(0); // second draw after first paint cycle (CDN race-condition guard)
      requestAnimationFrame(dismissLoader);
    });
  }

  function onFrameReady(n) {
    bitmapsReady++;
    var pct = Math.round(bitmapsReady / TOTAL * 100);
    loaderFill.style.width  = pct + '%';
    loaderCount.textContent = pct + '%';

    if (n === 0) {
      updateDrawGeom();
      currentFrame = 0;
      drawFrame(0);
    }

    checkAllReady();
  }

  for (var i = 0; i < TOTAL; i++) {
    (function (n) {
      var img = new Image();

      img.onload = function () {
        imagesLoaded++;
        if (window.createImageBitmap) {
          createImageBitmap(img).then(function (bitmap) {
            frames[n] = bitmap;
            onFrameReady(n);
          }).catch(function () {
            frames[n] = img;
            onFrameReady(n);
          });
        } else {
          frames[n] = img;
          onFrameReady(n);
        }
      };

      img.onerror = function () {
        imagesLoaded++;
        bitmapsReady++;
        checkAllReady();
      };

      img.src = FOLDER + '/frame-' + String(n + 1).padStart(4, '0') + '.jpg';
    })(i);
  }

  // Safety valve: if frames stall (slow CDN, missing folder), force loader out after 10 s
  setTimeout(function () {
    if (bitmapsReady < TOTAL) {
      bitmapsReady = TOTAL;
      checkAllReady();
    }
  }, 10000);


  /* ─────────────────────────────────────────────────────
     2. HERO TEXT FADE — shared between mobile rAF and desktop scroll listener
  ───────────────────────────────────────────────────── */

  // Accepts scrollY as argument so the mobile rAF loop can pass its already-read value
  // without a second window.scrollY read per frame.
  function updateHeroFade(s) {
    if (s > heroFadeH * 0.4 && lastFadeProg === 1 && lastHintProg === 1) return;

    var fadeStart = heroFadeH * 0.10;
    var fadeEnd   = heroFadeH * 0.35;
    var progress  = Math.min(1, Math.max(0, (s - fadeStart) / (fadeEnd - fadeStart)));
    if (progress !== lastFadeProg) {
      lastFadeProg = progress;
      heroContentEl.style.opacity   = (1 - progress).toFixed(4);
      heroContentEl.style.transform = 'translateY(' + (-55 * progress).toFixed(2) + 'px)';
    }

    var hStart = heroFadeH * 0.04;
    var hEnd   = heroFadeH * 0.14;
    var hProg  = Math.min(1, Math.max(0, (s - hStart) / (hEnd - hStart)));
    if (hProg !== lastHintProg) {
      lastHintProg = hProg;
      scrollHintEl.style.opacity = (1 - hProg).toFixed(4);
    }
  }

  // Initialise on load so refresh-at-bottom shows correct opacity immediately
  updateHeroFade(window.scrollY);


  /* ─────────────────────────────────────────────────────
     SCROLL DRIVER — mobile vs desktop
  ───────────────────────────────────────────────────── */

  if (isMobile) {
    /* Mobile rAF loop reads window.scrollY once per frame and drives both the canvas
       scrub and the hero text fade. Combining both into one loop:
         • Eliminates the separate passive scroll listener on mobile
         • Reads scrollY exactly once per frame instead of twice
         • Keeps both animations in sync with the display refresh cycle

       Lerp removed: on iOS, scroll events are already async-delayed; adding a second
       lerp layer (floatFrame += diff*0.3) compounds the perceived lag. Snapping to the
       exact frame for the current scroll position feels more responsive. */

    var heroRafId = null;

    function heroRafLoop() {
      var s   = window.scrollY;
      var idx = Math.round(Math.min(1, Math.max(0, s / heroScrollRange)) * (TOTAL - 1));

      if (idx !== currentFrame && frames[idx]) {
        currentFrame = idx;
        drawFrame(idx);
      }

      updateHeroFade(s);

      heroRafId = requestAnimationFrame(heroRafLoop);
    }

    // IntersectionObserver pauses the loop when the hero section is fully offscreen —
    // essential so the rAF doesn't consume CPU/GPU for the rest of the page.
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        if (!heroRafId) heroRafId = requestAnimationFrame(heroRafLoop);
      } else {
        cancelAnimationFrame(heroRafId);
        heroRafId = null;
      }
    }, { threshold: 0 }).observe(heroEl);

    heroRafId = requestAnimationFrame(heroRafLoop);

  } else {
    /* Desktop: GSAP scrub. drawFrame called directly inside onUpdate — we are already
       inside GSAP's own rAF tick, so calling scheduleDrawFrame (which queued a second
       rAF) added 1 frame of unnecessary latency. */
    gsap.to({ f: 0 }, {
      f: TOTAL - 1,
      snap: 'f',
      ease: 'none',
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: 0.3
      },
      onUpdate: function () {
        var idx = Math.round(this.targets()[0].f);
        if (idx !== currentFrame) {
          currentFrame = idx;
          drawFrame(idx);
        }
      }
    });

    // Desktop keeps the scroll listener for hero fade (GSAP handles the canvas separately)
    window.addEventListener('scroll', function () { updateHeroFade(window.scrollY); }, { passive: true });
  }


  /* ─────────────────────────────────────────────────────
     3. NAVIGATION — scroll state + hamburger menu
  ───────────────────────────────────────────────────── */

  var mainNav  = document.getElementById('mainNav');
  var burger   = document.getElementById('navBurger');
  var mobileNav = document.getElementById('navMobile');

  ScrollTrigger.create({
    start: '60px top',
    onEnter:     function () { mainNav.classList.add('scrolled'); },
    onLeaveBack: function () { mainNav.classList.remove('scrolled'); }
  });

  function openMobileNav() {
    burger.classList.add('open');
    mobileNav.classList.add('open');
    mobileNav.setAttribute('aria-hidden', 'false');
    burger.setAttribute('aria-expanded', 'true');
    mainNav.style.zIndex = '106';
    document.body.style.overflow = 'hidden';
  }

  window.closeMobileNav = function () {
    burger.classList.remove('open');
    mobileNav.classList.remove('open');
    mobileNav.setAttribute('aria-hidden', 'true');
    burger.setAttribute('aria-expanded', 'false');
    mainNav.style.zIndex = '';
    document.body.style.overflow = '';
  };

  burger.addEventListener('click', function () {
    mobileNav.classList.contains('open') ? window.closeMobileNav() : openMobileNav();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') window.closeMobileNav();
  });


  /* ─────────────────────────────────────────────────────
     4. KINETIC MARQUEE — scroll-velocity reactive
     IntersectionObserver pauses the rAF loop when the band is offscreen.
     document.fonts.ready replaces the unreliable setTimeout(150) for width measurement.
  ───────────────────────────────────────────────────── */

  var row     = document.getElementById('marqueeRow');
  var content = document.getElementById('marqueeContent');
  var clone   = content.cloneNode(true);
  row.appendChild(clone);

  var scrollVel = 0;
  ScrollTrigger.create({
    onUpdate: function (s) { scrollVel = Math.abs(s.getVelocity()); }
  });

  var baseSpd   = 55;
  var marqX     = 0;
  var marqW     = 0;
  var marqRafId = null;
  var marqVisible = false;

  function startMarquee() {
    if (marqRafId || !marqW) return; // guard: don't start if already running or width unknown
    (function tick() {
      var spd = (baseSpd + scrollVel * 0.1) / 60;
      marqX -= spd;
      if (marqX <= -marqW) marqX += marqW;
      row.style.transform = 'translateX(' + marqX + 'px)';
      marqRafId = requestAnimationFrame(tick);
    })();
  }

  function stopMarquee() {
    cancelAnimationFrame(marqRafId);
    marqRafId = null;
  }

  // rootMargin:200px means we start the loop slightly before the band enters the viewport
  new IntersectionObserver(function (entries) {
    if (entries[0].isIntersecting) {
      marqVisible = true;
      startMarquee();
    } else {
      marqVisible = false;
      stopMarquee();
    }
  }, { rootMargin: '200px 0px' }).observe(row.parentElement);

  // Wait for fonts before measuring — offsetWidth is wrong if custom fonts haven't loaded
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () {
    marqW = content.offsetWidth;
    if (marqVisible) startMarquee();
  });


  /* ─────────────────────────────────────────────────────
     5. SPOTLIGHT CARDS — cursor-tracking CSS vars
     Optimised: cache card positions relative to the grid container.
     On mousemove: 1 getBoundingClientRect (grid only) + arithmetic per card.
     Previously: N getBoundingClientRect calls (one per card) per mousemove.
  ───────────────────────────────────────────────────── */

  var spotGrid  = document.getElementById('spotGrid');
  var spotCards = Array.from(spotGrid.querySelectorAll('.spot-card'));

  // Store each card's offset from the top-left of the spotGrid
  // These are stable as long as the layout doesn't change (i.e. until resize)
  var relativeRects = [];

  function cacheRelativeRects() {
    var gridRect = spotGrid.getBoundingClientRect();
    relativeRects = spotCards.map(function (card) {
      var r = card.getBoundingClientRect();
      return { left: r.left - gridRect.left, top: r.top - gridRect.top };
    });
  }

  // Lazy-init on first mousemove; invalidate on resize
  var relRectsDirty = true;
  window.addEventListener('resize', function () { relRectsDirty = true; }, { passive: true });

  spotGrid.addEventListener('mousemove', function (e) {
    if (relRectsDirty) {
      cacheRelativeRects();
      relRectsDirty = false;
    }
    // One BCR for the grid to get current viewport position (changes as page scrolls)
    var gr = spotGrid.getBoundingClientRect();
    var gx = e.clientX - gr.left;
    var gy = e.clientY - gr.top;
    for (var ci = 0; ci < spotCards.length; ci++) {
      var rc = relativeRects[ci];
      spotCards[ci].style.setProperty('--mx', (gx - rc.left) + 'px');
      spotCards[ci].style.setProperty('--my', (gy - rc.top)  + 'px');
    }
  });


  /* ─────────────────────────────────────────────────────
     6. ODOMETER COUNTER — digit strips
  ───────────────────────────────────────────────────── */

  document.querySelectorAll('.odometer').forEach(function (odo) {
    var raw    = odo.dataset.value;
    var suffix = odo.dataset.suffix || '';
    var digits = raw.split('');
    odo.innerHTML = '';

    digits.forEach(function (d) {
      var digitEl = document.createElement('div');
      digitEl.className = 'odo-digit';

      var strip = document.createElement('div');
      strip.className = 'odo-strip';

      for (var n = 0; n <= 9; n++) {
        var s = document.createElement('span');
        s.textContent = n;
        strip.appendChild(s);
      }

      digitEl.appendChild(strip);
      odo.appendChild(digitEl);
    });

    if (suffix) {
      var sfxEl = document.createElement('span');
      sfxEl.className = 'stat-sfx';
      sfxEl.textContent = suffix;
      odo.appendChild(sfxEl);
    }

    ScrollTrigger.create({
      trigger: odo,
      start: 'top 88%',
      once: true,
      onEnter: function () {
        odo.querySelectorAll('.odo-strip').forEach(function (strip, i) {
          var target = parseInt(digits[i]);
          var h      = strip.children[0].offsetHeight;
          strip.style.transform     = 'translateY(-' + (target * h) + 'px)';
          strip.style.transitionDelay = (i * 0.1) + 's';
        });
      }
    });
  });


  /* ─────────────────────────────────────────────────────
     7. COLOR SHIFT — body background per section
  ───────────────────────────────────────────────────── */

  document.querySelectorAll('.colorshift-section').forEach(function (sec) {
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 65%',
      end:   'bottom 35%',
      onEnter:     function () { document.body.style.background = sec.dataset.bg; },
      onEnterBack: function () { document.body.style.background = sec.dataset.bg; },
      onLeave:     function () { document.body.style.background = '#111111'; },
      onLeaveBack: function () { document.body.style.background = '#111111'; }
    });
  });


  /* ─────────────────────────────────────────────────────
     8. FADE-UP ANIMATIONS — all .fade-up elements
  ───────────────────────────────────────────────────── */

  gsap.utils.toArray('.fade-up').forEach(function (el) {
    gsap.to(el, {
      opacity: 1,
      y: 0,
      duration: 0.85,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: el,
        start: 'top 90%',
        toggleActions: 'play none none none'
      }
    });
  });


  /* ─────────────────────────────────────────────────────
     9. MAGNETIC BUTTON — subtle cursor-pull on .btn-primary
  ───────────────────────────────────────────────────── */

  document.querySelectorAll('.btn-primary').forEach(function (btn) {
    btn.addEventListener('mousemove', function (e) {
      var r  = btn.getBoundingClientRect();
      var dx = (e.clientX - r.left  - r.width  / 2) * 0.22;
      var dy = (e.clientY - r.top   - r.height / 2) * 0.22;
      btn.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(1.04)';
    });

    btn.addEventListener('mouseleave', function () {
      btn.style.transform = '';
    });
  });

})();
