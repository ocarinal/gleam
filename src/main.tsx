import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installI18n } from "./i18n";
import "./styles.css";

// 屏蔽 WebKitGTK 原生右键菜单 (后退/前进/检查元素等)
document.addEventListener("contextmenu", (e) => e.preventDefault());

installI18n();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
