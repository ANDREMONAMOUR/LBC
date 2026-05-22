import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import AdminApp from "@/AdminApp";

// Route /admin/* to the AdminApp, everything else to the public SPA.
const isAdmin = typeof window !== "undefined" && window.location.pathname.startsWith("/admin");

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    {isAdmin ? <AdminApp /> : <App />}
  </React.StrictMode>,
);
