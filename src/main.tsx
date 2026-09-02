import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// 屏蔽 WebKitGTK 原生右键菜单 (后退/前进/检查元素等)
document.addEventListener("contextmenu", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
