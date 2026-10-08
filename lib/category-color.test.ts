import { describe, expect, it } from "vitest";
import { colorDistance, findSimilarCategoryColor, freeCategoryColors } from "./category-color";

describe("kolory kategorii", () => {
  it("wykrywa bardzo podobne kolory, ale nie różne", () => {
    const used = [{ name: "Mezoterapia", color: "#3b82f6" }];
    expect(findSimilarCategoryColor("#3c83f5", used)?.name).toBe("Mezoterapia");
    expect(findSimilarCategoryColor("#ef4444", used)).toBeNull();
  });

  it("pomija własną kategorię przy edycji", () => {
    const used = [{ name: "Mezoterapia", color: "#3b82f6" }];
    expect(findSimilarCategoryColor("#3b82f6", used, "Mezoterapia")).toBeNull();
  });

  it("wolne kolory nie są podobne do używanych", () => {
    const used = [{ name: "A", color: "#ef4444" }];
    expect(freeCategoryColors(used)).not.toContain("#ef4444");
    expect(colorDistance("#000000", "#ffffff")).toBeGreaterThan(400);
  });
});
