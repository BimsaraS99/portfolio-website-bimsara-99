/* Shared behavior: mobile nav, scroll reveal, lightbox, footer year */
(function () {
  // Mobile nav
  var burger = document.getElementById('burger');
  var mobile = document.getElementById('mobileNav');
  if (burger && mobile) {
    burger.addEventListener('click', function () {
      mobile.classList.toggle('open');
      burger.setAttribute('aria-expanded', mobile.classList.contains('open'));
    });
    mobile.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { mobile.classList.remove('open'); });
    });
  }

  // Scroll reveal
  var items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && items.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('in'); });
  }

  // Lightbox
  var lb = document.getElementById('lightbox');
  if (lb) {
    var lbImg = lb.querySelector('.lb__img');
    var lbCap = lb.querySelector('.lb__cap');
    document.querySelectorAll('[data-lightbox]').forEach(function (fig) {
      fig.addEventListener('click', function () {
        var img = fig.querySelector('img');
        lbImg.src = img.getAttribute('data-full') || img.src;
        lbCap.textContent = fig.getAttribute('data-caption') || '';
        lb.classList.add('open');
        document.body.style.overflow = 'hidden';
      });
    });
    function closeLb() { lb.classList.remove('open'); document.body.style.overflow = ''; }
    lb.addEventListener('click', function (e) { if (e.target === lb || e.target.classList.contains('lb__close')) closeLb(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLb(); });
  }

  // Footer year
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // Contact modal
  var modal = document.getElementById('contactModal');
  document.querySelectorAll('[data-contact]').forEach(function (btn) {
    btn.addEventListener('click', function (e) { e.preventDefault(); if (modal) { modal.classList.add('open'); document.body.style.overflow = 'hidden'; } });
  });
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.hasAttribute('data-close')) { modal.classList.remove('open'); document.body.style.overflow = ''; }
    });
  }
})();
