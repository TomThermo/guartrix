/* Early theme + palette boot — keep FOUC-free without inline CSP scripts. */
(() => {
  const PALETTES = {
    slate: { dark: "#0b0f14", light: "#e4e8ef", mood: "edge" },
    teal: { dark: "#0a1214", light: "#e2ecec", mood: "glow" },
    amber: { dark: "#0f1012", light: "#eceae4", mood: "warm" },
    violet: { dark: "#0d0e14", light: "#e8e7ef", mood: "soft" },
    crimson: { dark: "#100e10", light: "#efe8ea", mood: "flat" },
    mono: { dark: "#0c0c0c", light: "#e8e8e8", mood: "sharp" },
    forest: { dark: "#0a140e", light: "#dfe9e2", mood: "glow" },
    midnight: { dark: "#040812", light: "#d8e0f0", mood: "edge" },
    ember: { dark: "#140a06", light: "#f0e4d8", mood: "warm" },
    sand: { dark: "#1c1812", light: "#ebe3d4", mood: "paper" },
    neon: { dark: "#020308", light: "#dce8f0", mood: "sharp" },
    blossom: { dark: "#160e14", light: "#f0e4ec", mood: "round" },
  };
  try {
    let p = localStorage.getItem("guartrix.theme") || "dark";
    let t =
      p === "system"
        ? window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark"
        : p === "light"
          ? "light"
          : "dark";
    document.documentElement.setAttribute("data-bs-theme", t);

    let pal = (localStorage.getItem("guartrix.palette") || "crimson").toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(PALETTES, pal)) pal = "crimson";
    document.documentElement.setAttribute("data-bh-palette", pal);
    document.documentElement.setAttribute("data-bh-mood", PALETTES[pal].mood || "flat");

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const colors = PALETTES[pal] || PALETTES.crimson;
      meta.setAttribute("content", t === "light" ? colors.light : colors.dark);
    }
  } catch (_e) {}
})();
