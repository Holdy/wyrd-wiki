// The only script a page names, first in its body: it runs before the first paint, so keep it small. It sets up
// the page's classes, then writes in what every page needs. Written tags are parsed as if they were in the file, so
// the fonts hold back the first paint and the scripts run in order once the page is read, just as tags there would.
(function () {
  var root = document.documentElement;
  // rsc/js/site.js redraws the page's own content. Until it has, the plain version stays hidden, so only the finished page is ever seen.
  root.classList.add("loading");
  // A page deep in the wiki shouldn't flash the home title.
  if (location.pathname !== "/") root.classList.add("deep");
  // Saved options (rsc/js/options.js): a layer the visitor has switched off is hidden from the first paint.
  try {
    var saved = JSON.parse(localStorage.getItem("wyrd-options")) || {};
    var visuals = saved.visuals || {};
    if (visuals.grain === false) root.classList.add("no-grain");
    if (visuals.edges === false) root.classList.add("no-edges");
    if (visuals.chameleoff === true) root.classList.add("chameleoff");
  } catch (e) {}
  document.write(
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link href="https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=IM+Fell+English+SC&display=swap" rel="stylesheet">' +
    // the filter's rule is here, not in the stylesheet, as url(#...) is safest in the page that holds the filter
    '<style>.dropcap.illustrated canvas { filter: url(#white-clear); }</style>' +
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="white-clear" color-interpolation-filters="sRGB"><feFlood flood-color="#fff" result="white"/><feComposite in="SourceGraphic" in2="white" operator="over"/><feColorMatrix type="matrix" values="0 0 0 0 0.40  0 0 0 0 0.094  0 0 0 0 0.051  0 -1.1 0 0 1.1"/></filter></svg>' +
    '<div id="paper" aria-hidden="true"></div>' +
    '<canvas id="dust" aria-hidden="true"></canvas>' +
    '<script defer src="/rsc/js/triangles.js"><\/script>' +
    '<script defer src="/rsc/js/site.js"><\/script>' +
    '<script defer src="/rsc/js/dust.js"><\/script>' +
    '<script type="module" src="/rsc/js/orchestrator.js"><\/script>');
})();
