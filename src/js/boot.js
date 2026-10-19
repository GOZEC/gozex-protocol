(function () {
  var d = document.documentElement;
  d.classList.add('js');
  var m = window.matchMedia('(prefers-reduced-motion: reduce)');
  function s() { d.classList.toggle('reduce', m.matches); }
  s();
  if (m.addEventListener) m.addEventListener('change', s);
})();
