import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  confirmReleaseForDisc,
  detectDisc,
  driveScan,
  fetchCover,
  libraryCover,
  fetchLyrics,
  mediaState,
  onDriveMedia,
  onEnded,
  onIdentifyProgress,
  onProgress,
  openMbRelease,
  openMbSubmit,
  playTrack,
  playerPause,
  playerSeek,
  playerStop,
  playerVolume,
  resolveDisc,
  librarySetMedium,
  saveCover,
  searchReleases,
  type IdentifyProgress as IdentifyProgressData,
  type LyricsResult,
  type LyricSource,
  type Progress,
  type Release,
  type TocInfo,
} from "./api";
import { parseLrc, type LrcLine } from "./lrc";
import { NavSidebar } from "./components/NavSidebar";
import { HomeView } from "./components/HomeView";
import { PlayerStage } from "./components/PlayerStage";
import { TrackPanel } from "./components/TrackPanel";
import { InfoView, SettingsView } from "./components/Views";
import { LibraryView } from "./components/LibraryView";
import { SearchPanel } from "./components/SearchPanel";
import { ManualLyricsModal } from "./components/ManualLyricsModal";
import { IdentifyProgress } from "./components/IdentifyProgress";

type View = "home" | "playing" | "tracks" | "info" | "library" | "settings";

type ViewTransitionLike = { finished?: Promise<void> };

type ViewTransitionDocument = Document & {
  startViewTransition?: (cb: () => void) => ViewTransitionLike;
};

/** 支持 View Transitions 时让封面从首页滑到舞台，否则直接切页 */
function withViewTransition(fn: () => void) {
  const doc = document as ViewTransitionDocument;
  if (!doc.startViewTransition) {
    fn();
    return;
  }
  const root = document.documentElement;
  root.classList.add("vt-busy");
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    root.classList.remove("vt-busy");
  };
  let ran = false;
  try {
    const vt = doc.startViewTransition(() => {
      ran = true;
      flushSync(fn);
    });
    if (vt?.finished) {
      vt.finished.finally(done).catch(() => {});
    } else {
      setTimeout(done, 700);
    }
  } catch {
    done();
    if (!ran) fn();
  }
}

function readLyricSource(): LyricSource {
  const v = localStorage.getItem("sd-lyric-source");
  return v === "lrclib" || v === "netease" || v === "qq" || v === "kugou"
    ? v
    : "auto";
}

const MANUAL_LYRIC_KEY = "sd-manual-lyrics";

function lyricCacheKey(title: string, artist: string, lengthMs: number | null) {
  return `${title}|${artist}|${lengthMs ?? ""}`;
}

function readManualLyrics(): Record<string, LyricsResult> {
  try {
    const v = JSON.parse(localStorage.getItem(MANUAL_LYRIC_KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function saveManualLyrics(key: string, result: LyricsResult) {
  const map = readManualLyrics();
  map[key] = result;
  const entries = Object.entries(map);
  const trimmed =
    entries.length > 80 ? Object.fromEntries(entries.slice(-80)) : map;
  try {
    localStorage.setItem(MANUAL_LYRIC_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore quota */
  }
}

function loadFavs(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem("sounddisc-favs") ?? "[]"));
  } catch {
    return new Set();
  }
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("home");
  const [disc, setDisc] = useState<TocInfo | null>(null);
  const [realRelease, setRealRelease] = useState<Release | null>(null);
  const [mediumIdx, setMediumIdx] = useState<number | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [lyricsOn, setLyricsOn] = useState(true);
  const [lyricsOnly, setLyricsOnly] = useState(false);
  const [lrcLines, setLrcLines] = useState<LrcLine[]>([]);
  const [lrcSource, setLrcSource] = useState("");
  const [lyricSourceMode, setLyricSourceMode] = useState<LyricSource>(readLyricSource);
  const [manualLyricsOpen, setManualLyricsOpen] = useState(false);
  const [playing, setPlaying] = useState<{ no: number; title: string } | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [status, setStatus] = useState("");
  const [identify, setIdentify] = useState<IdentifyProgressData | null>(null);
  const [identifyHint, setIdentifyHint] = useState("");
  const [retryingIdentify, setRetryingIdentify] = useState(false);
  const [volume, setVolume] = useState(80);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<"off" | "all" | "one">("off");
  const [panelVisible, setPanelVisible] = useState(false);
  const [queue, setQueue] = useState<number[]>([]);
  const [driveState, setDriveState] = useState<"disc" | "empty" | "unknown" | null>(null);
  const [favs, setFavs] = useState<Set<string>>(loadFavs);
  const [settings, setSettings] = useState<any>(() => {
    try {
      return JSON.parse(localStorage.getItem("sd-settings") ?? "{}");
    } catch {
      return {};
    }
  });
  useEffect(() => {
    localStorage.setItem("sd-settings", JSON.stringify(settings));
    // 字号: 仅放大文字 (UI 尺寸不变), 通过 --fs 变量作用于文本
    const fs = settings.font === "lg" ? 1.14 : settings.font === "xl" ? 1.28 : 1;
    document.documentElement.style.setProperty("--fs", String(fs));
    // 强调色 + 背景动效开关
    document.documentElement.style.setProperty("--accent", settings.accent || "#4cc2ff");
    document.body.classList.toggle("no-amb", settings.ambient === false);
    // 应用字体 (空 = 系统默认)
    document.body.style.fontFamily = settings.fontFamily || "";
  }, [settings]);
  const upSettings = (patch: any) => setSettings((s: any) => ({ ...s, ...patch }));
  const autoNextRef = useRef(true);
  autoNextRef.current = settings.autoNext !== false;
  const autoLyricsRef = useRef(true);
  autoLyricsRef.current = settings.autoLyrics !== false;

  const identifyingRef = useRef(false);
  const lastFailAt = useRef(0);
  const playingRef = useRef(playing);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  const discRef = useRef(disc);
  useEffect(() => {
    discRef.current = disc;
  }, [disc]);
  const shuffleRef = useRef(shuffle);
  useEffect(() => {
    shuffleRef.current = shuffle;
  }, [shuffle]);
  const repeatRef = useRef(repeat);
  useEffect(() => {
    repeatRef.current = repeat;
  }, [repeat]);
  const queueRef = useRef<number[]>([]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  const playStartedAt = useRef(0);
  const volumeRef = useRef(volume);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  const artists = (r: Release | null) =>
    r?.artistCredit?.map((a) => a.name).join(" / ") || "";

  const loadCover = useCallback(async (r: Release) => {
    // 封面是专辑级资源: 用专辑名检索网易云兜底。
    // (旧缓存里 artistCredit 可能为空，用首曲名会搜到同名的其它歌手)
    const title = r.title || r.media?.[0]?.tracks?.[0]?.title || "";
    const artist = r.artistCredit?.map((a) => a.name).join(" / ") ?? "";
    // 光盘库封面路径 (缓存/网易云) 与列表保持一致, 优先使用, 避免 CAA 的
    // release-group 图把单曲封面错成同组专辑封面 (例如 知らない -> Stranger)
    try {
      const quick = await libraryCover(r.id, title, artist);
      if (quick) {
        setCover(quick);
        return;
      }
    } catch {
      /* 继续走 CAA */
    }
    try {
      setCover(await fetchCover(r.id, r.releaseGroup?.id ?? null, title, artist));
    } catch {
      setCover(null);
    }
  }, []);

  // 双碟片: 按 DiscID 持久化选择的碟片 (A=media[0], B=media[1])
  useEffect(() => {
    if (!realRelease || !disc) return;
    if ((realRelease.media?.length ?? 0) <= 1) return;
    const saved = localStorage.getItem(`sd-med-${disc.discid}`);
    const idx = saved !== null ? Number(saved) : null;
    setMediumIdx(idx !== null && idx < (realRelease.media?.length ?? 0) ? idx : null);
  }, [realRelease, disc?.discid]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickMedium = (i: number) => {
    if (!disc) return;
    setMediumIdx(i);
    // 持久化到收藏库条目 (跟随 DiscID 永久)
    void librarySetMedium(disc.discid, i);
  };

  // 视图层 release: 多碟条目只暴露选中的那张碟 (下层组件无需改动)
  const release = useMemo(() => {
    if (!realRelease) return null;
    const meds = realRelease.media ?? [];
    if (meds.length <= 1) return realRelease;
    const i = mediumIdx !== null && mediumIdx < meds.length ? mediumIdx : 0;
    return { ...realRelease, media: [meds[i]] };
  }, [realRelease, mediumIdx]);

  // 播放队列独立于光盘物理顺序; 换碟时重置
  useEffect(() => {
    setQueue(
      disc ? Array.from({ length: disc.trackCount }, (_, i) => i + 1) : []
    );
  }, [disc?.discid, disc?.trackCount]);

  useEffect(() => {
    const un = onIdentifyProgress((p) => {
      setIdentify(p);
      if (p.done && !p.ok) setIdentifyHint(p.detail || p.message);
      if (p.done && p.ok) setIdentifyHint("");
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (!identify?.done) return;
    const t = setTimeout(
      () => setIdentify(null),
      identify.ok ? 1400 : 5200
    );
    return () => clearTimeout(t);
  }, [identify]);

  const applyRelease = useCallback(
    async (r: Release) => {
      setRealRelease(r);
      setShowSearch(false);
      void loadCover(r); // 封面后台加载, 出现即渲染
    },
    [loadCover]
  );

  const clearDiscState = useCallback(() => {
    setDisc(null);
    setRealRelease(null);
    setCover(null);
    setPlaying(null);
    setProgress(null);
    setLrcLines([]);
    setView("home");
  }, []);

  const identifyDisc = useCallback(async () => {
    if (identifyingRef.current) return;
    identifyingRef.current = true;
    if (!playingRef.current) setView("home");
    setIdentify({
      stage: "toc",
      message: "读取光盘目录…",
      detail: null,
      done: false,
      ok: false,
    });
    setIdentifyHint("");
    setLoading(true);
    setRealRelease(null);
    setCover(null);
    setLrcLines([]);
    setShowSearch(false);
    setProgress(null);
    try {
      const d = await detectDisc();
      setDisc(d);
      setDriveState("disc");
      setLoading(false); // 检测完成立即显示界面, 元数据在后台加载
      try {
        const res = await resolveDisc(d.discid, d.device);
        if (res) {
          if ((res.release.media?.length ?? 0) > 1) {
            setMediumIdx(res.medium);
          }
          await applyRelease(res.release);
        }
      } catch (e) {
        const msg = String(e).slice(0, 160);
        setStatus(msg);
        setIdentify({
          stage: "notfound",
          message: "识别请求失败",
          detail: msg,
          done: true,
          ok: false,
        });
        setIdentifyHint(msg);
      }
    } catch (e) {
      const msg = String(e).slice(0, 160);
      setDisc(null);
      lastFailAt.current = Date.now();
      setDriveState((st) => (st === "disc" ? "empty" : st));
      setStatus(msg);
      setIdentify({
        stage: "notfound",
        message: "无法读取光盘",
        detail: msg,
        done: true,
        ok: false,
      });
      setIdentifyHint(msg);
    } finally {
      setLoading(false);
      identifyingRef.current = false;
    }
  }, [applyRelease]);

  const retryIdentify = useCallback(async () => {
    if (!discRef.current || retryingIdentify) return;
    const d = discRef.current;
    setRetryingIdentify(true);
    setIdentifyHint("");
    setIdentify({
      stage: "discid",
      message: "重新查询 MusicBrainz DiscID…",
      detail: null,
      done: false,
      ok: false,
    });
    try {
      const res = await resolveDisc(d.discid, d.device);
      if (res) {
        if ((res.release.media?.length ?? 0) > 1) setMediumIdx(res.medium);
        await applyRelease(res.release);
      }
    } catch (e) {
      const msg = String(e).slice(0, 160);
      setIdentifyHint(msg);
      setIdentify({
        stage: "notfound",
        message: "重新匹配失败",
        detail: msg,
        done: true,
        ok: false,
      });
    } finally {
      setRetryingIdentify(false);
    }
  }, [retryingIdentify, applyRelease]);

  useEffect(() => {
    void identifyDisc();
  }, [identifyDisc]);

  useEffect(() => {
    onPlayRef.current = onPlay;
  });

  // 检测: 纯 sysfs 零命令轮询(3s) + udev 事件加速; 弹出/插入自动处理
  const checkNow = useCallback(async () => {
    const st = await mediaState().catch(() => null);
    if (!st) return;
    // 托盘开着: 绝不发任何命令 (桥接固件收到命令会合拢托盘), 只清残留状态
    if (st.tray === "open") {
      if (discRef.current || playingRef.current) {
        void playerStop().catch(() => {});
        clearDiscState();
        setStatus("光盘已弹出 — 放入新光盘后自动识别");
      }
      setDriveState("empty");
      return;
    }
    // 托盘关闭: 用 size 判介质
    if (!discRef.current && st.size) {
      // 弹出待确认: 必须等内核确认 size 归零, 期间绝不自动识别
      // (否则 stale-size + 读 TOC = 托盘被合拢)
      if (!identifyingRef.current && Date.now() - lastFailAt.current > 10000) {
        void identifyDisc();
      }
    } else if (discRef.current && !st.size) {
      void playerStop().catch(() => {});
      clearDiscState();
      setDriveState("empty");
      setStatus("光盘已弹出 — 放入新光盘后自动识别");
    } else if (!discRef.current && !st.size) {
      // 空闲且内核确认无介质: 弹出被确认, 解除待确认锁
    }
  }, [identifyDisc, clearDiscState]);

  useEffect(() => {
    const iv = setInterval(() => void checkNow(), 3000);
    const un = onDriveMedia(() => void checkNow());
    return () => {
      clearInterval(iv);
      un.then((f) => f());
    };
  }, [checkNow]);

  // 曲目自然切换 (chapter 边界): 只更新 UI/歌词, 不重启音频 (真无缝)
  useEffect(() => {
    const tno = progress?.trackNo ?? 0;
    if (!tno) return;
    const cur = playingRef.current;
    if (cur && tno !== cur.no) {
      // 刚点播/切歌时播放器可能先停在碟首再 seek, 忽略这段时间的错位
      if (Date.now() - playStartedAt.current < 6000) return;
      const q = queueRef.current;
      const qi = q.indexOf(cur.no);
      const expected = qi >= 0 && qi + 1 < q.length ? q[qi + 1] : null;
      // 队列顺序与光盘物理顺序不一致时, 在曲目边界切到队列的下一首
      if (!shuffleRef.current && repeatRef.current !== "one") {
        if (expected !== null && tno !== expected) {
          void onPlayRef.current(expected);
          return;
        }
        if (expected === null) {
          if (repeatRef.current === "all" && q.length > 0) {
            void onPlayRef.current(q[0]);
          } else {
            void playerStop().catch(() => {});
            setPlaying(null);
            setProgress(null);
            setStatus("播放队列已结束");
          }
          return;
        }
      }
      setPlaying({ no: tno, title: trackTitle(tno) });
      void loadLyrics(tno);
      if (repeatRef.current === "one") {
        void playerSeek(progress?.start ?? 0).catch(() => {});
        void playerPause(false).catch(() => {});
      } else if (shuffleRef.current) {
        jumpToRandom();
      }
    }
  }, [progress?.trackNo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const un1 = onProgress(setProgress);
    const un2 = onEnded(() => {
      // 整碟播完 (单曲不会触发; 曲目切换是 chapter 边界, 由下方 trackNo effect 处理)
      if (repeatRef.current !== "off" && discRef.current) {
        void onPlayRef.current(queueRef.current[0] ?? 1); // 循环全部: 队列开头
      } else {
        setPlaying(null);
        setProgress(null);
      }
    });
    return () => {
      un1.then((f) => f());
      un2.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPlayRef = useRef<(no: number) => Promise<void>>(async () => {});
  const lyricReq = useRef(0);
  const lyricSourceRef = useRef<LyricSource>(lyricSourceMode);
  useEffect(() => {
    lyricSourceRef.current = lyricSourceMode;
  }, [lyricSourceMode]);

  const trackTitle = (no: number) =>
    release?.media?.[0]?.tracks?.[no - 1]?.title ?? `曲目 ${no}`;

  const loadLyrics = async (
    no: number,
    force = false,
    source: LyricSource = lyricSourceRef.current
  ) => {
    if (!autoLyricsRef.current) {
      setLrcLines([]);
      setLrcSource("");
      return;
    }
    // 切歌先清空 + 请求编号 (过期结果丢弃)
    const reqId = ++lyricReq.current;
    setLrcLines([]);
    setLrcSource("正在搜索歌词源…");
    const finish = (lines: LrcLine[], source: string) => {
      if (lyricReq.current !== reqId) return;
      setLrcLines(lines);
      setLrcSource(source);
    };
    const mt = release?.media?.[0]?.tracks?.[no - 1];
    if (!mt) {
      finish([], "无歌词");
      return;
    }
    // 手动查找并保存过的歌词: 自动模式下直接命中, 不再联网
    if (source === "auto") {
      const saved = readManualLyrics()[lyricCacheKey(mt.title, artists(release), mt.length)];
      if (saved?.lrc?.trim()) {
        finish(parseLrc(saved.lrc, saved.tlyric), saved.source || "手动歌词");
        return;
      }
    }
    // 多源歌词并行搜索: 12 秒后端截止，前端留一点余量
    const timer = setTimeout(() => finish([], "未找到歌词"), 14000);
    try {
      const lr: LyricsResult = await fetchLyrics(
        mt.title,
        artists(release),
        mt.length,
        mt.recording?.id ?? null,
        force,
        source
      );
      clearTimeout(timer);
      if (!lr.lrc.trim()) {
        finish([], lr.source || "无歌词");
      } else {
        finish(parseLrc(lr.lrc, lr.tlyric), lr.source);
      }
      if (lr.cover) setCover((c) => c ?? lr.cover);
    } catch {
      clearTimeout(timer);
      finish([], "未找到歌词");
    }
  };

  const pickLyricSource = (source: LyricSource) => {
    setLyricSourceMode(source);
    lyricSourceRef.current = source;
    localStorage.setItem("sd-lyric-source", source);
    const cur = playingRef.current;
    if (cur) void loadLyrics(cur.no, true, source);
  };

  const manualLyricsSearch = async (title: string, artist: string) => {
    const cur = playingRef.current;
    if (!cur) return false;
    const mt = release?.media?.[0]?.tracks?.[cur.no - 1];
    if (!mt) return false;
    // 取消仍在途的自动搜索, 避免它稍后覆盖手动结果
    const reqId = ++lyricReq.current;
    try {
      const lr = await fetchLyrics(
        title,
        artist,
        mt.length,
        mt.recording?.id ?? null,
        true,
        "auto"
      );
      if (lyricReq.current !== reqId) return false;
      if (!lr.lrc.trim()) return false;
      const saved: LyricsResult = {
        ...lr,
        source: `手动 · ${lr.source}`,
      };
      saveManualLyrics(
        lyricCacheKey(mt.title, artists(release), mt.length),
        saved
      );
      setLrcLines(parseLrc(saved.lrc, saved.tlyric));
      setLrcSource(saved.source);
      return true;
    } catch {
      return false;
    }
  };

  const jumpToRandom = () => {
    const d = discRef.current;
    const cur = playingRef.current;
    if (!d || !cur) return;
    let n = cur.no;
    while (n === cur.no) n = 1 + Math.floor(Math.random() * d.trackCount);
    void onPlayRef.current(n);
  };

  const onPlay = async (no: number) => {
    if (!disc) return;
    playStartedAt.current = Date.now();
    // 歌名一律现取 (上一首/下一首/自动连播不会错位)
    const title = trackTitle(no);
    setPlaying({ no, title });
    setProgress(null);
    setStatus("");
    try {
      await playTrack(disc.device, no);
      await playerVolume(volumeRef.current).catch(() => {});
    } catch (e) {
      setStatus(`播放失败: ${String(e).slice(0, 120)}`);
      setPlaying(null);
      return;
    }
    void loadLyrics(no);
  };

  /** 首页点曲目: 封面通过 View Transition 滑到右侧，页面切到正在播放 */
  const playFromHome = (no: number) => {
    withViewTransition(() => {
      void onPlay(no);
      setView("playing");
    });
  };

  const onTogglePause = async () => {
    if (!playing) {
      // 启动/未播放: 直接开始播第 1 首
      void onPlay(1);
      return;
    }
    if (!progress) return;
    try {
      await playerPause(!progress.paused);
    } catch {
      /* ignore */
    }
  };

  const onSeek = async (secs: number) => {
    try {
      await playerSeek(secs);
    } catch {
      /* ignore */
    }
  };

  const onPrev = () => {
    const cur = playingRef.current;
    if (!cur) return;
    const q = queueRef.current;
    const i = q.indexOf(cur.no);
    if (i > 0) void onPlay(q[i - 1]);
  };

  const onNext = () => {
    const cur = playingRef.current;
    const d = discRef.current;
    if (!cur) return;
    if (shuffleRef.current && d && d.trackCount > 1) {
      let n = cur.no;
      while (n === cur.no) n = 1 + Math.floor(Math.random() * d.trackCount);
      void onPlay(n);
      return;
    }
    const q = queueRef.current;
    const i = q.indexOf(cur.no);
    if (i >= 0 && i + 1 < q.length) {
      void onPlay(q[i + 1]);
    } else if (repeatRef.current !== "off" && q.length > 0) {
      void onPlay(q[0]);
    }
  };

  const reorderQueue = (from: number, to: number) => {
    setQueue((q) => {
      if (from === to || from < 0 || to < 0 || from >= q.length || to >= q.length)
        return q;
      const next = [...q];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  /** 右键曲目: 插到当前播放的下一首 */
  const playNextInQueue = (no: number) => {
    setQueue((q) => {
      if (playingRef.current?.no === no) return q;
      const rest = q.filter((n) => n !== no);
      const ci = playingRef.current ? rest.indexOf(playingRef.current.no) : -1;
      if (ci >= 0) rest.splice(ci + 1, 0, no);
      else rest.unshift(no);
      return rest;
    });
    setStatus(`已加入下一首播放：${trackTitle(no)}`);
  };

  const onStop = async () => {
    try {
      await playerStop();
    } catch {
      /* ignore */
    }
    setPlaying(null);
    setProgress(null);
  };

  const onVolume = (v: number) => {
    setVolume(v);
    void playerVolume(v).catch(() => {});
  };

  const favKey = playing ? `${disc?.discid ?? ""}:${playing.no}` : "";
  const isFav = favs.has(favKey);
  const toggleFav = () => {
    if (!favKey) return;
    const next = new Set(favs);
    if (next.has(favKey)) next.delete(favKey);
    else next.add(favKey);
    setFavs(next);
    localStorage.setItem("sounddisc-favs", JSON.stringify([...next]));
  };

  const onSearch = async (query: string) => await searchReleases(query);
  const onPick = async (r: Release) => {
    if (disc) {
      const full = await confirmReleaseForDisc(disc.discid, r.id);
      await applyRelease(full);
    }
  };
  const onMbSubmit = () => {
    if (disc) void openMbSubmit(disc.tocString, release?.id ?? null);
  };

  const curTitle =
    playing?.title ?? release?.title ?? (disc ? "点击曲目开始播放" : "");
  const curArtist = artists(release);

  return (
    <div className="app">
      <div
        className="app-body"
        style={{ ["--amb" as string]: cover ? `url(${cover})` : "none" }}
      >
        <div
          className="amb-blob"
          style={{ backgroundImage: cover ? `url(${cover})` : "none" }}
        />
        <div className="amb-sweep" />
        <NavSidebar
          view={view}
          device={disc?.device ?? null}
          disc={disc}
          discTitle={release?.title ?? null}
          discYear={release?.date?.slice(0, 4) ?? null}
          discArtist={curArtist || null}
          nowTitle={playing?.title ?? null}
          nowArtist={playing ? curArtist : null}
          driveState={driveState}
          hasPlaying={!!playing}
          onNav={(v) => setView(v as View)}
          onOpenPlaying={() => setView("playing")}
        />

        <main className="center">
          <div className={"view-fade" + (view === "playing" ? " playing-fade" : "")} key={`${view}-${disc?.discid ?? "none"}`}>
          {loading && <div className="center-hint">正在连接光驱…</div>}

          {!loading && !disc && (
            <div className="empty-state">
              <div className="empty-cd" />
              <div className="empty-title">插入光盘</div>
              <div className="empty-sub">{status || "检测失败, 检查 USB 碟机后重试"}</div>
              <button className="btn" onClick={() => void identifyDisc()}>
                开始检测
              </button>
            </div>
          )}

          {!loading && disc && view === "home" && (
            <HomeView
              cover={cover}
              disc={disc}
              release={release}
              playing={playing}
              onPlayTrack={playFromHome}
              onSearch={() => setShowSearch(true)}
            />
          )}

          {!loading && disc && view === "playing" && (
            <div className="playing-wrap">
              <div className="playing-head-row">
                <div className="stage-toolbar">
                  <button className="st-btn" onClick={onStop} disabled={!playing} title="停止">
                    ⏹
                  </button>
                  <button
                    className={"st-btn" + (lyricsOn ? " on" : "")}
                    onClick={() => setLyricsOn((v) => !v)}
                    disabled={lyricsOnly}
                    title={lyricsOnly ? "歌词模式中 · 点击空白处或 ✕ 返回" : "歌词开关"}
                  >
                    ♪
                  </button>
                  <div className="st-vol">
                    <span>🔊</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={volume}
                      onChange={(e) => onVolume(Number(e.target.value))}
                      className="vol-slider"
                    />
                  </div>
                  <button
                    className={"st-btn" + (repeat !== "off" ? " on" : "")}
                    onClick={() =>
                      setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"))
                    }
                    title={"循环: " + (repeat === "off" ? "关" : repeat === "all" ? "列表" : "单曲")}
                    aria-label="循环模式"
                  >
                    ↻
                  </button>
                  <button
                    className={"st-btn" + (panelVisible ? " on" : "")}
                    onClick={() => setPanelVisible((v) => !v)}
                    title="播放队列"
                  >
                    ☰
                  </button>
                </div>
              </div>
              <PlayerStage
                cover={cover}
                title={curTitle}
                artist={curArtist}
                album={release?.title ?? null}
                playing={!!playing}
                progress={progress}
                lyrics={lrcLines}
                lyricsSource={lrcSource}
                lyricsOnly={lyricsOnly}
                onPrev={onPrev}
                onTogglePause={onTogglePause}
                onNext={onNext}
                onSeek={(s) => void onSeek(s)}
                canPlay={!!disc}
                onCoverClick={() => {
                  if (lrcLines.length > 0) setLyricsOnly((v) => !v);
                }}
                onExitOnly={() => setLyricsOnly(false)}
                lyricsOn={lyricsOn}
                onRetryLyrics={() => void loadLyrics(playing?.no ?? 1, true)}
                shuffle={shuffle}
                onToggleShuffle={() => setShuffle((v) => !v)}
                lyricSourceMode={lyricSourceMode}
                onPickLyricSource={pickLyricSource}
                onManualLyrics={() => setManualLyricsOpen(true)}
                panelVisible={panelVisible}
                onTogglePanel={() => setPanelVisible((v) => !v)}
              />
            </div>
          )}
          {!loading && disc && view === "info" && (
            <InfoView
              disc={disc}
              release={release}
              cover={cover}
              onSearch={() => setShowSearch(true)}
              onMbSubmit={onMbSubmit}
              onRetryIdentify={() => void retryIdentify()}
              retrying={retryingIdentify}
              hint={identifyHint}
              onMbOpen={() => {
                if (release?.id) void openMbRelease(release.id);
              }}
            />
          )}
          {!loading && view === "library" && (
            <LibraryView onOpenRelease={(id) => void openMbRelease(id)} />
          )}
          {!loading && disc && view === "settings" && (
            <SettingsView
              disc={disc}
              release={release}
              settings={settings}
              upSettings={upSettings}
              onRescan={() => void identifyDisc()}
              onMbSubmit={onMbSubmit}
              onUploadCover={(dataUrl) => {
                if (!release?.id) return;
                void saveCover(release.id, dataUrl)
                  .then((d) => {
                    if (d) {
                      setCover(d);
                      setStatus("封面已更新");
                    }
                  })
                  .catch((e) => setStatus(`封面保存失败: ${String(e).slice(0, 80)}`));
              }}
            />
          )}

          {!loading && disc && showSearch && (
            <SearchPanel
              onSearch={onSearch}
              onPick={onPick}
              onClose={() => setShowSearch(false)}
            />
          )}
          </div>
        </main>

        {identify && <IdentifyProgress status={identify} />}

        {manualLyricsOpen && (
          <ManualLyricsModal
            initialTitle={playing?.title ?? ""}
            initialArtist={curArtist}
            onSearch={manualLyricsSearch}
            onClose={() => setManualLyricsOpen(false)}
          />
        )}

        {disc && view === "playing" && panelVisible && (
          <TrackPanel
            disc={disc}
            release={release}
            realMediaCount={realRelease?.media?.length ?? 0}
            mediumIdx={mediumIdx}
            onPickMedium={pickMedium}
            playing={playing}
            queue={queue}
            onPlay={onPlay}
            onReorder={reorderQueue}
            onPlayNext={playNextInQueue}
          />
        )}
      </div>

    </div>
  );
}
