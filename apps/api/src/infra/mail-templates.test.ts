import { describe, expect, it } from "vitest";
import { applyTemplate } from "./mail-templates.js";

describe("applyTemplate", () => {
  it("substitutes vars and escapes HTML", () => {
    const out = applyTemplate("Hello {{name}} <b>{{tag}}</b>", { name: "A&B", tag: "<x>" }, {
      escape: true,
    });
    expect(out).toBe("Hello A&amp;B <b>&lt;x&gt;</b>");
  });

  it("supports truthy and falsy sections", () => {
    const withLogo = applyTemplate("{{#logo}}L{{/logo}}{{^logo}}N{{/logo}}", { logo: true }, {
      escape: false,
    });
    const without = applyTemplate("{{#logo}}L{{/logo}}{{^logo}}N{{/logo}}", { logo: false }, {
      escape: false,
    });
    expect(withLogo).toBe("L");
    expect(without).toBe("N");
  });
});
