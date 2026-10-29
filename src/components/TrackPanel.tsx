import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmtC } from "../util";
import type { Release, TocInfo } from "../api";

/** 右侧播放队列: 拖动排序 / 右键下一首 */
export function TrackPanel({
  open,
  onClose,
  cover,
  disc,
  release,
  realMediaCount,
  mediumIdx,
  onPickMedium,
  playing,
  queue,
  onPlay,
  onReorder,
  onPlayNext,
}: {
  open: boolean;
  onClose: () => void;
  cover: string | null;
  disc: TocInfo;
  release: Release | null;
  realMediaCount: number;
  mediumIdx: number | null;
  onPickMedium: (i: number) => void;
  playing: { no: number; title: string } | null;
  queue: number[];
  onPlay: (no: number) => void;
  onReorder: (from: number, to: number) => void;
  onPlayNext: (no: number) => void;
}) {
  const metaTracks = release?.media?.[0]?.tracks ?? [];
  const artists = release?.artistCredit?.map((a) => a.name).join(" / ") || "";
  const count = disc.trackCount;
  const order =
    queue.length === count
      ? queue
      : Array.from({ length: count }, (_, i) => i + 1);

  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; no: number } | null>(
    null
  );
  const suppressClick = useRef(false);
  const rightClick = useRef(false);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !menu) onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [menu, onClose]);

  useEffect(() => {
    if (!menu) {
      rightClick.current = false;
      return;
    }
    const close = () => setMenu(null);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", key);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", key);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  return (
    <aside className={"track-panel" + (open ? " open" : "")}>
      <div className="panel-head">
        <div className="panel-head-copy">
          <div className="panel-title">播放队列</div>
        </div>
        <div className="panel-head-actions">
          <span className="panel-count">{count} 首</span>
          <button
            className="panel-close"
            onClick={onClose}
            title="关闭播放队列"
            aria-label="关闭播放队列"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      </div>

      {realMediaCount > 1 && (
        <div className="disc-chips panel-discs">
          {Array.from({ length: realMediaCount }, (_, i) => (
            <button
              key={i}
              className={"chip" + ((mediumIdx ?? 0) === i ? " on" : "")}
              onClick={() => onPickMedium(i)}
              title={`第 ${i + 1} 张碟片`}
            >
              {i === 0 ? "A 碟" : i === 1 ? "B 碟" : `${i + 1} 碟`}
            </button>
          ))}
        </div>
      )}

      <div className="panel-subhint">拖动排序 · 右键下一首播放</div>

      <div className="panel-tracklist">
        {order.map((no, idx) => {
          const t = disc.tracks[no - 1];
          const mt = metaTracks[no - 1];
          const title = mt?.title ?? `曲目 ${no}`;
          const isPlay = playing?.no === no;
          return (
            <div
              key={no}
              role="button"
              tabIndex={0}
              draggable
              className={
                "panel-track" +
                (isPlay ? " playing" : "") +
                (dragFrom === idx ? " dragging" : "") +
                (dragOver === idx && dragFrom !== idx ? " drag-over" : "")
              }
              onClick={() => {
                if (rightClick.current) {
                  rightClick.current = false;
                  return;
                }
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                onPlay(no);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onPlay(no);
                }
              }}
              onPointerDown={(e) => {
                if (e.button === 2) {
                  e.preventDefault();
                  e.stopPropagation();
                  rightClick.current = true;
                  setMenu({
                    x: Math.min(e.clientX, window.innerWidth - 190),
                    y: Math.min(e.clientY, window.innerHeight - 100),
                    no,
                  });
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                rightClick.current = true;
                setMenu({
                  x: Math.min(e.clientX, window.innerWidth - 190),
                  y: Math.min(e.clientY, window.innerHeight - 100),
                  no,
                });
              }}
              onDragStart={(e) => {
                suppressClick.current = true;
                setDragFrom(idx);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(idx));
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOver !== idx) setDragOver(idx);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from =
                  dragFrom !== null
                    ? dragFrom
                    : Number(e.dataTransfer.getData("text/plain"));
                if (Number.isFinite(from) && from !== idx) onReorder(from, idx);
                setDragFrom(null);
                setDragOver(null);
                window.setTimeout(() => {
                  suppressClick.current = false;
                }, 200);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
                window.setTimeout(() => {
                  suppressClick.current = false;
                }, 200);
              }}
              title="拖动排序 · 右键下一首播放"
            >
              <span className="pt-no">
                {isPlay ? (
                  <span className="pt-eq" aria-hidden="true">
                    <i /><i /><i />
                  </span>
                ) : (
                  String(idx + 1).padStart(2, "0")
                )}
              </span>
              <span className="pt-title">{title}</span>
              <span className="pt-dur">{fmtC(t ? t.durationMs / 1000 : 0)}</span>
            </div>
          );
        })}
      </div>
      {release && (
        <div className="panel-foot">
          {cover ? (
            <img className="panel-foot-cover" src={cover} alt="" />
          ) : (
            <div className="panel-foot-cover empty">♫</div>
          )}
          <div className="panel-foot-copy">
            <div className="panel-foot-album">{release.title}</div>
            <div className="panel-foot-artist">{artists || "未知艺人"}</div>
          </div>
        </div>
      )}

      {menu &&
        createPortal(
          <div
            className="track-menu"
            style={{ left: menu.x, top: menu.y }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              className="track-menu-item"
              onClick={() => {
                setMenu(null);
                onPlay(menu.no);
              }}
            >
              立即播放
            </button>
            <button
              className="track-menu-item accent"
              onClick={() => {
                setMenu(null);
                onPlayNext(menu.no);
              }}
            >
              下一首播放
            </button>
          </div>,
          document.body
        )}
    </aside>
  );
}
