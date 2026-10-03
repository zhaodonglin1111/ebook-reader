import { test } from "node:test";
import assert from "node:assert";
import { locate, chapterStart, nextStart } from "../src/offset.js";

const chapters = [
  { index: 0, title: "第一章", start: 0, end: 10 },
  { index: 1, title: "第二章", start: 10, end: 25 },
  { index: 2, title: "第三章", start: 25, end: 40 },
];
const textLength = 40;

test("章边界：恰在下一章首字符归入下一章", () => {
  assert.equal(locate(chapters, 0).chapterIndex, 0);
  assert.equal(locate(chapters, 9).chapterIndex, 0);
  assert.equal(locate(chapters, 10).chapterIndex, 1);
  assert.equal(locate(chapters, 10).chapterOffset, 0);
  assert.equal(locate(chapters, 25).chapterIndex, 2);
  assert.equal(locate(chapters, 25).chapterOffset, 0);
});

test("越界收敛：负值归 0，超出文末收敛到末章末尾", () => {
  const lo = locate(chapters, -5);
  assert.deepEqual([lo.chapterIndex, lo.chapterOffset, lo.progress], [0, 0, 0]);
  const hi = locate(chapters, 999);
  assert.equal(hi.chapterIndex, 2);
  assert.equal(hi.chapterOffset, 15);
  assert.equal(hi.progress, 1);
});

test("归一化比例单调不减", () => {
  let prev = -1;
  for (let i = 0; i <= textLength; i++) {
    const p = locate(chapters, i).progress;
    assert.ok(p >= prev, `progress 在偏移 ${i} 处回退了`);
    prev = p;
  }
});

test("往返：chapterStart(i) → locate 落回第 i 章开头", () => {
  for (let i = 0; i < chapters.length; i++) {
    const loc = locate(chapters, chapterStart(chapters, i));
    assert.equal(loc.chapterIndex, i);
    assert.equal(loc.chapterOffset, 0);
  }
});

test("随机偏移往返：locate 结果与章表区间一致", () => {
  for (let n = 0; n < 200; n++) {
    const offset = Math.floor(Math.random() * (textLength + 20)) - 10;
    const loc = locate(chapters, offset);
    const clamped = Math.min(Math.max(offset, 0), textLength);
    const ch = chapters[loc.chapterIndex];
    assert.ok(clamped >= ch.start && clamped <= ch.end);
    assert.equal(ch.start + loc.chapterOffset, clamped);
  }
});

test("nextStart：章末自动接下一章，末章收敛到文末", () => {
  assert.equal(nextStart(chapters, 5), 10);
  assert.equal(nextStart(chapters, 10), 25);
  assert.equal(nextStart(chapters, 39), textLength);
});

test("chapterStart 越界索引收敛", () => {
  assert.equal(chapterStart(chapters, -1), 0);
  assert.equal(chapterStart(chapters, 99), 25);
});
