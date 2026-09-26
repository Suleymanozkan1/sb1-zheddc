import { cx } from "@cryptoarena/ui";
import { LANGS } from "../lib/i18n";
import { useApp } from "../lib/store";

/** Compact EN / TR toggle. */
export function LanguageSwitch({ className }: { className?: string }) {
  const { lang, setLang } = useApp();
  return (
    <div className={cx("flex rounded-lg bg-white/5 p-0.5 text-[10px] font-bold tracking-widest", className)} role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button
          key={l.code}
          title={l.label}
          aria-pressed={lang === l.code}
          onClick={() => setLang(l.code)}
          className={cx("rounded-md px-2 py-1 uppercase transition", lang === l.code ? "bg-cyan-400 text-black" : "text-slate-400 hover:text-white")}
        >
          {l.code}
        </button>
      ))}
    </div>
  );
}
