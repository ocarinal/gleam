import { useEffect, useRef, useState } from "react";
import {
  libraryCover,
  libraryRemove,
  librarySetMedium,
  libraryUpdate,
  listLibrary,
  refreshCover,
  saveCover,
  type LibraryEntry,
  type Release,
} from "../api";

/** 右键菜单 */
function CtxMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: { label: string; danger?: boolean; on?: boolean; onClick: () => void }[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = () => onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={{ left: Math.min(x, window.innerWidth - 190), top: Math.min(y, window.innerHeight - 200) }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((it, i) => (
        <div
          key={i}
          className={"ctx-item" + (it.danger ? " danger" : "") + (it.on ? " checked" : "")}
          onClick={() => {
            onClose();
            it.onClick();
          }}
        >
          {it.label}
        </div>
      ))}
    </div>
  );
}

function LibCard({
  e,
  index,
  editing,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onOpenRelease,
  onContext,
}: {
  e: LibraryEntry;
  index: number;
  editing: boolean;
  onStartEdit: () => void;
  onSaveEdit: (title: string, artist: string) => void;
  onCancelEdit: () => void;
  onOpenRelease: (id: string) => void;
  onContext: (ev: React.MouseEvent) => void;
}) {
  const [cover, setCover] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [t, setT] = useState("");
  const [a, setA] = useState("");
  const r: Release | undefined = e.release;
  const artist = r?.artistCredit?.map((x) => x.name).join(" / ") || "";
  const first = r?.media?.[0]?.tracks?.[0]?.title ?? r?.title ?? "";

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void libraryCover(r?.id ?? "", first, artist)
      .then((c) => {
        if (alive) {
          setCover(c);
          setLoading(false);
        }
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [e.discId, r?.id, artist]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editing) {
      setT(r?.title ?? "");
      setA(artist);
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="lib-card"
      style={{ animationDelay: `${Math.min(index, 12) * 70}ms` }}
      onClick={() => !editing && r?.id && onOpenRelease(r.id)}
      onContextMenu={(ev) => {
        ev.preventDefault();
        onContext(ev);
      }}
      title="右键编辑 · 点击在 MusicBrainz 打开"
    >
      <div className="lib-cover-wrap">
        {cover && <div className="lib-disc-ghost" />}
        <div className={"lib-cover" + (!cover && loading ? " loading" : "")}>
          {cover ? (
            <img src={cover} alt="" />
          ) : (
            <span className="lib-cover-empty">♫</span>
          )}
        </div>
        <button className="lib-play-hint" tabIndex={-1}>
          ▶
        </button>
      </div>

      {editing ? (
        <div className="lib-edit">
          <input
            className="set-input"
            placeholder="专辑名"
            value={t}
            onChange={(ev) => setT(ev.target.value)}
          />
          <input
            className="set-input"
            placeholder="艺术家"
            value={a}
            onChange={(ev) => setA(ev.target.value)}
          />
          <div className="lib-edit-btns">
            <button className="btn" onClick={() => onSaveEdit(t, a)}>
              保存
            </button>
            <button className="btn btn-ghost" onClick={onCancelEdit}>
              取消
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="lib-title" title={r?.title}>
            {r?.title ?? "未知专辑"}
            {(r?.media?.length ?? 0) > 1 && (
              <span className="lib-badge">
                {e.medium !== undefined && e.medium !== null
                  ? ["双碟 · A 碟", "双碟 · B 碟"][Math.min(Number(e.medium ?? 0), 1)] ?? "双碟"
                  : "双碟"}
              </span>
            )}
          </div>
          <div className="lib-artist">{artist}</div>
          <div className="lib-meta">
            {[r?.date, r?.country].filter(Boolean).join(" · ")}
            {r?.disambiguation ? ` · ${r.disambiguation}` : ""}
          </div>
          <div className="lib-discid">{e.discId}</div>
        </>
      )}
    </div>
  );
}

export function LibraryView({
  onOpenRelease,
}: {
  onOpenRelease: (id: string) => void;
}) {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; discId: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileDiscRef = useRef<string>("");

  const refresh = () => {
    setRefreshKey((k) => k + 1);
    void listLibrary()
      .then(setEntries)
      .catch(() => setEntries([]));
  };

  useEffect(() => {
    void listLibrary()
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [refreshKey]);

  const menuEntry = entries?.find((e) => e.discId === menu?.discId);

  return (
    <div className="library">
      <div className="library-head">
        <div>
          <div className="library-title">本地光盘库</div>
          <div className="library-sub">{entries?.length ?? 0} 张收藏 · 右键卡片编辑</div>
        </div>
      </div>
      {entries?.length === 0 && (
        <div className="center-hint">插入光盘并识别成功后会自动收录</div>
      )}
      <div className="lib-grid">
        {entries?.map((e, i) => (
          <LibCard
            key={e.discId + refreshKey}
            e={e}
            index={i}
            editing={editingId === e.discId}
            onStartEdit={() => {
              setEditingId(e.discId);
            }}
            onSaveEdit={(tt, aa) => {
              const id = e.discId;
              void libraryUpdate(id, tt, aa).then(() => {
                setEditingId(null);
                refresh();
              });
            }}
            onCancelEdit={() => setEditingId(null)}
            onOpenRelease={onOpenRelease}
            onContext={(ev) =>
              setMenu({ x: ev.clientX, y: ev.clientY, discId: e.discId })
            }
          />
        ))}
      </div>

      {menu && menuEntry && (
        <CtxMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: "✏️ 编辑元数据",
              onClick: () => setEditingId(menu.discId),
            },
            {
              label: "设为 A 碟",
              on: (menuEntry.release.media?.length ?? 0) > 1 && (menuEntry.medium ?? 0) === 0,
              onClick: () => {
                void librarySetMedium(menu.discId, 0).then(refresh);
              },
            },
            {
              label: "设为 B 碟",
              on: (menuEntry.release.media?.length ?? 0) > 1 && (menuEntry.medium ?? 0) === 1,
              onClick: () => {
                void librarySetMedium(menu.discId, 1).then(refresh);
              },
            },
            {
              label: "⟳ 刷新封面",
              onClick: () => {
                const r = menuEntry.release;
                if (!r?.id) return;
                void refreshCover(
                  r.id,
                  r.releaseGroup?.id ?? null,
                  r.media?.[0]?.tracks?.[0]?.title ?? r.title ?? "",
                  r.artistCredit?.map((a) => a.name).join(" / ") ?? ""
                ).then(() => refresh());
              },
            },
            {
              label: "🖼 上传封面",
              onClick: () => {
                fileDiscRef.current = menuEntry.release?.id ?? "";
                fileRef.current?.click();
              },
            },
            {
              label: "⤴ 打开 MusicBrainz",
              onClick: () => {
                if (menuEntry.release?.id) onOpenRelease(menuEntry.release.id);
              },
            },
            {
              label: "🗑 从光盘库移除",
              danger: true,
              onClick: () => {
                void libraryRemove(menu.discId).then(refresh);
              },
            },
          ]}
        />
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(ev) => {
          const f = ev.target.files?.[0];
          if (!f) return;
          const rd = new FileReader();
          rd.onload = () => {
            const rid = fileDiscRef.current;
            if (!rid) return;
            void saveCover(rid, String(rd.result)).then(() => refresh());
          };
          rd.readAsDataURL(f);
          ev.target.value = "";
        }}
      />
    </div>
  );
}
