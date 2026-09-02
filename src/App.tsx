import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  confirmReleaseForDisc,
  detectDisc,
  driveScan,
  fetchCover,
  fetchLyrics,
  mediaState,
  onDriveMedia,
  onEnded,
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
  type LyricsResult,
  type Progress,
  type Release,
  type TocInfo,
} from "./api";
import { parseLrc, type LrcLine } from "./lrc";
import { NavSidebar } from "./components/NavSidebar";
import { PlayerStage } from "./components/PlayerStage";
import { TrackPanel } from "./components/TrackPanel";
import { InfoView, QueueView, SettingsView } from "./components/Views";
import { LibraryView } from "./components/LibraryView";
import { SearchPanel } from "./components/SearchPanel";

type View = "playing" | "tracks" | "info" | "queue" | "library" | "settings";

function loadFavs(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem("sounddisc-favs") ?? "[]"));
  } catch {
    return new Set();
  }
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("playing");
  const [disc, setDisc] = useState<TocInfo | null>(null);
  const [realRelease, setRealRelease] = useState<Release | null>(null);
  const [mediumIdx, setMediumIdx] = useState<number | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [lyricsOn, setLyricsOn] = useState(true);
  const [lyricsOnly, setLyricsOnly] = useState(false);
  const [lrcLines, setLrcLines] = useState<LrcLine[]>([]);
  const [lrcSource, setLrcSource] = useState("");
  const [playing, setPlaying] = useState<{ no: number; title: string } | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [status, setStatus] = useState("");
  const [volume, setVolume] = useState(80);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<"off" | "all" | "one">("off");
  const [panelVisible, setPanelVisible] = useState(true);
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
  const volumeRef = useRef(volume);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  const artists = (r: Release | null) =>
    r?.artistCredit?.map((a) => a.name).join(" / ") || "";

  const loadCover = useCallback(async (r: Release) => {
    try {
      const title =
        r.media?.[0]?.tracks?.[0]?.title ?? r.title;
      const artist = r.artistCredit?.map((a) => a.name).join(" / ") ?? "";
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
  }, []);

  const identifyDisc = useCallback(async () => {
    if (identifyingRef.current) return;
    identifyingRef.current = true;
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
        const res = await resolveDisc(d.discid);
        if (res) {
          if ((res.release.media?.length ?? 0) > 1) {
            setMediumIdx(res.medium);
          }
          await applyRelease(res.release);
        }
      } catch (e) {
        setStatus(String(e).slice(0, 80));
      }
    } catch (e) {
      setDisc(null);
      lastFailAt.current = Date.now();
      setDriveState((st) => (st === "disc" ? "empty" : st));
      setStatus(String(e).slice(0, 120));
    } finally {
      setLoading(false);
      identifyingRef.current = false;
    }
  }, [applyRelease]);

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
        void onPlayRef.current(1); // 循环全部: 从头再来
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

  const trackTitle = (no: number) =>
    release?.media?.[0]?.tracks?.[no - 1]?.title ?? `曲目 ${no}`;

  const loadLyrics = async (no: number, force = false) => {
    if (!autoLyricsRef.current) {
      setLrcLines([]);
      setLrcSource("");
      return;
    }
    // 切歌先清空 + 请求编号 (过期结果丢弃)
    const reqId = ++lyricReq.current;
    setLrcLines([]);
    setLrcSource("歌词更新中…");
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
    // 7 秒硬超时: 请求再慢也不能卡住界面文案
    const timer = setTimeout(() => finish([], "未找到歌词"), 7000);
    try {
      const lr: LyricsResult = await fetchLyrics(
        mt.title,
        artists(release),
        mt.length,
        mt.recording?.id ?? null,
        force
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
    if (cur && cur.no > 1) void onPlay(cur.no - 1);
  };

  const onNext = () => {
    const cur = playingRef.current;
    const d = discRef.current;
    if (shuffleRef.current && cur && d && d.trackCount > 1) {
      let n = cur.no;
      while (n === cur.no) n = 1 + Math.floor(Math.random() * d.trackCount);
      void onPlay(n);
      return;
    }
    if (cur && d && cur.no < d.trackCount) void onPlay(cur.no + 1);
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
          driveState={driveState}
          hasPlaying={!!playing}
          onNav={(v) => setView(v as View)}
          onOpenPlaying={() => setView("playing")}
        />

        <main className="center">
          <div className="view-fade" key={`${view}-${disc?.discid ?? "none"}`}>
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

          {!loading && disc && view === "playing" && (
            <div className="playing-wrap">
              <div className="playing-head-row">
                <div className="page-head playing-head">
                  <div className="page-title2">正在播放</div>
                  <div className="page-sub2">
                    当前播放CD · {release?.title ?? curTitle ?? "—"}
                  </div>
                </div>
                <div className="stage-toolbar">
                  <button className="st-btn" onClick={onStop} disabled={!playing} title="停止">
                    ⏹
                  </button>
                  <button
                    className={"st-btn" + (lyricsOn ? " on" : "")}
                    onClick={() => setLyricsOn((v) => !v)}
                    disabled={lyricsOnly}
                    title={lyricsOnly ? "歌词模式中 · 点击左侧或 ✕ 返回" : "歌词开关"}
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
                    className={"st-btn" + (panelVisible ? " on" : "")}
                    onClick={() => setPanelVisible((v) => !v)}
                    title="曲目面板"
                  >
                    ☰
                  </button>
                </div>
              </div>
              <PlayerStage
                cover={cover}
                title={curTitle}
                artist={curArtist}
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
                repeat={repeat}
                onToggleShuffle={() => setShuffle((v) => !v)}
                onCycleRepeat={() =>
                  setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"))
                }
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
              onMbOpen={() => {
                if (release?.id) void openMbRelease(release.id);
              }}
            />
          )}
          {!loading && disc && view === "queue" && (
            <QueueView disc={disc} release={release} cover={cover} playing={playing} onPlay={onPlay} />
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

          {!loading && disc && view === "info" && showSearch && (
            <SearchPanel onSearch={onSearch} onPick={onPick} />
          )}
          </div>
        </main>

        {disc && view === "playing" && panelVisible && (
          <TrackPanel
            disc={disc}
            release={release}
            realMediaCount={realRelease?.media?.length ?? 0}
            mediumIdx={mediumIdx}
            onPickMedium={pickMedium}
            playing={playing}
            onPlay={onPlay}
          />
        )}
      </div>

    </div>
  );
}
