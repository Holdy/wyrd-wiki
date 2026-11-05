// Runs before the first paint. Loaded from the head of every page, so keep it small.
(function () {
  var root = document.documentElement;
  // js/site.js redraws the page's own content. Until it has, the plain version stays hidden, so only the finished page is ever seen.
  root.classList.add("loading");
  // A page deep in the wiki shouldn't flash the home title.
  if (location.pathname.indexOf("/data/stories/") === 0) root.classList.add("deep");
  // Saved options (js/options.js): a layer the visitor has switched off is hidden from the first paint.
  try {
    var saved = JSON.parse(localStorage.getItem("wyrd-options")) || {};
    var visuals = saved.visuals || {};
    if (visuals.grain === false) root.classList.add("no-grain");
    if (visuals.edges === false) root.classList.add("no-edges");
    if (visuals.chameleoff === true) root.classList.add("chameleoff");
  } catch (e) {}
})();
