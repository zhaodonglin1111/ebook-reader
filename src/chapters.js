// 纯函数：文本 → 章节表。Chapter = { index, title, start, end }，[start, end) 为字符偏移。

// 行首锚定：第X章/节/回/卷（阿拉伯或中文数字）；或独立成行的书名类标题。
const CHAPTER_RE = /^第\s*[0-9０-９〇零一二三四五六七八九十百千万]+\s*[章节回卷]/;
const FIXED_RE = /^(序|序言|序曲|前言|楔子|引子|后记|尾声|番外)$/;
// 番外变体：番外一 / 番外2 / 番外十二，允许空格后带副题（如「番外一 旧时月色」）
const FANWAI_RE = /^番外\s*[0-9０-９〇零一二三四五六七八九十百千]+(?:\s+\S.*)?$/;
const MAX_TITLE_LEN = 30; // 去首尾空白后超过 30 字不参与匹配，收紧误判面

function isHeading(line) {
  const t = line.trim();
  if (t.length === 0 || t.length > MAX_TITLE_LEN) return false;
  return CHAPTER_RE.test(t) || FIXED_RE.test(t) || FANWAI_RE.test(t);
}

export function detectChapters(text) {
  const starts = [];
  let pos = 0;
  for (const line of text.split("\n")) {
    if (isHeading(line)) starts.push({ title: line.trim(), start: pos });
    pos += line.length + 1; // +1 是换行符本身
  }
  const end = text.length;
  if (starts.length === 0) {
    // 0 命中退化为单章，保证"能读"底线
    return [{ index: 0, title: "", start: 0, end }];
  }
  return starts.map((h, i) => ({
    index: i,
    title: h.title,
    start: h.start,
    end: i + 1 < starts.length ? starts[i + 1].start : end,
  }));
}
