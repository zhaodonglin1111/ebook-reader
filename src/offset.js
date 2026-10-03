// 纯函数：字符偏移 ↔ (章序号, 章内偏移, 归一化比例)。二分查找，章表按 start 升序。

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}

function findChapterIndex(chapters, offset) {
  let lo = 0;
  let hi = chapters.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (chapters[mid].start <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function locate(chapters, charOffset) {
  if (chapters.length === 0) {
    return { chapterIndex: 0, chapterOffset: 0, progress: 0 };
  }
  const textEnd = chapters[chapters.length - 1].end;
  const offset = clamp(charOffset, 0, textEnd);
  const i = findChapterIndex(chapters, offset);
  const ch = chapters[i];
  return {
    chapterIndex: i,
    chapterOffset: offset - ch.start,
    progress: textEnd > 0 ? offset / textEnd : 0,
  };
}

export function chapterStart(chapters, index) {
  if (chapters.length === 0) return 0;
  const i = clamp(index | 0, 0, chapters.length - 1);
  return chapters[i].start;
}

// 章末"自动接下一章"：给出下一合法起点；已是最后一章则收敛到文末
export function nextStart(chapters, offset) {
  if (chapters.length === 0) return 0;
  const i = findChapterIndex(chapters, offset);
  if (i + 1 < chapters.length) return chapters[i + 1].start;
  return chapters[chapters.length - 1].end;
}
