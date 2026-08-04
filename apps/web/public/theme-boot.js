/* Early theme boot — keep FOUC-free without inline CSP scripts. */
(function () {
  try {
    var p = localStorage.getItem("guartrix.theme") || "dark";
    var t =
      p === "system"
        ? window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark"
        : p === "light"
          ? "light"
          : "dark";
    document.documentElement.setAttribute("data-bs-theme", t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "light" ? "#e8ece9" : "#1a1d23");
  } catch (e) {}
})();
