/**
 * La Calle 58 — Main Script
 *
 * Modules:
 *   1. Canvas Hero        — 121-frame scroll-scrub via GSAP
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
     1. CANVAS HERO — 121-frame scroll scrub
  ───────────────────────────────────────────────────── */

  var canvas = document.getElementById('heroCanvas');
  var ctx    = canvas.getContext('2d');
  var TOTAL  = 121;
  var frames = new Array(TOTAL);
  var loaded = 0;
  var currentFrame = 0;

  /** Size canvas to viewport and redraw the current frame */
  function resizeCanvas() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    canvas.width        = w;
    canvas.height       = h;
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    if (loaded > 0) drawFrame(currentFrame);
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  /** Cover-fit draw: scales the image so it always fills the canvas */
  function drawFrame(idx) {
    var img = frames[idx];
    if (!img || !img.complete || !img.naturalWidth) return;
    var r  = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
    var dw = img.naturalWidth  * r;
    var dh = img.naturalHeight * r;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  }

  /** Preload all frames; dismiss loader once every frame is ready */
  for (var i = 0; i < TOTAL; i++) {
    (function (n) {
      var img = new Image();

      img.onload = function () {
        loaded++;
        var pct = Math.round(loaded / TOTAL * 100);
        document.getElementById('loaderFill').style.width  = pct + '%';
        document.getElementById('loaderCount').textContent = pct + '%';

        // Draw the first frame as soon as it arrives
        if (loaded === 1) {
          currentFrame = 0;
          drawFrame(0);
        }

        // All frames ready: ensure canvas is painted before fading the loader
        if (loaded === TOTAL) {
          resizeCanvas();
          drawFrame(0);
          requestAnimationFrame(function () {
            drawFrame(0); // second draw after first paint cycle (CDN race-condition fix)
            requestAnimationFrame(function () {
              var loader = document.getElementById('loader');
              loader.style.opacity = '0';
              setTimeout(function () { loader.style.display = 'none'; }, 700);
            });
          });
        }
      };

      img.onerror = function () { loaded++; }; // skip missing frames gracefully
      img.src = 'assets/frames/frame-' + String(n + 1).padStart(4, '0') + '.jpg';
      frames[n] = img;
    })(i);
  }

  /** GSAP scroll-driven scrub with per-frame snap */
  gsap.to({ f: 0 }, {
    f: TOTAL - 1,
    snap: 'f',
    ease: 'none',
    scrollTrigger: {
      trigger: '.hero',
      start:   'top top',
      end:     'bottom top',
      scrub:   0.3
    },
    onUpdate: function () {
      var idx = Math.round(this.targets()[0].f);
      if (idx !== currentFrame) {
        currentFrame = idx;
        drawFrame(idx);
      }
    }
  });


  /* ─────────────────────────────────────────────────────
     2. HERO TEXT FADE — plain scroll listener
     (Replaces GSAP scrub to avoid opacity:0 on page-refresh-at-bottom bug)
  ───────────────────────────────────────────────────── */

  var heroEl        = document.querySelector('.hero');
  var heroContentEl = document.querySelector('.hero-content');
  var scrollHintEl  = document.querySelector('.scroll-hint');

  function updateHeroFade() {
    var heroH = heroEl.offsetHeight; // 200vh
    var s     = window.scrollY;

    // .hero-content fades from opacity 1→0 between 10% and 35% of hero height
    var fadeStart = heroH * 0.10;
    var fadeEnd   = heroH * 0.35;
    var progress  = Math.min(1, Math.max(0, (s - fadeStart) / (fadeEnd - fadeStart)));
    heroContentEl.style.opacity   = (1 - progress).toFixed(4);
    heroContentEl.style.transform = 'translateY(' + (-55 * progress).toFixed(2) + 'px)';

    // .scroll-hint fades from opacity 1→0 between 4% and 14%
    var hStart = heroH * 0.04;
    var hEnd   = heroH * 0.14;
    var hProg  = Math.min(1, Math.max(0, (s - hStart) / (hEnd - hStart)));
    scrollHintEl.style.opacity = (1 - hProg).toFixed(4);
  }

  // Run once on load so refresh-at-bottom → scroll-to-top always shows hero text
  updateHeroFade();
  window.addEventListener('scroll', updateHeroFade, { passive: true });


  /* ─────────────────────────────────────────────────────
     3. NAVIGATION — scroll state + hamburger menu
  ───────────────────────────────────────────────────── */

  var mainNav  = document.getElementById('mainNav');
  var burger   = document.getElementById('navBurger');
  var mobileNav = document.getElementById('navMobile');

  // Solid navbar after 60px of scroll
  ScrollTrigger.create({
    start:       '60px top',
    onEnter:     function () { mainNav.classList.add('scrolled'); },
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

  var row     = document.getElementById('marqueeRow');
  var content = document.getElementById('marqueeContent');
  var clone   = content.cloneNode(true);
  row.appendChild(clone); // seamless loop via duplicate

  var scrollVel = 0;
  ScrollTrigger.create({
    onUpdate: function (s) { scrollVel = Math.abs(s.getVelocity()); }
  });

  var baseSpd = 55;
  var marqX   = 0;
  var marqW   = 0;

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
      card.style.setProperty('--my', (e.clientY - rect.top)  + 'px');
    });
  });


  /* ─────────────────────────────────────────────────────
     6. ODOMETER COUNTER — digit strips
  ───────────────────────────────────────────────────── */

  document.querySelectorAll('.odometer').forEach(function (odo) {
    var raw    = odo.dataset.value;
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
      start:   'top 88%',
      once:    true,
      onEnter: function () {
        odo.querySelectorAll('.odo-strip').forEach(function (strip, i) {
          var target = parseInt(digits[i]);
          var h = strip.children[0].offsetHeight;
          strip.style.transform       = 'translateY(-' + (target * h) + 'px)';
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
      trigger:    sec,
      start:      'top 65%',
      end:        'bottom 35%',
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
      opacity:  1,
      y:        0,
      duration: 0.85,
      ease:     'power3.out',
      scrollTrigger: {
        trigger:      el,
        start:        'top 90%',
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
