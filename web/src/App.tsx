import { useEffect, useState } from "react";
import type { Lang } from "./i18n.ts";
import { Explore } from "./components/Explore.tsx";
import { Admin } from "./components/Admin.tsx";

export function App() {
  const [lang, setLang] = useState<Lang>("de");
  const [route, setRoute] = useState<string>(window.location.hash);

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (route === "#admin") {
    return <Admin lang={lang} onBack={() => (window.location.hash = "")} />;
  }
  return <Explore lang={lang} onLang={setLang} />;
}
