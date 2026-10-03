import { test } from "node:test";
import assert from "node:assert";

test("骨架冒烟：node --test 可运行", () => {
  assert.equal(1 + 1, 2);
});
