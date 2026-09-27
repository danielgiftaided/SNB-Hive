<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>SNB Hive — Women's Fitness & Wellness</title>
<meta property="og:title" content="SNB Hive — Women's Fitness &amp; Wellness" />
<meta property="og:description" content="A women-only wellness community in Hackney. Fitness classes, retreats, and studio hire." />
<meta property="og:image" content="https://snbhive.com/hero-photo-candidate.jpg" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://snbhive.com/" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="description" content="A women-only wellness community in Hackney. Fitness classes, retreats, and studio hire." />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=Inter:wght@400;500&display=swap" rel="stylesheet">

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Inter', sans-serif;
  color: #2B2E2C;
  background-color: #EDE7DD;
  background-image:
    radial-gradient(ellipse 120% 80% at 30% 0%, rgba(255,252,244,0.4), transparent 60%),
    radial-gradient(ellipse 120% 90% at 80% 100%, rgba(60,64,58,0.05), transparent 60%),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.045'/%3E%3C/svg%3E");
  background-attachment: fixed;
}

.serif {
  font-family: 'Cormorant Garamond', serif;
}

/* Box Fit taster-session banner */
.taster-banner {
  position: relative;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 13px 24px;
  background: #4B5D4E;
  color: #FBF6EA;
  text-align: center;
}

.taster-banner p {
  font-size: 13px;
  line-height: 1.5;
  letter-spacing: 0.02em;
}

.taster-banner strong {
  font-weight: 600;
}

.taster-banner a {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 18px;
  border: 1px solid rgba(251,246,234,0.7);
  border-radius: 100px;
  color: #FBF6EA;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-decoration: none;
  transition: background 0.2s ease, color 0.2s ease;
}

.taster-banner a:hover,
.taster-banner a:focus-visible {
  background: #FBF6EA;
  color: #344339;
}

/* Hero */
.hero {
  position: relative;
  min-height: 88vh;
  overflow: hidden;
  background-color: #CDC6B2;
  background-image:
    radial-gradient(ellipse 70% 60% at 22% 15%, rgba(139,132,116,0.55), transparent 60%),
    radial-gradient(ellipse 60% 70% at 78% 30%, rgba(242,237,221,0.6), transparent 65%),
    radial-gradient(ellipse 90% 70% at 50% 100%, rgba(120,114,98,0.4), transparent 70%),
    radial-gradient(ellipse 100% 60% at 50% 0%, rgba(168,160,141,0.3), transparent 60%),
    linear-gradient(180deg, #D3CCB9 0%, #C7BFAA 45%, #DAD3C1 100%);
}

.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.34;
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

.hero::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse 90% 90% at 50% 45%,
    transparent 45%,
    rgba(60,56,44,0.16) 100%
  );
}

/* Navigation */
.hero-nav {
  position: relative;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 34px 56px;
}

.hero-nav .mark {
  display: flex;
  align-items: center;
  text-decoration: none;
}

.hero-nav .mark img {
  display: block;
  width: auto;
  height: 44px;
}

.hero-nav ul {
  display: flex;
  gap: 38px;
  list-style: none;
}

.hero-nav a {
  color: #2B2E2C;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-decoration: none;
  text-transform: uppercase;
  opacity: 0.75;
}

.nav-dropdown {
  position: relative;
}

.nav-dropdown > a {
  cursor: pointer;
}

.nav-dropdown .caret {
  margin-left: 5px;
  font-size: 9px;
  opacity: 0.7;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 50%;
  z-index: 20;
  min-width: 200px;
  margin-top: 14px;
  padding: 8px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 14px 34px rgba(60,50,30,0.16);
  opacity: 0;
  visibility: hidden;
  transform: translateX(-50%) translateY(-6px);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease,
    visibility 0.2s;
}

.nav-dropdown:hover .dropdown-menu {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(0);
}

.dropdown-menu a {
  display: block;
  padding: 9px 14px;
  border-radius: 6px;
  color: #2B2E2C;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 1;
}

.dropdown-menu a:hover {
  background: #F3EFE4;
  color: #4B5D4E;
}

.nav-cta {
  padding: 9px 22px;
  background: #211A16 !important;
  border-radius: 100px;
  color: #FBF6EA !important;
  letter-spacing: 0.03em !important;
  opacity: 1 !important;
}

/* Hero content */
.hero-copy {
  position: relative;
  z-index: 4;
  max-width: 640px;
  padding: 70px 56px 0;
}

.hero-copy h1 {
  color: #211F1A;
  font-family: 'Cormorant Garamond', serif;
  font-size: 76px;
  font-weight: 400;
  line-height: 1.05;
}

.hero-copy h1 i {
  color: #4B5D4E;
  font-style: italic;
}

.photo-slot {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  width: 52%;
  background-image: url('hero-photo-candidate.jpg');
  background-position: 75% 35%;
  background-size: cover;
  -webkit-mask-image: linear-gradient(
    90deg,
    transparent 0%,
    rgba(0,0,0,0.5) 22%,
    rgba(0,0,0,0.95) 45%,
    black 60%
  );
  mask-image: linear-gradient(
    90deg,
    transparent 0%,
    rgba(0,0,0,0.5) 22%,
    rgba(0,0,0,0.95) 45%,
    black 60%
  );
}

.photo-slot::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(0deg, rgba(40,36,26,0.28) 0%, transparent 30%),
    radial-gradient(
      ellipse 90% 70% at 60% 40%,
      transparent 45%,
      rgba(40,36,26,0.18) 100%
    );
}

/* Main cards */
.menu-wrap {
  position: relative;
  max-width: 1180px;
  height: 860px;
  margin: 90px auto 10px;
}

.menu-center {
  position: absolute;
  top: 360px;
  left: 50%;
  z-index: 3;
  width: 280px;
  text-align: center;
  transform: translateX(-50%);
}

.menu-center h2 {
  color: #2B2E2C;
  font-family: 'Cormorant Garamond', serif;
  font-size: 38px;
  font-weight: 400;
  line-height: 1.2;
}

.menu-center h2 i {
  color: #4B5D4E;
  font-style: italic;
}

.mcard {
  position: absolute;
  z-index: 2;
  display: flex;
  align-items: stretch;
  width: 300px;
  background: #EFE9D9;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(60,50,30,0.10);
  color: inherit;
  text-decoration: none;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}

.mcard:hover {
  box-shadow: 0 14px 30px rgba(60,50,30,0.16);
  transform: translateY(-4px);
}

.mcard .mphoto {
  position: relative;
  flex-shrink: 0;
  width: 120px;
  overflow: hidden;
  border-radius: 6px 0 0 6px;
}

.mcard .mphoto::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.014' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  mix-blend-mode: overlay;
  opacity: 0.14;
}

.mcard .mbody {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 16px 18px;
  overflow: hidden;
  border-radius: 0 6px 6px 0;
}

.mcard .title {
  font-family: 'Cormorant Garamond', serif;
  font-size: 17px;
  line-height: 1.3;
}

.mcard .title .plus {
  margin-right: 4px;
  color: #4B5D4E;
}

.mcard .who {
  margin-top: 8px;
  color: #8A8677;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.mcard.card-1 {
  top: 48px;
  left: 440px;
}

.mcard.card-2 {
  top: 160px;
  left: 768px;
}

.mcard.card-3 {
  top: 160px;
  left: 112px;
}

.mcard.card-4 {
  top: 414px;
  left: 849px;
}

.mcard.card-5 {
  top: 414px;
  left: 31px;
}

.mcard.card-6 {
  top: 618px;
  left: 622px;
}

.mcard.card-7 {
  top: 618px;
  left: 258px;
}

.t1 {
  background-image: url('menu-zumba.jpg');
  background-position: center 45%;
  background-size: cover;
}

.t2 {
  background-image: url('menu-boxing.jpg');
  background-position: center 30%;
  background-size: cover;
}

.t3 {
  background-image: url('menu-classes.jpg');
  background-position: center 55%;
  background-size: cover;
}

.t4 {
  background-image: url('menu-strength.jpg');
  background-position: center 35%;
  background-size: cover;
}

.t5 {
  background-image: url('menu-pilates.jpg');
  background-position: center 45%;
  background-size: cover;
}

.t6 {
  background-image: url('menu-retreat.jpg');
  background-position: center;
  background-size: cover;
}

.t7 {
  background-image: url('menu-studio.jpg');
  background-position: center;
  background-size: cover;
}

.menu-footnote {
  margin-top: 0;
  padding-bottom: 40px;
  color: #5C5844;
  font-size: 13px;
  text-align: center;
}

.divider {
  height: 1px;
  margin: 0 72px;
  background: rgba(43,46,44,0.16);
}

.quote-band {
  padding: 80px 72px;
  text-align: center;
}

.quote-band p {
  max-width: 620px;
  margin: 0 auto;
  color: #3A3D3B;
  font-family: 'Cormorant Garamond', serif;
  font-size: 28px;
  font-style: italic;
  font-weight: 400;
  line-height: 1.5;
}

.quote-band .who {
  margin-top: 22px;
  color: #6E7A6F;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

/* Footer */
.site-footer {
  border-top: 1px solid rgba(43,46,44,0.14);
}

.footer-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 40px;
  padding: 56px 72px 36px;
}

.footer-brand img {
  display: block;
  width: auto;
  height: 36px;
  margin-bottom: 14px;
}

.footer-brand p {
  color: #6E7A6F;
  font-size: 12.5px;
  line-height: 1.7;
}

.footer-social a {
  color: #4B5D4E;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-decoration: underline;
  text-transform: uppercase;
  text-underline-offset: 3px;
}

.footer-bottom {
  padding: 20px 72px 32px;
  border-top: 1px solid rgba(43,46,44,0.08);
}

.footer-bottom .footer-social {
  margin-bottom: 14px;
  text-align: left;
}

.footer-legal {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.footer-legal p {
  color: #8A8677;
  font-size: 11.5px;
  letter-spacing: 0.02em;
}

/* Mobile navigation */
.mobile-toggle {
  position: relative;
  z-index: 30;
  display: none;
  padding: 6px;
  background: none;
  border: none;
  cursor: pointer;
}

.mobile-toggle span {
  display: block;
  width: 22px;
  height: 2px;
  margin: 5px 0;
  background: #2B2E2C;
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.mobile-toggle.open span:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}

.mobile-toggle.open span:nth-child(2) {
  opacity: 0;
}

.mobile-toggle.open span:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}

.nav-overlay {
  position: fixed;
  inset: 0;
  z-index: 15;
  background: rgba(20,18,14,0.4);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.25s ease, visibility 0.25s ease;
}

.nav-overlay.show {
  opacity: 1;
  visibility: visible;
}

/* Box Fit popup */
.taster-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(20,18,14,0.62);
}

.taster-overlay.show {
  display: flex;
}

.taster-modal {
  position: relative;
  width: 100%;
  max-width: 440px;
  padding: 36px 32px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 24px 60px rgba(0,0,0,0.25);
  text-align: center;
}

.taster-modal .close-btn {
  position: absolute;
  top: 12px;
  right: 14px;
  width: 36px;
  height: 36px;
  background: none;
  border: none;
  border-radius: 50%;
  color: #716D61;
  font-size: 24px;
  cursor: pointer;
}

.taster-modal .close-btn:hover,
.taster-modal .close-btn:focus-visible {
  background: #F3EFE4;
}

.taster-modal .taster-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  margin: 0 auto 18px;
  background: #E7EEE8;
  border-radius: 50%;
  color: #4B5D4E;
  font-size: 22px;
}

.taster-modal .taster-tag {
  margin-bottom: 6px;
  color: #6E7A6F;
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.taster-modal h3 {
  color: #2B2E2C;
  font-family: 'Cormorant Garamond', serif;
  font-size: 30px;
  font-weight: 500;
}

.taster-modal .dates {
  margin-top: 8px;
  color: #4B5D4E;
  font-size: 14px;
  font-weight: 600;
}

.taster-modal p.body-copy {
  margin: 17px 0 24px;
  color: #5A5744;
  font-size: 14px;
  line-height: 1.65;
}

.taster-modal .btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 13px;
  background: #211A16;
  border-radius: 100px;
  color: #FBF6EA;
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
}

.taster-modal .btn-later {
  display: block;
  margin: 14px auto 0;
  background: none;
  border: none;
  color: #716D61;
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
}

@media (max-width: 1220px) {
  .menu-wrap {
    height: auto;
    margin-top: 60px;
    padding: 0 24px;
  }

  .menu-center {
    position: static;
    width: auto;
    margin: 0 auto 32px;
    transform: none;
  }

  .mcard {
    position: static;
    width: 100%;
    max-width: 420px;
    margin: 0 auto 16px;
  }
}

@media (max-width: 900px) {
  .hero-copy h1 {
    font-size: 48px;
  }

  .photo-slot {
    position: static;
    width: auto;
    height: 280px;
    margin: 32px 56px 0;
  }
}

@media (max-width: 880px) {
  .mobile-toggle {
    display: block;
  }

  .hero-nav ul {
    position: fixed;
    top: 0;
    right: 0;
    z-index: 20;
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    flex-direction: column;
    gap: 6px;
    width: 80%;
    max-width: 320px;
    height: 100vh;
    padding: 100px 32px 40px;
    overflow-y: auto;
    background: #FBF6EA;
    box-shadow: -10px 0 34px rgba(0,0,0,0.16);
    transform: translateX(100%);
    transition: transform 0.3s ease;
  }

  .hero-nav ul.open {
    transform: translateX(0);
  }

  .hero-nav ul li {
    width: 100%;
  }

  .hero-nav ul a {
    display: block;
    padding: 12px 0;
    font-size: 13px;
    opacity: 0.85;
  }

  .hero-nav .nav-cta {
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    width: auto;
    margin-top: 14px;
    padding: 13px 28px !important;
    font-size: 13px !important;
  }

  .nav-dropdown .dropdown-menu {
    position: static !important;
    top: auto !important;
    left: auto !important;
    width: 100% !important;
    min-width: 0 !important;
    max-height: 0;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden;
    background: transparent !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    opacity: 1 !important;
    visibility: visible !important;
    transform: none !important;
    transition: max-height 0.25s ease;
  }

  .nav-dropdown.mobile-open .dropdown-menu {
    max-height: 300px !important;
    margin-top: 2px !important;
    padding: 4px 0 6px 14px !important;
  }

  .nav-dropdown .caret {
    transition: transform 0.2s ease;
  }

  .nav-dropdown.mobile-open .caret {
    transform: rotate(180deg);
  }
}

@media (max-width: 700px) {
  .footer-main,
  .footer-bottom {
    padding-right: 24px;
    padding-left: 24px;
  }
}

@media (max-width: 600px) {
  .taster-banner {
    flex-direction: column;
    gap: 9px;
    padding: 12px 18px;
  }

  .taster-banner a {
    padding: 7px 16px;
  }

  .taster-modal {
    padding: 34px 24px 28px;
  }
}
</style>
</head>

<body>

<!-- Box Fit taster-session banner -->
<aside class="taster-banner" aria-label="Box Fit taster session">
  <p>
    <strong>Box Fit Taster Session:</strong>
    Join us on 01 Oct 2026.
  </p>

  <a href="https://app.snbhive.com">
    Book Box Fit
    <span aria-hidden="true">&rarr;</span>
  </a>
</aside>

<!-- Hero -->
<section class="hero">
  <nav class="hero-nav">
    <a class="mark" href="index.html">
      <img src="logo-nav.png" alt="SNB Hive" />
    </a>

    <ul>
      <li class="nav-dropdown">
        <a>
          Classes
          <span class="caret" aria-hidden="true">&#9662;</span>
        </a>

        <div class="dropdown-menu">
          <a href="page-class-boxing.html">Boxing</a>
          <a href="page-class-pilates.html">Reformer Pilates</a>
          <a href="page-class-somatic.html">Somatic</a>
          <a href="page-class-strength.html">Strength &amp; Conditioning</a>
          <a href="page-class-zumba.html">Zumba</a>
        </div>
      </li>

      <li><a href="page-retreats.html">Retreats</a></li>
      <li><a href="page-studio-hire.html">Studio hire</a></li>
      <li><a href="page-about.html">About us</a></li>
      <li><a href="page-contact.html">Contact us</a></li>
      <li><a href="https://app.snbhive.com" class="nav-cta">Book Now</a></li>
    </ul>

    <div class="nav-overlay" id="navOverlay"></div>

    <button
      class="mobile-toggle"
      id="mobileToggle"
      type="button"
      aria-label="Menu"
    >
      <span></span>
      <span></span>
      <span></span>
    </button>
  </nav>

  <div class="hero-copy">
    <h1>
      Move the body.<br />
      <i>Return to yourself.</i>
    </h1>
  </div>

  <div class="photo-slot"></div>
</section>

<!-- Class, retreat, and studio menu -->
<div class="menu-wrap">
  <div class="menu-center">
    <h2>
      Where would you<br />
      like to <i>begin?</i>
    </h2>
  </div>

  <a class="mcard card-1" href="page-class-zumba.html">
    <div class="mphoto t1"></div>

    <div class="mbody">
      <div class="title">
        <span class="plus">+</span>
        Community, joy, and a reason to move
      </div>

      <div class="who">Zumba</div>
    </div>
  </a>

  <a class="mcard card-2" href="page-class-boxing.html">
    <div class="mphoto t2"></div>

    <div class="mbody">
      <div class="title">
        <span class="plus">+</span>
        Strength, release, and a bit of fight
      </div>

      <div class="who">Boxing</div>
    </div>
  </a>

  <a class="mcard card-3" href="page-class-somatic.html">
    <div class="mphoto t3"></div>

    <div class="mbody">
      <div class="title">
        <span class="plus">+</span>
        Calm, breath, and coming back to yourself
      </div>

      <div class="who">Somatic</div>
    </div>
  </a>

  <a class="mcard card-4" href="page-class-strength.html">
    <div class="mphoto t4"></div>

    <div class="mbody">
      <div class="title">
        <span class="plus">+</span>
        Quiet power, built rep by rep
      </div>

      <div class="who">Strength &amp; Conditioning</div>
    </div>
  </a>

  <a class="mcard card-5" href="page-class-pilates.html">
    <div class="mphoto t5"></div>

    <div class="mbody">
      <div class="title">
        <span class="plus">+</span>
        Control, balance, and a stronger core
      </div>

      <div class="who">Reformer Pilates</div>
    </div>
  </a>

  <a class="mcard card-6" href="page-retreats.html">
    <div class="mphoto t6"></div>

    <div class="mbody">
      <div class="title">
        <span class="plus">+</span>
        Exclusive retreats to pause, breathe, and reconnect
      </div>

      <div class="who">SNB Hive Wellness Series</div>
    </div>
  </a>

  <a class="mcard card-7" href="page-studio-hire.html">
    <div class="mphoto t7"></div>

    <div class="mbody">
      <div class="title">
        <span class="plus">+</span>
        A boutique women-only space, ready for your event
      </div>

      <div class="who">Studio hire</div>
    </div>
  </a>
</div>

<div class="menu-footnote">
  Not sure where to start? Every class opens with a free taster.
</div>

<div class="divider"></div>

<section class="quote-band">
  <p>
    &ldquo;This isn't a class you attend. It's a room you return to.&rdquo;
  </p>

  <div class="who">A member, three months in</div>
</section>

<!-- Footer -->
<footer class="site-footer">
  <div class="footer-main">
    <div class="footer-brand">
      <img src="logo-nav.png" alt="SNB Hive" />

      <p>
        Women's Fitness and Wellness Classes &amp; Retreats<br />
        6 Dispensary Lane, London E8 1FT
      </p>
    </div>
  </div>

  <div class="footer-bottom">
    <div class="footer-social">
      <a
        href="https://www.instagram.com/snbhive?igsh=ODBrM2l6dDdyZnp0&utm_source=qr"
        target="_blank"
        rel="noopener"
      >
        Follow us on Instagram
      </a>
    </div>

    <div class="footer-legal">
      <p>&copy; 2026 SNB Hive Ltd. All rights reserved.</p>

      <p>
        SNB Hive Ltd. Registered in England &amp; Wales,
        Company No. 16533320
      </p>
    </div>
  </div>
</footer>

<!-- Box Fit taster-session popup -->
<div
  class="taster-overlay"
  id="tasterOverlay"
  aria-hidden="true"
>
  <div
    class="taster-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="tasterTitle"
    aria-describedby="tasterDescription"
  >
    <button
      class="close-btn"
      id="tasterClose"
      type="button"
      aria-label="Close Box Fit taster session popup"
    >
      &times;
    </button>

    <div class="taster-icon" aria-hidden="true">
      &#10024;
    </div>

    <div class="taster-tag">You're invited</div>

    <h3 id="tasterTitle">Box Fit Taster Session</h3>

    <div class="dates">01 Oct 2026</div>

    <p class="body-copy" id="tasterDescription">
      Discover Box Fit at SNB Hive. Join our women-only taster session
      for an energising workout combining boxing technique, fitness,
      and fun.
    </p>

    <a class="btn-primary" href="https://app.snbhive.com">
      Book your Box Fit taster
      <span aria-hidden="true">&rarr;</span>
    </a>

    <button class="btn-later" id="tasterLater" type="button">
      Maybe later
    </button>
  </div>
</div>

<script>
(function () {
  var overlay = document.getElementById('tasterOverlay');
  var closeButton = document.getElementById('tasterClose');
  var laterButton = document.getElementById('tasterLater');
  var storageKey = 'box_fit_taster_2026_10_01_seen';

  function closePopup() {
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
  }

  if (!sessionStorage.getItem(storageKey)) {
    setTimeout(function () {
      overlay.classList.add('show');
      overlay.setAttribute('aria-hidden', 'false');
      closeButton.focus();
    }, 600);

    sessionStorage.setItem(storageKey, '1');
  }

  closeButton.addEventListener('click', closePopup);
  laterButton.addEventListener('click', closePopup);

  overlay.addEventListener('click', function (event) {
    if (event.target === overlay) {
      closePopup();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (
      event.key === 'Escape' &&
      overlay.classList.contains('show')
    ) {
      closePopup();
    }
  });
})();
</script>

<script>
(function () {
  var toggle = document.getElementById('mobileToggle');
  var menu = document.querySelector('.hero-nav ul');
  var overlay = document.getElementById('navOverlay');

  if (!toggle || !menu) {
    return;
  }

  function closeMenu() {
    toggle.classList.remove('open');
    menu.classList.remove('open');

    if (overlay) {
      overlay.classList.remove('show');
    }
  }

  function openMenu() {
    toggle.classList.add('open');
    menu.classList.add('open');

    if (overlay) {
      overlay.classList.add('show');
    }
  }

  toggle.addEventListener('click', function () {
    if (menu.classList.contains('open')) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  if (overlay) {
    overlay.addEventListener('click', closeMenu);
  }

  var dropdownLink = document.querySelector('.nav-dropdown > a');
  var dropdownParent = document.querySelector('.nav-dropdown');

  if (dropdownLink && dropdownParent) {
    dropdownLink.addEventListener('click', function (event) {
      if (window.innerWidth <= 880) {
        event.preventDefault();
        dropdownParent.classList.toggle('mobile-open');
      }
    });
  }
})();
</script>

</body>
</html>
