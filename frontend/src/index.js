import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import AdminApp from "@/AdminApp";

// Get the base path for GitHub Pages
const basePath = process.env.PUBLIC_URL || "";

// Route /admin/* to the AdminApp, everything else to the public SPA.
// For GitHub Pages: pathname includes /LBC prefix
const getPathname = () => {
  let pathname = window.location.pathname;
  // Remove the base path if it exists (for GitHub Pages)
  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length);
  }
  return pathname || "/";
};

const isAdmin = typeof window !== "undefined" && getPathname().startsWith("/admin");

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    {isAdmin ? <AdminApp /> : <App />}
  </React.StrictMode>,
);
