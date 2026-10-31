type Lang = "zh" | "en";

const EN: Record<string, string> = {
  "首页": "Home",
  "正在播放": "Now Playing",
  "专辑信息": "Album Info",
  "光盘库": "Library",
  "设置": "Settings",
  "CD播放器": "CD Player",
  "东半球最好的实体CD播放程序": "The best physical CD player around.",
  "展开侧边栏": "Expand sidebar",
  "收起侧边栏": "Collapse sidebar",
  "音频 CD": "Audio CD",
  "未知艺人": "Unknown artist",
  "未知专辑": "Unknown album",
  "未命名专辑": "Untitled album",
  "未检测到光驱": "No optical drive detected",
  "光盘已就绪": "Disc ready",
  "未检测到光盘": "No disc detected",
  "状态未知": "Status unknown",
  "当前CD": "Current CD",
  "播放控制": "Playback controls",
  "上一首": "Previous",
  "下一首": "Next",
  "播放": "Play",
  "暂停": "Pause",
  "继续播放": "Resume",
  "点击跳转": "Click to seek",
  "播放队列": "Playback queue",
  "关闭": "Close",
  "停止": "Stop",
  "随机播放": "Shuffle",
  "单曲循环": "Repeat one",
  "列表循环": "Repeat all",
  "循环模式": "Repeat mode",
  "歌词": "Lyrics",
  "显示歌词": "Show lyrics",
  "未播放": "Not playing",
  "重新读盘(换碟后)": "Reload disc (after swapping)",
  "重新读盘": "Reload disc",
  "最小化": "Minimize",
  "最大化": "Maximize",
  "官方": "Official",
  "搜索专辑": "Search album",
  "搜索中…": "Searching…",
  "加载更多…": "Load more…",
  "搜索": "Search",
  "歌手 专辑名，如 RADWIMPS 君の名は。": "Artist or album, e.g. RADWIMPS Your Name.",
  "正在连接光驱…": "Connecting to drive…",
  "插入光盘": "Insert a disc",
  "开始检测": "Start detection",
  "按歌手 / 专辑名在 MusicBrainz 中查找": "Search MusicBrainz by artist or album",
  "输入歌手或专辑名开始搜索": "Enter an artist or album to search",
  "正在查询 MusicBrainz…": "Querying MusicBrainz…",
  "没有结果，换个关键词试试": "No results. Try another query.",
  "Enter 搜索 · Esc 关闭": "Enter to search · Esc to close",
  "💿 光盘": "💿 Disc",
  "▶ 正在播放": "▶ Now Playing",
  "◈ 本地光盘库": "◈ Local Library",
  "拖动排序 · 右键下一首播放": "Drag to reorder · Right-click to play next",
  "立即播放": "Play now",
  "下一首播放": "Play next",
  "光盘已读取": "Disc loaded",
  "未识别这张 CD": "This CD was not recognized",
  "暂时没有对应的发行信息。可以手动搜索专辑，或把 DiscID 提交到 MusicBrainz。": "No release information yet. Search manually or submit the DiscID to MusicBrainz.",
  "⬆ 提交 DiscID": "⬆ Submit DiscID",
  "发行信息 · MusicBrainz × 网易云音乐": "Release information · MusicBrainz × NetEase Cloud Music",
  "↗ MusicBrainz 打开": "↗ Open in MusicBrainz",
  "专辑介绍": "Album notes",
  "暂无专辑介绍": "No album notes",
  "歌手信息": "Artist",
  "暂无歌手简介": "No artist biography",
  "曲目列表": "Track list",
  "收录碟片": "Discs",
  "打开 ↗": "Open ↗",
  "合集在光盘库中只显示一张封面；右键卡片可继续增加 C、D 碟。": "Box sets show one cover in the library. Right-click a card to add discs C and D.",
  "取消": "Cancel",
  "本地光盘库": "Local Library",
  "排序": "Sort",
  "手动": "Manual",
  "歌手": "Artist",
  "发行时间": "Release date",
  "插入光盘并识别成功后会自动收录": "Discs are added automatically after a successful identification.",
  "没有找到匹配的专辑": "No matching albums",
  "清除搜索": "Clear search",
  "请单击另一张封面设为": "Click another cover to set as",
  "仅可选择未编组的封面": "Only ungrouped covers can be selected",
  "设置 AB 碟": "Set as Disc A+B",
  "已将这张设为": "This cover is now",
  "A 碟": "Disc A",
  "B 碟": "Disc B",
  "双碟 · A 碟": "2-disc set · Disc A",
  "双碟 · B 碟": "2-disc set · Disc B",
  "双碟": "2-disc set",
  "。请再选择 B 碟，也可以以后再设置。": ". Now choose Disc B, or set it later.",
  "设置 B 碟": "Set as Disc B",
  "以后再设置": "Set later",
  "⟳ 重新查找": "⟳ Search again",
  "⌕ 手动查找": "⌕ Find manually",
  "歌词源": "Lyric source",
  "⌕ 手动查找歌词…": "⌕ Search lyrics manually…",
  "右键歌词可随时切换": "Right-click lyrics to switch sources",
  "⌕ 搜索专辑": "⌕ Search album",
  "曲目": "Tracks",
  "手动查找歌词": "Find lyrics manually",
  "用歌名和歌手搜索；找到后会记住这次选择，下次播放不再重新搜索。": "Search by title and artist. Your choice is remembered for this track.",
  "歌名": "Title",
  "结果会保存到本地缓存，之后同一首曲目会直接使用。": "Results are cached locally and reused for the same track.",
  "← 专辑": "← Album",
  "▶ 网易云音乐": "▶ NetEase Cloud Music",
  "QQ 音乐": "QQ Music",
  "在 MusicBrainz 查看 ↗": "View on MusicBrainz ↗",
  "暂无歌词": "No lyrics",
  "纯音乐": "Instrumental",
  "请欣赏": "Enjoy",
  "默认 (慧心)": "Default (Huixin)",
  "标准": "Standard",
  "大号": "Large",
  "特大": "Extra large",
  "跟随封面颜色": "Follow cover color",
  "专辑名": "Album",
  "艺术家": "Artist",
  "未检测到": "Not detected",
  "🔍 搜索曲目…": "🔍 Search tracks…",
  "匹配中…": "Matching…",
  "⟳ 重新匹配": "⟳ Re-match",
  "发行日期": "Release date",
  "国家/地区": "Country/Region",
  "版本": "Version",
  "条码": "Barcode",
  "格式": "Format",
  "加载中": "Loading",
  "未识别专辑": "Unidentified album",
  "外观": "Appearance",
  "播放 · 光盘元数据": "Playback · Disc metadata",
  "外观 · 播放 · 光盘元数据": "Appearance · Playback · Disc metadata",
  "应用字体 (调用电脑字体)": "App font (system fonts)",
  "软件字号": "Interface size",
  "强调色": "Accent color",
  "背景光效 (Apple Music 式动画)": "Ambient background (Apple Music-style animation)",
  "自动播放下一首": "Auto-play next track",
  "自动加载歌词": "Auto-load lyrics",
  "光盘与元数据": "Disc & metadata",
  "手动编辑专辑名 / 艺术家 (本地覆盖)": "Edit album / artist manually (local override)",
  "保存": "Save",
  "手动上传封面 (存为本地, 永久复用)": "Upload cover (stored locally and reused)",
  "选择图片": "Choose image",
  "提交 DiscID 到 MusicBrainz": "Submit DiscID to MusicBrainz",
  "提交": "Submit",
  "关于": "About",
  "光驱设备": "Optical drive",
  "界面语言": "Language",
  "默认（最佳匹配）": "Auto (best match)",
  "默认 (最佳匹配)": "Auto (best match)",
  "网易云音乐": "NetEase Cloud Music",
  "酷狗音乐": "Kugou Music",
  "点击返回封面": "Back to cover",
  "点击查看专辑信息": "View album info",
  "返回封面": "Back to cover",
  "请输入歌名": "Enter a title",
  "没有找到歌词，换一个歌名或歌手再试试": "No lyrics found. Try another title or artist.",
  "查找失败，请检查网络后重试": "Search failed. Check your connection and retry.",
  "例如：時よ": "e.g. 時よ",
  "例如：星野源": "e.g. Hoshino Gen",
  "查找中…": "Searching…",
  "查找并保存": "Find & save",
  "读取光盘": "Read disc",
  "匹配发行版": "Match release",
  "专辑详情": "Album details",
  "返回专辑": "Back to album",
  "点击播放": "Click to play",
  "查看单曲与歌词": "View track & lyrics",
  "读取光盘目录…": "Reading disc TOC…",
  "识别请求失败": "Identification failed",
  "无法读取光盘": "Could not read disc",
  "重新查询 MusicBrainz DiscID…": "Re-querying MusicBrainz DiscID…",
  "重新匹配失败": "Re-match failed",
  "光盘已弹出 — 放入新光盘后自动识别": "Disc ejected — insert a new disc to identify automatically",
  "播放队列已结束": "Queue finished",
  "正在搜索歌词源…": "Searching lyric sources…",
  "无歌词": "No lyrics",
  "手动歌词": "Manual lyrics",
  "未找到歌词": "Lyrics not found",
  "点击曲目开始播放": "Click a track to play",
  "检测失败, 检查 USB 碟机后重试": "Detection failed. Check the USB drive and retry.",
  "封面已更新": "Cover updated",
  "关闭播放队列": "Close playback queue",
  "点击查看详情 · 右键编辑 / MusicBrainz": "Click for details · Right-click to edit / MusicBrainz",
  "拖动排序": "Drag to reorder",
  "这张专辑": "This album",
  "设置 A 碟失败": "Failed to set Disc A",
  "这张封面已在碟组中，请选择未编组的封面": "This cover is already in a set. Choose an ungrouped cover.",
  "已移除整个碟组": "Box set removed",
  "已从光盘库移除": "Removed from library",
  "移除失败": "Remove failed",
  "这张专辑没有可搜索的标题": "This album has no searchable title",
  "打开流媒体失败": "Could not open streaming service",
  "▶ 在网易云音乐播放": "▶ Play in NetEase Cloud Music",
  "▶ 在 QQ 音乐播放": "▶ Play in QQ Music",
  "✏️ 编辑元数据": "✏️ Edit metadata",
  "💿 设置 B 碟": "💿 Set as Disc B",
  "💿 设置 AB 碟": "💿 Set as Disc A+B",
  "⟳ 刷新封面": "⟳ Refresh cover",
  "🖼 上传封面": "🖼 Upload cover",
  "⤴ 打开 MusicBrainz": "⤴ Open on MusicBrainz",
  "🗑 移除整组": "🗑 Remove box set",
  "🗑 从光盘库移除": "🗑 Remove from library",
  "● 已识别": "● Identified",
  "● 未识别": "● Unidentified",
  "● 匹配中": "● Matching",
  "光盘": "Disc",
  "右键卡片编辑": "Right-click a card to edit",
  "拖动卡片排序": "Drag cards to reorder",
  "· 拖动卡片排序": "· Drag cards to reorder",
  "· 右键卡片编辑": "· Right-click a card to edit",
  "搜索专辑、歌手或 DiscID": "Search album, artist or DiscID",
  "正在读取光盘…": "Reading disc…",
  "正在读取光盘目录…": "Reading disc TOC…",
  "正在匹配发行版…": "Matching release…",
  "识别中…": "Identifying…",
  "识别完成": "Identification complete",
  "未找到发行版": "Release not found",
  "正在识别…": "Identifying…",
  "正在检测光驱…": "Detecting drive…",
  "当前CD ·": "Current CD ·",
  "首": "tracks",
  "首曲目": "tracks",
  "张收藏": "albums",
  "张碟": "discs",
  "张": "discs",
  "碟": "disc",
  "光盘合集 · ": "Box set · ",
  "语言": "Language",
};

const PATTERNS: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^(\d+)\s*首$/, (m) => `${m[1]} tracks`],
  [/^(\d+)\s*首曲目$/, (m) => `${m[1]} tracks`],
  [/^(\d+)\s*首 · (.+)$/, (m) => `${m[1]} tracks · ${translate(m[2])}`],
  [/^第 (\d+) 张碟片$/, (m) => `Disc ${m[1]}`],
  [/^已收录 (\d+) 张$/, (m) => `${m[1]} in library`],
  [/^曲目 (\d+)$/, (m) => `Track ${m[1]}`],
  [/^循环模式: (.+)$/, (m) => `Repeat mode: ${translate(m[1])}`],
  [/^双碟 · ([A-Z]) 碟$/, (m) => `2-disc set · Disc ${m[1]}`],
  [/^(\d+) \/ (\d+) 个结果$/, (m) => `${m[1]} / ${m[2]} results`],
  [/^(\d+) 个结果$/, (m) => `${m[1]} results`],
  [/^(\d+) 张收藏$/, (m) => `${m[1]} albums`],
  [/^(\d+) \/ (\d+) 张收藏$/, (m) => `${m[1]} / ${m[2]} albums`],
  [/^(\d+) 张$/, (m) => `${m[1]} discs`],
  [/^(\d+) 张碟$/, (m) => `${m[1]} discs`],
  [/^(\d+) 张碟片$/, (m) => `${m[1]} discs`],
  [/^(\d+) 碟$/, (m) => `${m[1]} discs`],
  [/^光盘合集 · (\d+) 张碟$/, (m) => `Box set · ${m[1]} discs`],
  [/^当前CD · (.+)$/, (m) => `Current CD · ${translate(m[1])}`],
  [/^已加入下一首播放：(.+)$/, (m) => `Added to play next: ${m[1]}`],
  [/^播放失败：(.+)$/, (m) => `Playback failed: ${m[1]}`],
  [/^封面保存失败：(.+)$/, (m) => `Failed to save cover: ${m[1]}`],
  [/^设置 (.+) 碟失败$/, (m) => `Failed to set Disc ${m[1]}`],
  [/^已将「(.+)」设为 (.+) 碟$/, (m) => `Set “${m[1]}” as Disc ${m[2]}`],
];

function translate(raw: string): string {
  const m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!m) return raw;
  const [, lead, body, tail] = m;
  if (!body) return raw;
  if (EN[body]) return lead + EN[body] + tail;
  for (const [re, fn] of PATTERNS) {
    const hit = body.match(re);
    if (hit) return lead + fn(hit) + tail;
  }
  return raw;
}

const ATTRS = ["placeholder", "title", "aria-label", "alt"];
let observer: MutationObserver | null = null;
let translating = false;

function skipTextElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "INPUT") return true;
  return el.hasAttribute("data-i18n-skip");
}

function skipAttrElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "SCRIPT" || tag === "STYLE") return true;
  return el.hasAttribute("data-i18n-skip");
}

function translateTextNode(node: Text) {
  const parent = node.parentElement;
  if (skipTextElement(parent)) return;
  const raw = node.nodeValue ?? "";
  if (raw.trim() === "播放" && parent?.closest(".set-title")) {
    node.nodeValue = raw.replace("播放", "Playback");
    return;
  }
  const next = translate(raw);
  if (next !== node.nodeValue) node.nodeValue = next;
}

function translateElementAttrs(el: Element) {
  if (skipAttrElement(el)) return;
  for (const name of ATTRS) {
    const value = el.getAttribute(name);
    if (!value) continue;
    const next = translate(value);
    if (next !== value) el.setAttribute(name, next);
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text);
    return;
  }
  if (!(root instanceof Element)) return;
  translateElementAttrs(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) translateTextNode(n as Text);
  root.querySelectorAll("*").forEach(translateElementAttrs);
}

function run(root: Node = document.body) {
  if (translating) return;
  translating = true;
  observer?.disconnect();
  try {
    walk(root);
  } finally {
    translating = false;
    if (observer) observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    });
  }
}

export function currentLang(): Lang {
  try {
    const s = JSON.parse(localStorage.getItem("sd-settings") ?? "{}");
    return s.lang === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
}

export function installI18n() {
  const lang = currentLang();
  document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  if (lang !== "en") return;
  observer = new MutationObserver((muts) => {
    if (translating) return;
    translating = true;
    observer?.disconnect();
    try {
      for (const mut of muts) {
        if (mut.type === "characterData") translateTextNode(mut.target as Text);
        else if (mut.type === "attributes") translateElementAttrs(mut.target as Element);
        else if (mut.type === "childList") {
          mut.addedNodes.forEach((n) => walk(n));
        }
      }
    } finally {
      translating = false;
      if (observer) observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ATTRS,
      });
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
  requestAnimationFrame(() => run());
  // 兜底: 某些异步/重挂载节点可能绕过 MutationObserver
  window.setInterval(() => run(), 1200);
}
