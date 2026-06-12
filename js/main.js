/**
 * La Calle 58 — Main Script
 *
 * Modules:
 *   1. Canvas Hero        — scroll-scrub via GSAP (mobile: 61 frames @ 640×360, desktop: 121 @ 1280×720)
 *   2. Hero Text Fade     — plain scroll listener (immune to GSAP refresh bugs)
 *   3. Navigation         — scroll state + hamburger menu
 *   4. Kinetic Marquee    — requestAnimationFrame loop, scroll-velocity reactive
 *   5. Spotlight Cards    — CSS custom-property cursor tracking
 *   6. Odometer Counter   — digit-strip animation on scroll enter
 *   7. Color Shift        — body background transition per section
 *   8. Fade-up Animations — GSAP ScrollTrigger on .fade-up elements
 *   9. Magnetic Button    — subtle cursor-pull on .btn-primary hover
 */

(function () {
  'use strict';

  gsap.registerPlugin(ScrollTrigger);

  /* ─────────────────────────────────────────────────────
     1. CANVAS HERO — scroll-driven frame sequence
     Mobile:  61 frames, 640×360, assets/frames-mobile/
     Desktop: 121 frames, 1280×720, assets/frames/
  ───────────────────────────────────────────────────── */

  var isMobile = window.innerWidth < 768;
  var TOTAL = isMobile ? 61 : 121;
  var FOLDER = isMobile ? 'assets/frames-mobile' : 'assets/frames';

  var canvas = document.getElementById('heroCanvas');
  var ctx = canvas.getContext('2d');

  // GPU layer promotion — faster compositing on mobile
  canvas.style.transform = 'translateZ(0)';

  // Mobile frames are 640×360 — not enough resolution to benefit from 2x DPR on portrait.
  // DPR 1 makes the canvas 4x cheaper to draw (half width × half height).
  var DPR = 1;

  var frames = new Array(TOTAL);
  var imagesLoaded = 0; // counts raw Image onload
  var bitmapsReady = 0; // counts createImageBitmap conversions
  var currentFrame = 0;

  /** Size canvas to viewport, accounting for device pixel ratio on mobile.
   *  Uses visualViewport.height on mobile to avoid iOS browser-chrome resize events. */
  function resizeCanvas() {
    var w = window.innerWidth;
    var h = (isMobile && window.visualViewport) ? window.visualViewport.height : window.innerHeight;
    canvas.width = w * DPR;
    canvas.height = h * DPR;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    // NO ctx.scale() — canvas.width/height are already in physical pixels.
    if (bitmapsReady > 0) drawFrame(currentFrame);
  }

  // Single resize listener — recalculates canvas + mobile scroll cache + breakpoint check.
  window.addEventListener('resize', function () {
    resizeCanvas();
    if (isMobile) {
      heroH = heroScrollEl.offsetHeight;
      viewH = (window.visualViewport ? window.visualViewport.height : window.innerHeight);
      heroScrollRange = heroH - viewH;
    }
    var nowMobile = window.innerWidth < 768;
    if (nowMobile !== isMobile) window.location.reload();
  });
  resizeCanvas();

  /** Cover-fit draw — works with both HTMLImageElement and ImageBitmap */
  function drawFrame(idx) {
    var src = frames[idx];
    if (!src) return;

    var srcW = src.naturalWidth || src.width;
    var srcH = src.naturalHeight || src.height;
    if (!srcW || !srcH) return;

    var r = Math.max(canvas.width / srcW, canvas.height / srcH);
    var dw = srcW * r;
    var dh = srcH * r;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(src, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  }

  function dismissLoader() {
    var loader = document.getElementById('loader');
    loader.style.opacity = '0';
    setTimeout(function () { loader.style.display = 'none'; }, 700);
  }

  /** Shared completion check — called by onFrameReady and onerror alike. */
  function checkAllReady() {
    if (bitmapsReady < TOTAL) return;

    // No frame drew successfully — fall back to static hero image
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
    drawFrame(0);
    requestAnimationFrame(function () {
      drawFrame(0); // second draw after first paint cycle (CDN race-condition fix)
      requestAnimationFrame(dismissLoader);
    });
  }

  /**
   * Called once per frame after it's fully ready (bitmap converted or fallback set).
   * Loader dismissal only fires when ALL bitmaps are ready — prevents blank canvas flash.
   */
  function onFrameReady(n) {
    bitmapsReady++;

    // Update loader progress based on bitmap-ready count (more accurate than image load)
    var pct = Math.round(bitmapsReady / TOTAL * 100);
    document.getElementById('loaderFill').style.width = pct + '%';
    document.getElementById('loaderCount').textContent = pct + '%';

    // Draw frame 0 as soon as it's ready
    if (n === 0) {
      currentFrame = 0;
      drawFrame(0);
    }

    checkAllReady();
  }

  /** Preload all frames, converting to ImageBitmap for zero-cost GPU draws */
  for (var i = 0; i < TOTAL; i++) {
    (function (n) {
      var img = new Image();

      img.onload = function () {
        imagesLoaded++;
        if (window.createImageBitmap) {
          // Pre-decode JPEG → GPU-ready bitmap; drawImage becomes a fast blit
          createImageBitmap(img).then(function (bitmap) {
            frames[n] = bitmap;
            onFrameReady(n);
          }).catch(function () {
            // createImageBitmap failed for this frame — fall back to raw Image
            frames[n] = img;
            onFrameReady(n);
          });
        } else {
          // Browser doesn't support createImageBitmap — use Image directly
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

  // Safety valve — if frames stall (slow CDN, missing folder), force loader dismissal after 10 s
  setTimeout(function () {
    if (bitmapsReady < TOTAL) {
      bitmapsReady = TOTAL;
      checkAllReady();
    }
  }, 10000);

  /**
   * Throttle draws to rAF — canvas updates at most once per 16ms regardless
   * of how many scroll events fire in that window (critical for iOS momentum scroll).
   */
  var rafPending = false;
  var pendingIdx = 0;

  function scheduleDrawFrame(idx) {
    pendingIdx = idx;
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(function () {
        rafPending = false;
        drawFrame(pendingIdx);
      });
    }
  }

  if (isMobile) {
    /**
     * Mobile: a rAF loop reads window.scrollY directly each frame instead of
     * relying on scroll events. iOS batches scroll events asynchronously, causing
     * targetFrame to jump in bursts — reading in rAF syncs the update to the
     * display refresh cycle. IntersectionObserver pauses the loop when the hero
     * is fully offscreen so it doesn't run on every tick for the rest of the page.
     */
    var heroScrollEl = document.querySelector('.hero');
    var heroH = heroScrollEl.offsetHeight;
    var viewH = (window.visualViewport ? window.visualViewport.height : window.innerHeight);
    var heroScrollRange = heroH - viewH;

    var targetFrame = 0;
    var floatFrame = 0;
    var heroRafId = null;

    function heroRafLoop() {
      var s = window.scrollY;
      targetFrame = Math.min(1, Math.max(0, s / heroScrollRange)) * (TOTAL - 1);
      var diff = targetFrame - floatFrame;
      if (Math.abs(diff) < 0.05) {
        floatFrame = targetFrame;
      } else {
        floatFrame += diff * 0.3;
      }
      var idx = Math.round(floatFrame);
      if (idx !== currentFrame && frames[idx]) {
        currentFrame = idx;
        drawFrame(idx);
      }
      heroRafId = requestAnimationFrame(heroRafLoop);
    }

    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        if (!heroRafId) heroRafId = requestAnimationFrame(heroRafLoop);
      } else {
        cancelAnimationFrame(heroRafId);
        heroRafId = null;
      }
    }, { threshold: 0 }).observe(heroScrollEl);

    heroRafId = requestAnimationFrame(heroRafLoop);

  } else {
    /**
     * Desktop: GSAP scrub with cinematic 0.3s smoothing.
     */
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
          scheduleDrawFrame(idx);
        }
      }
    });
  }


  /* ─────────────────────────────────────────────────────
     2. HERO TEXT FADE — plain scroll listener
     (Replaces GSAP scrub to avoid opacity:0 on page-refresh-at-bottom bug)
  ───────────────────────────────────────────────────── */

  var heroEl = document.querySelector('.hero');
  var heroContentEl = document.querySelector('.hero-content');
  var scrollHintEl = document.querySelector('.scroll-hint');

  // Cached — reading offsetHeight inside a scroll handler forces a reflow per event
  var heroFadeH = heroEl.offsetHeight;
  window.addEventListener('resize', function () { heroFadeH = heroEl.offsetHeight; });

  var lastFadeProg = -1;
  var lastHintProg = -1;

  function updateHeroFade() {
    var s = window.scrollY;
    if (s > heroFadeH * 0.4 && lastFadeProg === 1 && lastHintProg === 1) return; // past fade range, already faded out

    // .hero-content fades from opacity 1→0 between 10% and 35% of hero height
    var fadeStart = heroFadeH * 0.10;
    var fadeEnd = heroFadeH * 0.35;
    var progress = Math.min(1, Math.max(0, (s - fadeStart) / (fadeEnd - fadeStart)));
    if (progress !== lastFadeProg) {
      lastFadeProg = progress;
      heroContentEl.style.opacity = (1 - progress).toFixed(4);
      heroContentEl.style.transform = 'translateY(' + (-55 * progress).toFixed(2) + 'px)';
    }

    // .scroll-hint fades from opacity 1→0 between 4% and 14%
    var hStart = heroFadeH * 0.04;
    var hEnd = heroFadeH * 0.14;
    var hProg = Math.min(1, Math.max(0, (s - hStart) / (hEnd - hStart)));
    if (hProg !== lastHintProg) {
      lastHintProg = hProg;
      scrollHintEl.style.opacity = (1 - hProg).toFixed(4);
    }
  }

  // Run once on load so refresh-at-bottom → scroll-to-top always shows hero text
  updateHeroFade();
  window.addEventListener('scroll', updateHeroFade, { passive: true });


  /* ─────────────────────────────────────────────────────
     3. NAVIGATION — scroll state + hamburger menu
  ───────────────────────────────────────────────────── */

  var mainNav = document.getElementById('mainNav');
  var burger = document.getElementById('navBurger');
  var mobileNav = document.getElementById('navMobile');

  // Solid navbar after 60px of scroll
  ScrollTrigger.create({
    start: '60px top',
    onEnter: function () { mainNav.classList.add('scrolled'); },
    onLeaveBack: function () { mainNav.classList.remove('scrolled'); }
  });

  function openMobileNav() {
    burger.classList.add('open');
    mobileNav.classList.add('open');
    mobileNav.setAttribute('aria-hidden', 'false');
    burger.setAttribute('aria-expanded', 'true');
    mainNav.style.zIndex = '106'; // sit above overlay (z-index 105) so X stays visible
    document.body.style.overflow = 'hidden';
  }

  // Exposed globally so inline onclick="closeMobileNav()" in the HTML works
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
  ───────────────────────────────────────────────────── */

  var row = document.getElementById('marqueeRow');
  var content = document.getElementById('marqueeContent');
  var clone = content.cloneNode(true);
  row.appendChild(clone); // seamless loop via duplicate

  var scrollVel = 0;
  ScrollTrigger.create({
    onUpdate: function (s) { scrollVel = Math.abs(s.getVelocity()); }
  });

  var baseSpd = 55;
  var marqX = 0;
  var marqW = 0;

  // Measure after fonts have loaded to get accurate width
  setTimeout(function () {
    marqW = content.offsetWidth;
    (function tick() {
      var spd = (baseSpd + scrollVel * 0.1) / 60;
      marqX -= spd;
      if (marqX <= -marqW) marqX += marqW;
      row.style.transform = 'translateX(' + marqX + 'px)';
      requestAnimationFrame(tick);
    })();
  }, 150);


  /* ─────────────────────────────────────────────────────
     5. SPOTLIGHT CARDS — cursor-tracking CSS vars
  ───────────────────────────────────────────────────── */

  var spotGrid = document.getElementById('spotGrid');
  spotGrid.addEventListener('mousemove', function (e) {
    spotGrid.querySelectorAll('.spot-card').forEach(function (card) {
      var rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - rect.left) + 'px');
      card.style.setProperty('--my', (e.clientY - rect.top) + 'px');
    });
  });


  /* ─────────────────────────────────────────────────────
     6. ODOMETER COUNTER — digit strips
  ───────────────────────────────────────────────────── */

  document.querySelectorAll('.odometer').forEach(function (odo) {
    var raw = odo.dataset.value;
    var suffix = odo.dataset.suffix || '';
    var digits = raw.split('');
    odo.innerHTML = '';

    // Build one scrollable strip per digit
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

    // Append suffix (e.g. %) inside the odometer element
    if (suffix) {
      var sfxEl = document.createElement('span');
      sfxEl.className = 'stat-sfx';
      sfxEl.textContent = suffix;
      odo.appendChild(sfxEl);
    }

    // Trigger strip roll once the odometer enters the viewport
    ScrollTrigger.create({
      trigger: odo,
      start: 'top 88%',
      once: true,
      onEnter: function () {
        odo.querySelectorAll('.odo-strip').forEach(function (strip, i) {
          var target = parseInt(digits[i]);
          var h = strip.children[0].offsetHeight;
          strip.style.transform = 'translateY(-' + (target * h) + 'px)';
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
      end: 'bottom 35%',
      onEnter: function () { document.body.style.background = sec.dataset.bg; },
      onEnterBack: function () { document.body.style.background = sec.dataset.bg; },
      onLeave: function () { document.body.style.background = '#111111'; },
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
      var r = btn.getBoundingClientRect();
      var dx = (e.clientX - r.left - r.width / 2) * 0.22;
      var dy = (e.clientY - r.top - r.height / 2) * 0.22;
      btn.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(1.04)';
    });

    btn.addEventListener('mouseleave', function () {
      btn.style.transform = '';
    });
  });

})();
