import { describe, expect, it } from "vitest";
import { sanitizeSearch } from "./queries";

describe("sanitizeSearch", () => {
  it("quita caracteres que alterarían el filtro de PostgREST", () => {
    expect(sanitizeSearch("a,b),title.eq.x(")).toBe("a b title.eq.x");
    expect(sanitizeSearch("100% _todo_ *")).toBe("100 todo");
  });
  it("recorta y limita la longitud", () => {
    expect(sanitizeSearch("   envíos   ")).toBe("envíos");
    expect(sanitizeSearch("x".repeat(300))).toHaveLength(100);
    expect(sanitizeSearch(undefined)).toBe("");
  });
});
