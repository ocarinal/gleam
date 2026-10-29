import { createPortal } from "react-dom";
import type { IdentifyProgress as IdentifyProgressData } from "../api";

const STEPS = ["读取光盘", "DiscID", "MCN / ISRC", "匹配发行版"];

function stepIndex(stage: string): number {
  if (stage === "toc") return 0;
  if (stage === "discid") return 1;
  if (stage === "extra" || stage === "barcode" || stage === "isrc") return 2;
  if (stage === "release" || stage === "done" || stage === "notfound") return 3;
  return 0;
}

export function IdentifyProgress({ status }: { status: IdentifyProgressData }) {
  const idx = stepIndex(status.stage);
  const failed = status.done && !status.ok;
  return createPortal(
    <div
      className={
        "identify-hud" +
        (status.done ? " done" : "") +
        (failed ? " failed" : "")
      }
    >
      <div className="identify-top">
        <span className={"identify-spinner" + (status.done ? " settled" : "")}>
          {status.done ? (status.ok ? "✓" : "!") : ""}
        </span>
        <div className="identify-copy">
          <div className="identify-msg">{status.message}</div>
          {status.detail ? (
            <div className="identify-detail">{status.detail}</div>
          ) : null}
        </div>
      </div>
      <div className="identify-steps">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={
              "identify-step" +
              (i < idx || (status.done && status.ok && i <= idx) ? " done" : "") +
              (i === idx && !status.done ? " active" : "")
            }
          >
            <span className="identify-dot" />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}
