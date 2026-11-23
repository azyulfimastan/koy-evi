"use client";
import { useEffect, useState } from "react";
import Login from "./Login";
import ProjectList from "./ProjectList";
import Editor from "./Editor";

export const VERSION = "v2.5";

export default function App() {
  const [auth, setAuth] = useState<null | boolean>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((j) => setAuth(!!j.ok))
      .catch(() => setAuth(false));
    const saved = sessionStorage.getItem("kte_open");
    if (saved) setOpenId(saved);
  }, []);

  const open = (id: string | null) => {
    setOpenId(id);
    if (id) sessionStorage.setItem("kte_open", id);
    else sessionStorage.removeItem("kte_open");
  };

  if (auth === null) return <div className="center muted">Yükleniyor…</div>;
  if (!auth) return <Login onDone={() => setAuth(true)} />;
  if (openId) return <Editor id={openId} onBack={() => open(null)} />;
  return (
    <ProjectList
      onOpen={open}
      onLogout={async () => {
        await fetch("/api/logout", { method: "POST" });
        open(null);
        setAuth(false);
      }}
    />
  );
}
