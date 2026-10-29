import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  fetchAlbumExtra,
  fetchLyrics,
  libraryCover,
  type AlbumExtra,
  type LibraryEntry,
  type StreamService,
  type Track,
} from "../api";
import { parseLrc, type LrcLine } from "../lrc";
import { fmtC } from "../util";

export interface CoverRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function artistOf(e: LibraryEntry): string {
  return e.release.artistCredit?.map((a) => a.name).join(" / ") || "未知艺人";
}

export function LibraryDetail({
  members,
  labels,
  initialIndex,
  origin,
  initialCover,
  onClose,
  onStream,
  onStreamTrack,
  onOpenRelease,
  mode = "library",
  onPlayTrack,
}: {
  members: LibraryEntry[];
  labels: string[];
  initialIndex: number;
  origin?: CoverRect;
  initialCover?: string | null;
  onClose: () => void;
  onStream: (service: StreamService) => void;
  onStreamTrack: (title: string, service: StreamService) => void;
  onOpenRelease: (id: string) => void;
  mode?: "library" | "playback";
  onPlayTrack?: (trackNo: number) => void;
}) {
  const [index, setIndex] = useState(
    Math.max(0, Math.min(initialIndex, members.length - 1))
  );
  const [cover, setCover] = useState<string | null>(initialCover ?? null);
  const [coverLoading, setCoverLoading] = useState(!initialCover);
  const [extra, setExtra] = useState<AlbumExtra | null>(null);
  const [extraLoading, setExtraLoading] = useState(true);
  const [track, setTrack] = useState<Track | null>(null);
  const [lyrics, setLyrics] = useState<LrcLine[]>([]);
  const [lyricLoading, setLyricLoading] = useState(false);
  const [lyricSource, setLyricSource] = useState("");
  const [closing, setClosing] = useState(false);
  const coverRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);

  const playMode = mode === "playback";
  const entry = members[index] ?? members[0];
  const release = entry.release;
  const artist = artistOf(entry);
  const year = release.date?.slice(0, 4) ?? null;
  const medium = release.media?.[entry.medium ?? 0] ?? release.media?.[0];
  const tracks = medium?.tracks ?? [];

  // 大封面
  useEffect(() => {
    let alive = true;
    if (initialCover) {
      setCover(initialCover);
      setCoverLoading(false);
      return;
    }
    setCoverLoading(true);
    void libraryCover(
      release.id ?? "",
      release.title ?? "",
      release.artistCredit?.map((a) => a.name).join(" / ") ?? ""
    )
      .then((c) => {
        if (!alive) return;
        setCover(c);
        setCoverLoading(false);
      })
      .catch(() => alive && setCoverLoading(false));
    return () => {
      alive = false;
    };
  }, [release.id, release.title, release.artistCredit, initialCover]);

  // 专辑 / 歌手介绍
  useEffect(() => {
    let alive = true;
    setExtraLoading(true);
    setExtra(null);
    fetchAlbumExtra(
      release.title ?? "",
      release.artistCredit?.map((a) => a.name).join(" / ") ?? "",
      year,
      tracks.length || null,
      entry.discId
    )
      .then((x) => alive && setExtra(x))
      .catch(() => alive && setExtra(null))
      .finally(() => alive && setExtraLoading(false));
    return () => {
      alive = false;
    };
  }, [release.id, release.title, release.artistCredit, year, tracks.length]);

  // 点击曲目后加载歌词
  useEffect(() => {
    if (!track) {
      setLyrics([]);
      setLyricSource("");
      return;
    }
    let alive = true;
    setLyricLoading(true);
    setLyrics([]);
    setLyricSource("");
    fetchLyrics(
      track.title,
      track.artistCredit?.map((a) => a.name).join(" / ") || artist,
      track.length,
      track.recording?.id ?? null,
      false,
      "auto"
    )
      .then((lr) => {
        if (!alive) return;
        setLyrics(parseLrc(lr.lrc, lr.tlyric));
        setLyricSource(lr.source || "");
      })
      .catch(() => alive && setLyrics([]))
      .finally(() => alive && setLyricLoading(false));
    return () => {
      alive = false;
    };
  }, [track, artist]);

  // 从点击的小封面展开到大封面，带轻微 3D 翻转
  useLayoutEffect(() => {
    const el = coverRef.current;
    if (!el || !origin) return;
    const target = el.getBoundingClientRect();
    if (!target.width || !target.height) return;
    const ox = origin.x + origin.w / 2;
    const oy = origin.y + origin.h / 2;
    const tx = target.left + target.width / 2;
    const ty = target.top + target.height / 2;
    const dx = ox - tx;
    const dy = oy - ty;
    const sx = origin.w / target.width;
    const sy = origin.h / target.height;
    const anim = el.animate(
      [
        {
          transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy}) perspective(1300px) rotateY(${playMode ? -112 : -68}deg)`,
          opacity: 0.35,
          filter: "brightness(.65)",
        },
        {
          transform: "translate(0,0) scale(1,1) perspective(1300px) rotateY(0deg)",
          opacity: 1,
          filter: "none",
        },
      ],
      { duration: playMode ? 640 : 560, easing: "cubic-bezier(.2,.85,.2,1)" }
    );
    return () => anim.cancel();
  }, [origin, playMode]);

  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    const el = coverRef.current;
    if (el && origin) {
      const target = el.getBoundingClientRect();
      const ox = origin.x + origin.w / 2;
      const oy = origin.y + origin.h / 2;
      const tx = target.left + target.width / 2;
      const ty = target.top + target.height / 2;
      const dx = ox - tx;
      const dy = oy - ty;
      const sx = origin.w / Math.max(1, target.width);
      const sy = origin.h / Math.max(1, target.height);
      el.animate(
        [
          { transform: "translate(0,0) scale(1,1) rotateY(0deg)", opacity: 1 },
          {
            transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy}) perspective(1300px) rotateY(62deg)`,
            opacity: 0,
          },
        ],
        { duration: 260, easing: "cubic-bezier(.4,0,.8,.4)", fill: "forwards" }
      );
      window.setTimeout(onClose, 250);
    } else {
      window.setTimeout(onClose, 160);
    }
  };

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }); // closingRef guards repeated close

  return createPortal(
    <div
      className={"lib-detail-overlay" + (closing ? " closing" : "")}
      style={{
        ["--detail-amb" as string]: cover ? `url(${cover})` : "none",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className={
          "lib-detail" +
          (track ? " track-mode" : "") +
          (playMode ? " playback-mode" : "")
        }
        role="dialog"
        aria-modal="true"
        aria-label={release.title ?? "专辑详情"}
      >
        <div className="lib-detail-amb" aria-hidden="true">
          <div className="lib-detail-amb-main" />
          <div className="lib-detail-amb-blob" />
          <div className="lib-detail-amb-sweep" />
        </div>
        <div className="lib-detail-left">
          {track ? (
            <div className="lib-detail-track-head">
              <button
                className="lib-detail-back"
                onClick={() => setTrack(null)}
                title="返回专辑"
              >
                ← 专辑
              </button>
              <div className="lib-detail-track-album">{release.title}</div>
              <div className="lib-detail-track-now">{track.title}</div>
            </div>
          ) : null}
          <div className="lib-detail-cover-stage">
            <div className="lib-detail-cover" ref={coverRef}>
              {cover ? (
                <img src={cover} alt="" className="lib-detail-img" />
              ) : (
                <span className="lib-detail-cover-empty">
                  {coverLoading ? "" : "♫"}
                </span>
              )}
              {coverLoading && <span className="lib-detail-cover-shimmer" />}
            </div>
          </div>

          {!track ? (
            <>
              <div className="lib-detail-title">{release.title ?? "未知专辑"}</div>
              <div className="lib-detail-artist">{artist}</div>
              <div className="lib-detail-meta">
                {[release.date, release.country, `${tracks.length} 首`]
                  .filter(Boolean)
                  .join(" · ")}
              </div>

              {!playMode && (
                <div className="lib-detail-actions">
                  <button
                    className="btn lib-detail-play"
                    onClick={() => onStream("netease")}
                  >
                    ▶ 网易云音乐
                  </button>
                  <button className="btn btn-ghost" onClick={() => onStream("qq")}>
                    QQ 音乐
                  </button>
                </div>
              )}
              {!playMode && release.id ? (
                <button
                  className="lib-detail-mb"
                  onClick={() => onOpenRelease(release.id!)}
                >
                  在 MusicBrainz 查看 ↗
                </button>
              ) : null}
            </>
          ) : (
            <div className="lib-detail-track-artist">{artist}</div>
          )}
        </div>

        <div
          className={
            "lib-detail-right" + (track ? " track-mode-right" : "")
          }
        >
          {members.length > 1 ? (
            <div className="lib-detail-tabs">
              {members.map((m, i) => (
                <button
                  key={m.discId}
                  className={"lib-detail-tab" + (i === index ? " on" : "")}
                  onClick={() => {
                    setIndex(i);
                    setTrack(null);
                  }}
                >
                  {labels[i] ?? String(i + 1)} 碟
                </button>
              ))}
            </div>
          ) : null}

          {track ? (
            <>
            <div className="lib-detail-track-view">
              <div className="lib-detail-eyebrow">
                {release.title}
                {release.date ? ` · ${release.date.slice(0, 4)}` : ""}
              </div>
              <div className="lib-detail-track-heading">{track.title}</div>
              <div className="lib-detail-track-sub">
                {track.artistCredit?.length
                  ? track.artistCredit.map((a) => a.name).join(" / ")
                  : artist}
                {track.length ? ` · ${fmtC(track.length / 1000)}` : ""}
              </div>

              <section className="lib-detail-section track-lyrics-section">
                <div className="lib-detail-head">
                  <span>歌词</span>
                  {lyricSource ? (
                    <span className="lib-detail-src">{lyricSource}</span>
                  ) : null}
                </div>
                {lyricLoading ? (
                  <div className="lib-detail-skeleton">
                    <span /><span /><span /><span /><span />
                  </div>
                ) : lyrics.length > 0 ? (
                  <div className="lib-detail-lyrics">
                    {lyrics.map((line, i) => (
                      <div
                        className="lib-detail-lyric"
                        key={`${i}-${line.t}-${line.text.slice(0, 12)}`}
                      >
                        <div>{line.text || "♪"}</div>
                        {line.tr ? (
                          <div className="lib-detail-lyric-tr">{line.tr}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="lib-detail-empty">暂无歌词</p>
                )}
              </section>

            </div>
            <div className="lib-detail-track-actions">
              <button
                className="btn lib-detail-play"
                onClick={() => onStreamTrack(track.title, "netease")}
              >
                ▶ 网易云音乐
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => onStreamTrack(track.title, "qq")}
              >
                QQ 音乐
              </button>
            </div>
            </>
          ) : (
            <>
          <section className="lib-detail-section">
            <div className="lib-detail-head">
              <span>专辑介绍</span>
              {extra?.albumDescription && extra?.albumSource ? (
                <span className="lib-detail-src">{extra.albumSource}</span>
              ) : null}
            </div>
            {extraLoading ? (
              <div className="lib-detail-skeleton">
                <span /><span /><span />
              </div>
            ) : extra?.albumDescription ? (
              <p className="lib-detail-desc">{extra.albumDescription}</p>
            ) : (
              <p className="lib-detail-empty">暂无专辑介绍</p>
            )}
          </section>

          <section className="lib-detail-section">
            <div className="lib-detail-head">
              <span>歌手信息</span>
              {extra?.artistSource &&
              (extra.artistBio || extra.artistAvatar) ? (
                <span className="lib-detail-src">{extra.artistSource}</span>
              ) : null}
            </div>
            <div className="lib-detail-artist-head">
              {extra?.artistAvatar ? (
                <img
                  className="lib-detail-avatar"
                  src={extra.artistAvatar}
                  alt=""
                />
              ) : (
                <div className="lib-detail-avatar empty">
                  {artist.slice(0, 1)}
                </div>
              )}
              <div>
                <div className="lib-detail-artist-name">{artist}</div>
                <div className="lib-detail-artist-kicker">ARTIST</div>
              </div>
            </div>
            {extraLoading ? (
              <div className="lib-detail-skeleton">
                <span /><span />
              </div>
            ) : extra?.artistBio ? (
              <p className="lib-detail-desc artist-bio">{extra.artistBio}</p>
            ) : (
              <p className="lib-detail-empty">暂无歌手简介</p>
            )}
          </section>

          <section className="lib-detail-section tracks-section">
            <div className="lib-detail-head">
              <span>曲目</span>
              <span className="lib-detail-src">{tracks.length} 首</span>
            </div>
            <ol className="lib-detail-tracks">
              {tracks.map((t, i) => (
                <li
                  key={`${i}-${t.title}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (playMode) onPlayTrack?.(i + 1);
                    else setTrack(t);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (playMode) onPlayTrack?.(i + 1);
                      else setTrack(t);
                    }
                  }}
                  title={playMode ? "点击播放" : "查看单曲与歌词"}
                >
                  <span className="lib-detail-track-no">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="lib-detail-track-title">{t.title}</span>
                  <span className="lib-detail-track-len">
                    {t.length ? fmtC(t.length / 1000) : "—"}
                  </span>
                </li>
              ))}
            </ol>
          </section>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
