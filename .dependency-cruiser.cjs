/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "web-no-api",
      comment:
        "Web must not import API source trees (apps/api). Talk to the HTTP API instead.",
      severity: "error",
      from: { path: "^apps/web/" },
      to: { path: "^apps/api/" },
    },
    {
      name: "web-no-api-package",
      comment: "Web must not import the @guartrix/@guartrix api workspace package.",
      severity: "error",
      from: { path: "^apps/web/" },
      to: { path: "(^|/)(@msm|@guartrix)/api(/|$)" },
    },
    {
      name: "routes-no-prisma",
      comment:
        "Routes must not import Prisma or db directly — use repositories/ or services/.",
      severity: "error",
      from: { path: "^apps/api/src/routes/" },
      to: {
        path: "(^|/)((infra/)?db(\\.(js|ts))?|@prisma/client)(/|$)",
      },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules|dist|build|coverage|\\.git",
    },
    // Avoid depending on per-package tsconfig include resolution under depcruise.
    tsPreCompilationDeps: false,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
      mainFields: ["module", "main", "types", "typings"],
    },
  },
};
