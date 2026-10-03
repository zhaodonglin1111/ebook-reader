import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { detectChapters } from "../src/chapters.js";

test("中文数字 / 阿拉伯数字 / 节回卷 / 独立标题都能识别", () => {
  const text = [
    "序言",
    "　　正文。",
    "楔子",
    "　　正文。",
    "引子",
    "　　正文。",
    "第一章 起点",
    "　　正文。",
    "第2节 阿拉伯",
    "　　正文。",
    "第一百二十章 大数字",
    "　　正文。",
    "第四回 说书",
    "　　正文。",
    "第3卷 合集",
    "　　正文。",
    "后记",
    "　　正文。",
    "尾声",
    "　　正文。",
    "番外一 旧时月色",
    "　　正文。",
  ].join("\n");
  const chapters = detectChapters(text);
  const titles = chapters.map((c) => c.title);
  for (const t of ["序言", "楔子", "引子", "第一章 起点", "第2节 阿拉伯",
    "第一百二十章 大数字", "第四回 说书", "第3卷 合集", "后记", "尾声", "番外一 旧时月色"]) {
    assert.ok(titles.includes(t), `应识别出「${t}」`);
  }
  // 区间完整覆盖：首章从 0 开始，末章到文末，相邻章首尾相接
  assert.equal(chapters[0].start, 0);
  assert.equal(chapters[chapters.length - 1].end, text.length);
  for (let i = 1; i < chapters.length; i++) {
    assert.equal(chapters[i].start, chapters[i - 1].end);
  }
});

test("超过 30 字的疑似标题行不误判", () => {
  const long = "第一章　这章的标题长得离谱，一定要超过三十个字才能验证我们的收紧策略确实生效了";
  assert.ok(long.trim().length > 30);
  const chapters = detectChapters(long + "\n正文\n");
  assert.equal(chapters.length, 1); // 退化为单章
  assert.equal(chapters[0].title, "");
});

test("正文行内干扰不切分", () => {
  const text = [
    "他说：第一章节很重要，不能跳过。",
    "　　山道迤逦，走了半日方到镇口。",
    "　　尾声将近，众人散去。",
    "第",
    "第一章后面直接跟正文不加任何停顿也不像标题这种情况应当被三十字限制拦下的例子行",
  ].join("\n");
  const chapters = detectChapters(text);
  assert.equal(chapters.length, 1);
});

test("0 命中退化为单章，覆盖全文", () => {
  const text = "没有任何标题的一本书。\n第二行。";
  const chapters = detectChapters(text);
  assert.deepEqual(chapters, [{ index: 0, title: "", start: 0, end: text.length }]);
});

test("真实样张：楔子/第一章/第二章/番外一/尾声 共 5 章", () => {
  const text = readFileSync(new URL("./fixtures/sample-utf8.txt", import.meta.url), "utf8");
  const titles = detectChapters(text).map((c) => c.title);
  assert.deepEqual(titles, ["楔子", "第一章 风雪夜归人", "第二章　山神庙", "番外一 旧时月色", "尾声"]);
});
