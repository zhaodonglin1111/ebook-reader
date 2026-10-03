// 唯一有副作用的模块：文件读取、渲染、翻页、进度存取。不进单测。
// 不变量：位置永远用全书字符偏移表达；字号/行距/窗口变化只影响渲染，不回写进度。
import { decode } from "./encoding.js";
import { detectChapters } from "./chapters.js";
import { locate, chapterStart, nextStart } from "./offset.js";

const $ = (sel) => document.querySelector(sel);
const reader = $("#reader");
const chapterEl = $("#chapter");
const welcome = $("#welcome");
const fileInput = $("#file-input");
const bookNameEl = $("#book-name");
const progressEl = $("#progress");
const btnToc = $("#btn-toc");
const tocDrawer = $("#toc");
const tocList = $("#toc-list");
const typeControls = $("#type-controls");
const barDivider = $("#bar-divider");

// —— 运行时状态 ——
let book = null;            // { name, byteSize, lastModified, text, chapters }
let offset = 0;             // 当前全书字符偏移（段落级锚点）
let renderedChapter = -1;   // 当前 DOM 里渲染的章序号
let saveTimer = 0;

const bookKey = (b) => `${b.name}:${b.byteSize}:${b.lastModified}`;
const textLen = () => (book ? book.text.length : 0);

// —— 排版档位（全局设置，与具体书无关） ——
const FONT_SIZES = [17, 20, 24];        // 小 / 中 / 大
const LINE_HEIGHTS = [1.6, 1.9];
const SETTINGS_KEY = "reader:settings";
let settings = { fontSize: 1, lineHeight: 1 };

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const s = raw ? JSON.parse(raw) : null;
    if (s) {
      const valid = (v, n) => Number.isInteger(v) && v >= 0 && v < n;
      settings.fontSize = valid(s.fontSize, FONT_SIZES.length) ? s.fontSize : 1;
      settings.lineHeight = valid(s.lineHeight, LINE_HEIGHTS.length) ? s.lineHeight : 1;
    }
  } catch { /* 坏数据用默认档 */ }
}

function applySettings() {
  const root = document.documentElement.style;
  root.setProperty("--font-size", FONT_SIZES[settings.fontSize] + "px");
  root.setProperty("--line-height", String(LINE_HEIGHTS[settings.lineHeight]));
  $("#btn-line").classList.toggle("on", settings.lineHeight === 1);
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

// 档位变化只影响渲染：改完重走一遍"反向恢复"，偏移不回写
function changeSetting(patch) {
  Object.assign(settings, patch);
  applySettings();
  if (book) goTo(offset);
}

// —— 目录抽屉 ——
function buildToc() {
  tocList.textContent = "";
  book.chapters.forEach((ch, i) => {
    const li = document.createElement("li");
    li.dataset.index = String(i);
    li.textContent = ch.title || "正文";
    li.title = ch.title || "正文";
    li.addEventListener("click", () => {
      persist();
      goTo(chapterStart(book.chapters, i));
      persist();
      setTocOpen(false);
    });
    tocList.appendChild(li);
  });
  syncTocHighlight();
}

function setTocOpen(open) {
  tocDrawer.hidden = !open;
  btnToc.classList.toggle("on", open);
}

// —— 打开与载入 ——
async function openFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = decode(bytes);
  book = {
    name: file.name,
    byteSize: file.size,
    lastModified: file.lastModified,
    text,
    chapters: detectChapters(text),
  };
  offset = readSavedOffset();
  bookNameEl.textContent = file.name;
  progressEl.hidden = false;
  welcome.hidden = true;
  typeControls.hidden = false;
  barDivider.hidden = false;
  btnToc.hidden = false;
  buildToc();
  goTo(offset);
  persist();
}

function readSavedOffset() {
  try {
    const raw = localStorage.getItem("reader:" + bookKey(book));
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && Number.isFinite(saved.charOffset)) {
      return Math.min(Math.max(saved.charOffset, 0), textLen());
    }
  } catch { /* 坏数据按无进度处理 */ }
  return 0;
}

function persist() {
  if (!book) return;
  try {
    localStorage.setItem("reader:" + bookKey(book),
      JSON.stringify({ bookKey: bookKey(book), charOffset: offset }));
  } catch { /* 存储异常不影响阅读 */ }
}

// 翻页不落盘（TECH 第 5 节）：滚动停稳 400ms 后补一次，章切换与离开页面直接落盘
function schedulePersist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 400);
}

// —— 渲染 ——
function renderChapter(idx) {
  const ch = book.chapters[idx];
  chapterEl.textContent = "";
  if (ch.title) {
    const h = document.createElement("h2");
    h.className = "chapter-title";
    h.textContent = ch.title;
    chapterEl.appendChild(h);
  }
  // 章体切段：跳过空行；每个 <p> 带全书字符偏移，标题行不计入正文
  const body = book.text.slice(ch.start, ch.end);
  let pos = ch.start;
  for (const raw of body.split("\n")) {
    const t = raw.trim();
    if (t) {
      const p = document.createElement("p");
      p.dataset.start = String(pos);
      p.textContent = t;
      chapterEl.appendChild(p);
    }
    pos += raw.length + 1;
  }
  renderedChapter = idx;
  return ch;
}

// 偏移 → 视图：必要时渲染该章，把 data-start <= offset 的最后一个段落滚到视口顶部
function goTo(target) {
  const clamped = Math.min(Math.max(target, 0), textLen());
  const loc = locate(book.chapters, clamped);
  if (loc.chapterIndex !== renderedChapter) renderChapter(loc.chapterIndex);
  let anchor = Number.NaN;
  for (const p of chapterEl.querySelectorAll("p")) {
    const s = Number(p.dataset.start);
    if (s <= clamped) anchor = s;
    else break;
  }
  if (Number.isNaN(anchor)) {
    const first = chapterEl.querySelector("p");
    anchor = first ? Number(first.dataset.start) : book.chapters[loc.chapterIndex].end;
  }
  offset = Number.isFinite(anchor) ? anchor : 0;
  scrollToStart(offset);
  syncTocHighlight();
  updateStatus();
}

function scrollToStart(start) {
  const p = chapterEl.querySelector(`p[data-start="${start}"]`);
  reader.scrollTop = p ? p.offsetTop : 0;
}

// 视口顶部所在段落 → 字符偏移（段落级锚点，v0.1 约定精度足够）
function anchorOffsetAtTop() {
  const threshold = reader.getBoundingClientRect().top + 2;
  let anchor = Number.NaN;
  for (const p of chapterEl.querySelectorAll("p")) {
    if (p.getBoundingClientRect().top <= threshold) anchor = Number(p.dataset.start);
    else break;
  }
  if (Number.isNaN(anchor)) {
    const first = chapterEl.querySelector("p");
    anchor = first ? Number(first.dataset.start) : book.chapters[renderedChapter].start;
  }
  return anchor;
}

// —— 翻页 —— 空格/→/右热区/上滑为正方向
function turn(delta) {
  if (!book) return;
  const step = delta * (reader.clientHeight - 2);
  const maxTop = reader.scrollHeight - reader.clientHeight;
  const nextTop = reader.scrollTop + step;

  if (delta > 0 && nextTop >= maxTop - 2) {
    const ns = nextStart(book.chapters, offset);
    if (ns < textLen()) { // 章末自动接下一章
      persist();
      goTo(ns);
    } else { // 已是全书末尾
      reader.scrollTop = maxTop;
      offset = anchorOffsetAtTop();
      persist();
      updateStatus();
    }
    return;
  }
  if (delta < 0 && nextTop <= 2) {
    const idx = locate(book.chapters, offset).chapterIndex;
    if (idx > 0) { // 章首回看上一章末尾
      renderChapter(idx - 1);
      reader.scrollTop = reader.scrollHeight;
      offset = anchorOffsetAtTop();
      persist();
      syncTocHighlight();
      updateStatus();
    } else {
      reader.scrollTop = 0;
      offset = 0;
      persist();
      updateStatus();
    }
    return;
  }
  reader.scrollTop = Math.max(0, Math.min(nextTop, maxTop));
  // scroll 事件会重新锚定 offset 并 schedulePersist，这里不重复做
}

function updateStatus() {
  if (!book) return;
  const loc = locate(book.chapters, offset);
  progressEl.textContent =
    `第 ${loc.chapterIndex + 1} 章 / 共 ${book.chapters.length} 章 · ${(loc.progress * 100).toFixed(1)}%`;
}

function syncTocHighlight() {
  const list = $("#toc-list");
  if (!list || !book) return;
  const idx = locate(book.chapters, offset).chapterIndex;
  for (const li of list.children) li.classList.toggle("active", Number(li.dataset.index) === idx);
}

// —— 事件绑定 ——
$("#btn-open").addEventListener("click", () => fileInput.click());
$("#welcome-open").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) openFile(fileInput.files[0]);
  fileInput.value = "";
});

document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) openFile(file);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { setTocOpen(false); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === "\\") { e.preventDefault(); setTocOpen(tocDrawer.hidden); return; }
  if (e.key === " " && e.target.matches("input, textarea, select, button")) return;
  if (tocDrawer.hidden === false) return; // 抽屉打开时不吃翻页键
  if (e.key === " " || e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); turn(1); }
  else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); turn(-1); }
});

$("#btn-line").addEventListener("click", () =>
  changeSetting({ lineHeight: settings.lineHeight === 0 ? 1 : 0 }));
$("#btn-font-in").addEventListener("click", () =>
  changeSetting({ fontSize: Math.min(settings.fontSize + 1, FONT_SIZES.length - 1) }));
$("#btn-font-out").addEventListener("click", () =>
  changeSetting({ fontSize: Math.max(settings.fontSize - 1, 0) }));
btnToc.addEventListener("click", () => setTocOpen(tocDrawer.hidden));
$("#toc-close").addEventListener("click", () => setTocOpen(false));

reader.addEventListener("click", (e) => {
  if (window.getSelection().toString()) return; // 选文字时不抢点击
  const half = reader.getBoundingClientRect().left + reader.clientWidth / 2;
  turn(e.clientX < half ? -1 : 1);
});

let touchY = null;
reader.addEventListener("touchstart", (e) => { touchY = e.touches[0].clientY; }, { passive: true });
reader.addEventListener("touchend", (e) => {
  if (touchY === null) return;
  const dy = e.changedTouches[0].clientY - touchY;
  if (Math.abs(dy) > 48) turn(dy < 0 ? 1 : -1);
  touchY = null;
}, { passive: true });

reader.addEventListener("scroll", () => {
  if (!book) return;
  offset = anchorOffsetAtTop();
  schedulePersist();
  updateStatus();
}, { passive: true });

document.addEventListener("visibilitychange", () => { if (document.hidden) persist(); });
window.addEventListener("pagehide", persist);

loadSettings();
applySettings();
