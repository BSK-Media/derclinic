import { describe, expect, it } from "vitest";
import { diffMembership, rfmListName, RFM_LIST_SEGMENTS } from "./rfm-lists";

describe("diffMembership", () => {
  it("pacjent, który zmienił segment, znika ze starej listy i trafia na nową", () => {
    const vipBefore = ["a", "b"];
    const vipAfter = ["a"];
    expect(diffMembership(vipBefore, vipAfter)).toEqual({ add: [], remove: ["b"] });
    expect(diffMembership(["c"], ["c", "b"])).toEqual({ add: ["b"], remove: [] });
  });
  it("bez zmian nic nie dodaje ani nie usuwa", () => {
    expect(diffMembership(["a", "b"], ["b", "a"])).toEqual({ add: [], remove: [] });
  });
});

describe("listy RFM", () => {
  it("nie ma listy dla segmentu Pozostali", () => {
    expect(RFM_LIST_SEGMENTS).not.toContain("OTHER");
    expect(RFM_LIST_SEGMENTS).toHaveLength(6);
  });
  it("nazwa listy zawiera etykietę segmentu", () => {
    expect(rfmListName("WIN_BACK")).toBe("RFM · Do odzyskania");
  });
});
