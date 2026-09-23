import assert from "node:assert/strict";
import { test } from "node:test";
import { filterChat } from "./chatFilter.ts";

test("filtr czatu", () => {
  assert.equal(filterChat("siema wszystkim"), "siema wszystkim");
  assert.equal(filterChat("ty kurwo"), "ty #####");
  assert.equal(filterChat("sh1t happens"), "#### happens");
  assert.equal(filterChat("a".repeat(500)).length, 200);
  assert.equal(filterChat("  \u0007hej  "), "hej");
});
