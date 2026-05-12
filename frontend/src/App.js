import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import "@/App.css";
import "react-day-picker/dist/style.css";
import axios from "axios";
import { DayPicker } from "react-day-picker";
import { fr } from "date-fns/locale";
import {
  Lightbulb, Phone, User, ChevronLeft, ChevronRight, Check, CheckCircle2,
  ShieldCheck, Star, Laptop, Smartphone, Wifi, Lock, Clock, FileText,
  Download, XCircle, ListChecks, MapPin, Mail, Hash, Send, X, ArrowRight,
  Quote, Sparkles, Type, HelpCircle, CalendarDays, CreditCard, TimerReset,
  PartyPopper, Home, LogOut, Loader2, Volume2, VolumeX, PauseCircle, Contrast,
  Cookie, AlertTriangle, Sun, Moon, Award, ThumbsUp, Headphones, Wrench,
  Sunrise, MessageSquare,
} from "lucide-react";

/* =========================================================
   Le Bon Clic SPA — complete edition with all UX upgrades
   ========================================================= */

const SVI_PHONE = "06 25 55 47 02";
const SVI_TEL = "0625554702";
const HOURLY_BASE = 80;
const HOURLY_NET = 40;
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const STORAGE_TOKEN = "lbc_token_v2";
const STORAGE_USER = "lbc_user_v2";
const STORAGE_AUDIO = "lbc_audio_enabled_v1";
const STORAGE_CONTRAST = "lbc_contrast_v1";
const STORAGE_FONT = "lbc_font_scale_v1";
const STORAGE_COOKIES = "lbc_cookies_v1";

const api = axios.create({ baseURL: API });
api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem(STORAGE_TOKEN);
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

const cx = (...xs) => xs.filter(Boolean).join(" ");

/* ===================================================================
   ACCESSIBILITY CONTEXT — TTS, font scale (4 levels), high contrast
   =================================================================== */

const A11yContext = React.createContext(null);

const A11yProvider = ({ children }) => {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [audioEnabled, setAudioEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    const v = localStorage.getItem(STORAGE_AUDIO);
    return v === null ? true : v === "1";
  });
  const [fontScale, setFontScale] = useState(() => parseFloat(localStorage.getItem(STORAGE_FONT) || "1"));
  const [highContrast, setHighContrast] = useState(() => localStorage.getItem(STORAGE_CONTRAST) === "1");
  const [speakingId, setSpeakingId] = useState(null);

  useEffect(() => { localStorage.setItem(STORAGE_AUDIO, audioEnabled ? "1" : "0"); if (!audioEnabled && supported) window.speechSynthesis.cancel(); }, [audioEnabled, supported]);
  useEffect(() => { localStorage.setItem(STORAGE_FONT, String(fontScale)); document.documentElement.style.fontSize = `${100 * fontScale}%`; }, [fontScale]);
  useEffect(() => {
    localStorage.setItem(STORAGE_CONTRAST, highContrast ? "1" : "0");
    document.body.classList.toggle("lbc-high-contrast", highContrast);
  }, [highContrast]);

  useEffect(() => {
    if (!supported) return;
    const onHide = () => window.speechSynthesis.cancel();
    window.addEventListener("pagehide", onHide);
    if (typeof window.speechSynthesis.onvoiceschanged !== "undefined")
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    return () => { window.removeEventListener("pagehide", onHide); window.speechSynthesis.cancel(); };
  }, [supported]);

  const stop = useCallback(() => { if (supported) window.speechSynthesis.cancel(); setSpeakingId(null); }, [supported]);
  const speak = useCallback((text, id = "global") => {
    if (!supported || !audioEnabled || !text) return;
    window.speechSynthesis.cancel();
    const u = new window.SpeechSynthesisUtterance(text);
    u.lang = "fr-FR"; u.rate = 0.95;
    const voices = window.speechSynthesis.getVoices();
    const fv = voices.find((v) => v.lang === "fr-FR") || voices.find((v) => (v.lang || "").startsWith("fr"));
    if (fv) u.voice = fv;
    u.onend = () => setSpeakingId((c) => (c === id ? null : c));
    u.onerror = () => setSpeakingId(null);
    setSpeakingId(id);
    window.speechSynthesis.speak(u);
  }, [supported, audioEnabled]);

  const toggleAudio = useCallback(() => setAudioEnabled((v) => { if (v && supported) window.speechSynthesis.cancel(); return !v; }), [supported]);
  const cycleFont = useCallback(() => setFontScale((s) => { const next = +(s + 0.25).toFixed(2); return next > 1.75 ? 1 : next; }), []);
  const toggleContrast = useCallback(() => setHighContrast((v) => !v), []);

  const value = useMemo(() => ({
    supported, audioEnabled, fontScale, highContrast, speakingId,
    speak, stop, toggleAudio, cycleFont, toggleContrast,
  }), [supported, audioEnabled, fontScale, highContrast, speakingId, speak, stop, toggleAudio, cycleFont, toggleContrast]);
  return <A11yContext.Provider value={value}>{children}</A11yContext.Provider>;
};

const useA11y = () => React.useContext(A11yContext);

/* ===================================================================
   Reusable building blocks
   =================================================================== */

const Logo = ({ size = "md" }) => {
  const sz = { sm: "text-xl", md: "text-2xl md:text-3xl", lg: "text-3xl md:text-4xl" };
  return (
    <div className="flex items-center gap-2 select-none">
      <span className={cx("font-extrabold tracking-tight text-ink-800", sz[size])}>Le Bon Clic</span>
      <span className="relative inline-flex">
        <Lightbulb className="w-7 h-7 text-brandPurple" strokeWidth={2.4} />
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-brandCyan animate-pulse-soft" />
      </span>
    </div>
  );
};

const Badge = ({ children, tone = "green", icon: Icon }) => {
  const tones = {
    green: "bg-sapGreen-soft text-sapGreen border-sapGreen/30",
    cyan: "bg-brandCyan-soft text-brandCyan border-brandCyan/30",
    purple: "bg-brandPurple-soft text-brandPurple border-brandPurple/30",
    slate: "bg-ink-100 text-ink-700 border-ink-200",
  };
  return (
    <div className={cx("inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm md:text-base font-bold", tones[tone])}>
      {Icon && <Icon className="w-4 h-4 md:w-5 md:h-5" />}<span>{children}</span>
    </div>
  );
};

const PrimaryButton = ({ children, onClick, disabled, full, icon: Icon, type = "button", testId, loading }) => (
  <button type={type} data-testid={testId} onClick={onClick} disabled={disabled || loading}
    className={cx("inline-flex items-center justify-center gap-2 px-5 md:px-6 py-3 md:py-3.5 rounded-xl font-bold transition-all bg-ink-800 text-white hover:bg-ink-900 active:scale-[0.98] shadow-soft disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-ink-800", full && "w-full")}>
    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : Icon && <Icon className="w-5 h-5" />}{children}
  </button>
);

const Card = ({ children, className }) => (
  <div className={cx("bg-white rounded-2xl border border-ink-200/70 shadow-soft p-6 md:p-8", className)}>{children}</div>
);

const TextInput = (props) => (
  <input {...props} className={cx("w-full px-4 py-3.5 rounded-xl border-2 border-ink-200 bg-white text-ink-800 text-base md:text-lg placeholder:text-ink-400 focus:border-brandPurple focus:outline-none transition-colors", props.className)} />
);
const TextArea = (props) => (
  <textarea {...props} className={cx("w-full px-4 py-3.5 rounded-xl border-2 border-ink-200 bg-white text-ink-800 text-base md:text-lg placeholder:text-ink-400 focus:border-brandPurple focus:outline-none transition-colors min-h-[120px] resize-y", props.className)} />
);

const Field = ({ label, hint, children, required, help }) => (
  <label className="block">
    <span className="flex items-center gap-2 text-base font-bold text-ink-800 mb-2">
      {label}{required && <span className="text-brandCyan">*</span>}
      {help && <HelpTooltip text={help} />}
    </span>
    {children}
    {hint && <span className="block text-sm text-ink-500 mt-1.5">{hint}</span>}
  </label>
);

/* ----------- HelpTooltip (Item #21) ----------- */
const HelpTooltip = ({ text }) => {
  const [open, setOpen] = useState(false);
  return (
    <span className="lbc-help">
      <button type="button" aria-label="Aide" data-testid="help-tooltip"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        className="w-6 h-6 rounded-full border-2 border-brandCyan/40 bg-brandCyan-soft text-brandCyan inline-flex items-center justify-center hover:border-brandCyan transition-colors">
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && <span role="tooltip" className="lbc-help-pop">{text}</span>}
    </span>
  );
};

/* ----------- SpeakButton (TTS) ----------- */
let _spkCounter = 0;
const SpeakButton = ({ text, label = "Lire à voix haute", size = "md", className }) => {
  const { speak, stop, speakingId, audioEnabled, supported } = useA11y();
  const idRef = useRef(null);
  if (idRef.current === null) { _spkCounter += 1; idRef.current = `spk-${_spkCounter}`; }
  if (!supported || !audioEnabled) return null;
  const speaking = speakingId === idRef.current;
  const sizes = { sm: "w-7 h-7", md: "w-9 h-9", lg: "w-10 h-10" };
  const icons = { sm: "w-4 h-4", md: "w-5 h-5", lg: "w-5 h-5" };
  return (
    <button type="button" data-testid="speak-btn" aria-pressed={speaking}
      onClick={() => (speaking ? stop() : speak(text, idRef.current))}
      aria-label={speaking ? "Arrêter la lecture" : label}
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full border-2 transition-all", sizes[size],
        speaking ? "border-brandCyan bg-brandCyan text-white animate-pulse-soft" : "border-brandCyan/40 bg-brandCyan-soft text-brandCyan hover:border-brandCyan hover:bg-brandCyan/15", className)}>
      {speaking ? <PauseCircle className={icons[size]} /> : <Volume2 className={icons[size]} />}
    </button>
  );
};

/* ----------- Skeletons (Item #10) ----------- */
const SkeletonLine = ({ w = "w-full", h = "h-4" }) => <div className={cx("skeleton", w, h)} />;
const SkeletonCard = () => (
  <div className="bg-white rounded-2xl border border-ink-200 p-6 shadow-soft space-y-3">
    <SkeletonLine w="w-2/3" h="h-6" />
    <SkeletonLine w="w-full" />
    <SkeletonLine w="w-5/6" />
    <SkeletonLine w="w-3/4" />
  </div>
);

/* ----------- Confirm Dialog (Item #5) ----------- */
const ConfirmDialog = ({ open, title, message, confirmLabel = "Confirmer", cancelLabel = "Annuler", danger, onConfirm, onCancel }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-ink-900/60 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 md:p-8 animate-pop-in shadow-card">
        <div className="flex items-start gap-3 mb-3">
          <div className={cx("w-10 h-10 rounded-xl flex items-center justify-center", danger ? "bg-red-100 text-red-600" : "bg-brandCyan-soft text-brandCyan")}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h3 className="text-xl font-extrabold text-ink-900 flex-1">{title}</h3>
          <SpeakButton size="sm" text={`${title}. ${message}`} />
        </div>
        <p className="text-ink-700 leading-relaxed">{message}</p>
        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button data-testid="confirm-cancel" onClick={onCancel} className="px-5 py-3 rounded-xl border-2 border-ink-200 text-ink-700 font-bold hover:border-ink-300">
            {cancelLabel}
          </button>
          <button data-testid="confirm-ok" onClick={onConfirm}
            className={cx("px-5 py-3 rounded-xl font-bold text-white", danger ? "bg-red-600 hover:bg-red-700" : "bg-ink-800 hover:bg-ink-900")}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ----------- Cookie Banner (Item #18 — RGPD) ----------- */
const CookieBanner = ({ onAccept, onReject }) => (
  <div className="cookie-banner fixed inset-x-0 bottom-0 z-50 p-3 md:p-4 sticky-call-bar pointer-events-none">
    <div className="max-w-4xl mx-auto pointer-events-auto bg-ink-800 text-white rounded-2xl shadow-card p-5 md:p-6 flex flex-col md:flex-row items-start md:items-center gap-4">
      <Cookie className="w-8 h-8 text-brandCyan shrink-0" />
      <div className="flex-1 text-sm md:text-base">
        <strong>Petit message sur les cookies.</strong> Nous utilisons uniquement des cookies techniques nécessaires au fonctionnement du site (connexion, préférences d'accessibilité). Aucun traceur publicitaire.
      </div>
      <div className="flex gap-2 self-stretch md:self-auto w-full md:w-auto">
        <button data-testid="cookies-reject" onClick={onReject} className="flex-1 md:flex-none px-4 py-2.5 rounded-xl border-2 border-white/20 hover:border-white/40 font-bold text-sm">Refuser</button>
        <button data-testid="cookies-accept" onClick={onAccept} className="flex-1 md:flex-none px-4 py-2.5 rounded-xl bg-brandCyan text-ink-900 hover:bg-brandCyan-light font-bold text-sm">D'accord</button>
      </div>
    </div>
  </div>
);

/* ----------- Sticky Mobile Call Bar (Item #15) ----------- */
const StickyMobileCall = ({ show }) => {
  if (!show) return null;
  return (
    <a href={`tel:${SVI_TEL}`} data-testid="sticky-mobile-call"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-ink-800 text-white py-3 px-4 flex items-center justify-center gap-2 font-bold shadow-card sticky-call-bar">
      <Phone className="w-5 h-5 text-brandCyan" />Appeler Jordan : {SVI_PHONE}
    </a>
  );
};

/* ----------- Skip-link (Item #20) ----------- */
const SkipLink = () => <a href="#main-content" className="skip-link">Aller au contenu principal</a>;

/* ----------- Address autocomplete (Item #8 — api-adresse.data.gouv.fr) ----------- */
const AddressAutocomplete = ({ value, onChange, placeholder, testId }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const tRef = useRef(null);
  const doSearch = useCallback((q) => {
    if (!q || q.length < 3) { setSuggestions([]); setOpen(false); return; }
    fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5&autocomplete=1`)
      .then((r) => r.json())
      .then((j) => {
        const items = (j.features || []).map((f) => ({
          label: f.properties.label,
          context: f.properties.context,
          postcode: f.properties.postcode,
          city: f.properties.city,
        }));
        setSuggestions(items); setOpen(items.length > 0);
      })
      .catch(() => setSuggestions([]));
  }, []);
  const onInput = (e) => {
    const v = e.target.value; onChange(v);
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(() => doSearch(v), 220);
  };
  return (
    <div className="relative">
      <TextInput data-testid={testId} value={value || ""} onChange={onInput} placeholder={placeholder}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} autoComplete="off" />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-30 left-0 right-0 mt-1 bg-white border-2 border-ink-200 rounded-xl shadow-card overflow-hidden max-h-72 overflow-y-auto">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button type="button" data-testid={`addr-suggestion-${i}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(s.label); setOpen(false); }}
                className="w-full text-left px-4 py-2.5 hover:bg-brandCyan-soft transition-colors flex items-start gap-2">
                <MapPin className="w-4 h-4 mt-1 text-brandCyan shrink-0" />
                <div className="text-sm">
                  <div className="font-bold text-ink-900">{s.label}</div>
                  <div className="text-ink-500">{s.context}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/* ----------- DayPicker date picker (Item #6) ----------- */
const todayPlus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const fmtDate = (d) => (d instanceof Date && !isNaN(d) ? d.toISOString().slice(0, 10) : "");
const formatDateFR = (iso) => { if (!iso) return ""; const d = new Date(iso + "T00:00"); return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); };

const DatePickerLBC = ({ value, onChange, testId }) => {
  const selected = value ? new Date(value + "T00:00") : undefined;
  return (
    <div className="rounded-2xl border-2 border-ink-200 bg-white p-3 md:p-4" data-testid={testId}>
      <DayPicker mode="single" locale={fr} selected={selected}
        onSelect={(d) => d && onChange(fmtDate(d))}
        disabled={[{ before: todayPlus(1) }, { after: todayPlus(60) }, { dayOfWeek: [0] }]}
        showOutsideDays modifiers={{}} weekStartsOn={1} numberOfMonths={1} />
    </div>
  );
};

/* ----------- Time-window picker AM/PM (Item #7) ----------- */
const TIME_AM = ["08h - 09h", "09h - 10h", "10h - 11h", "11h - 12h"];
const TIME_PM = ["14h - 15h", "15h - 16h", "16h - 17h", "17h - 18h"];
const TimeWindowPicker = ({ value, onChange }) => (
  <div className="space-y-3">
    {[{ icon: Sunrise, label: "Matin", windows: TIME_AM, tone: "text-amber-500" },
      { icon: Sun, label: "Après-midi", windows: TIME_PM, tone: "text-orange-500" }].map((grp, gi) => {
      const Icon = grp.icon;
      return (
        <div key={gi} className="rounded-xl border-2 border-ink-200 p-3 bg-white">
          <div className="flex items-center gap-2 mb-2 font-bold text-ink-800">
            <Icon className={cx("w-5 h-5", grp.tone)} />{grp.label}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {grp.windows.map((tw) => {
              const active = value === tw;
              return (
                <button key={tw} data-testid={`timewindow-${tw}`} onClick={() => onChange(tw)}
                  className={cx("px-3 py-2.5 rounded-lg border-2 text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-all",
                    active ? "chip-selected" : "border-ink-200 hover:border-ink-300 text-ink-700")}>
                  <Clock className="w-4 h-4" />{tw}
                </button>
              );
            })}
          </div>
        </div>
      );
    })}
  </div>
);

/* ----------- Step indicator with names (Item #9) ----------- */
const STEP_NAMES = ["Appareil", "Problème", "Créneau"];
const StepIndicator = ({ step }) => (
  <ol className="flex items-center gap-1 sm:gap-2 mb-6" aria-label="Étapes de la réservation">
    {STEP_NAMES.map((label, i) => {
      const n = i + 1; const done = n < step; const active = n === step;
      return (
        <React.Fragment key={label}>
          <li className={cx("flex items-center gap-2 px-2 py-1 rounded-lg",
            active && "bg-brandCyan-soft text-brandCyan", done && "text-brandPurple", !active && !done && "text-ink-400")}>
            <span className={cx("w-7 h-7 rounded-full inline-flex items-center justify-center text-sm font-extrabold border-2",
              active ? "bg-brandCyan text-white border-brandCyan" : done ? "bg-brandPurple text-white border-brandPurple" : "bg-white border-ink-300 text-ink-400")}>
              {done ? <Check className="w-4 h-4" /> : n}
            </span>
            <span className={cx("text-xs sm:text-sm font-bold uppercase tracking-wide", active && "text-brandCyan", done && "text-brandPurple")}>{label}</span>
          </li>
          {i < 2 && <li aria-hidden className="flex-1 h-px bg-ink-200" />}
        </React.Fragment>
      );
    })}
  </ol>
);

/* ===================================================================
   New rich Landing sections (Items #1, #2, #3, #4, #14)
   =================================================================== */

const JordanCard = ({ inline }) => (
  <div className={cx("flex items-center gap-4", inline && "flex-col text-center sm:flex-row sm:text-left")}>
    <div className="relative shrink-0">
      <div className="w-20 h-20 rounded-full overflow-hidden shadow-card relative" style={{ background: "linear-gradient(135deg,#06B6D4,#8B5CF6)" }}>
        <span className="absolute inset-0 flex items-center justify-center text-white text-2xl font-black">JD</span>
        <svg className="absolute -bottom-1 -right-1 w-7 h-7 text-brandPurple bg-white rounded-full p-1 shadow" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M9 2a7 7 0 00-4 12.74V18a2 2 0 002 2h6a2 2 0 002-2v-3.26A7 7 0 009 2z" />
        </svg>
      </div>
    </div>
    <div>
      <div className="text-xs uppercase tracking-wide text-ink-500 font-bold">Votre artisan</div>
      <div className="text-xl font-extrabold text-ink-900">Jordan</div>
      <div className="text-sm text-ink-600">Artisan du numérique · 8 ans d'expérience à Lyon</div>
      <div className="mt-1.5 inline-flex items-center gap-1 text-amber-500 font-bold text-sm">
        {Array.from({ length: 5 }).map((_, k) => <Star key={k} className="w-4 h-4 fill-amber-400 text-amber-400" />)}
        <span className="text-ink-700 ml-1">4.9/5</span>
      </div>
    </div>
  </div>
);

const HowItWorks = () => {
  const steps = [
    { icon: CalendarDays, title: "Vous réservez", desc: "En 2 minutes, sans engagement, depuis cette page ou par téléphone." },
    { icon: Phone, title: "Jordan vous appelle", desc: "Pour confirmer votre besoin et préparer son intervention." },
    { icon: Home, title: "Il vient chez vous", desc: "Sur la plage horaire choisie. Diagnostic clair, sans jargon." },
    { icon: FileText, title: "Facture conforme SAP", desc: "Envoyée par e-mail. Vous récupérez 50% via crédit d'impôt." },
  ];
  return (
    <section className="mt-16 md:mt-24">
      <div className="flex items-end justify-between gap-4 mb-8">
        <div className="flex items-start gap-3">
          <h2 className="text-2xl md:text-3xl font-extrabold text-ink-900">Comment ça se passe ?</h2>
          <SpeakButton text="Comment ça se passe ? En 4 étapes simples. Premièrement, vous réservez en deux minutes. Deuxièmement, Jordan vous appelle pour confirmer. Troisièmement, il vient chez vous. Quatrièmement, vous recevez la facture conforme Service à la Personne." />
        </div>
      </div>
      <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <li key={i} className="relative rounded-2xl border border-ink-200 bg-white p-6 shadow-soft animate-fade-in-up" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="absolute -top-3 -left-3 w-9 h-9 rounded-full bg-ink-800 text-white inline-flex items-center justify-center font-black shadow-card">{i + 1}</div>
              <div className="w-12 h-12 rounded-xl bg-brandCyan-soft text-brandCyan inline-flex items-center justify-center mb-3"><Icon className="w-6 h-6" /></div>
              <div className="font-extrabold text-ink-900 text-lg">{s.title}</div>
              <p className="mt-1 text-sm text-ink-600">{s.desc}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

const GoogleReviews = () => (
  <a href="https://www.google.com/search?q=Le+Bon+Clic+Lyon" target="_blank" rel="noopener noreferrer"
    className="inline-flex items-center gap-3 bg-white border-2 border-ink-200 rounded-2xl px-4 py-3 hover:border-ink-300 transition-colors shadow-soft">
    <svg viewBox="0 0 48 48" className="w-7 h-7" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8a12 12 0 110-24c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.4 29.3 3.5 24 3.5 12.8 3.5 3.5 12.8 3.5 24S12.8 44.5 24 44.5 44.5 35.2 44.5 24c0-1.2-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.4 29.3 3.5 24 3.5c-7.7 0-14.4 4.4-17.7 11.2z" />
      <path fill="#4CAF50" d="M24 44.5c5.2 0 10-2 13.6-5.3l-6.3-5.3a12 12 0 01-18.2-3.6l-6.6 5.1C9.4 40.2 16.2 44.5 24 44.5z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.3 5.3c-.4.4 6.6-4.8 6.6-15 0-1.2-.1-2.4-.4-3.5z" />
    </svg>
    <div className="text-left">
      <div className="flex items-center gap-1 text-amber-500">
        {Array.from({ length: 5 }).map((_, k) => <Star key={k} className="w-4 h-4 fill-amber-400 text-amber-400" />)}
        <span className="ml-1 text-ink-900 font-extrabold">4.9</span>
      </div>
      <div className="text-xs text-ink-600 font-bold">220+ avis Google · Cliquer pour voir</div>
    </div>
  </a>
);

const ServiceMap = () => {
  const towns = ["Lyon 1er", "Lyon 2e", "Lyon 3e", "Lyon 4e", "Lyon 5e", "Lyon 6e", "Lyon 7e", "Lyon 8e", "Lyon 9e", "Villeurbanne", "Caluire-et-Cuire", "Bron", "Vénissieux", "Sainte-Foy-lès-Lyon", "Tassin-la-Demi-Lune", "Écully", "Oullins", "Saint-Priest"];
  return (
    <section className="mt-16 md:mt-24">
      <div className="rounded-3xl border border-ink-200 bg-white p-6 md:p-10 grid md:grid-cols-2 gap-8 items-center shadow-soft">
        <div>
          <Badge tone="cyan" icon={MapPin}>Zone d'intervention</Badge>
          <div className="mt-3 flex items-start gap-3">
            <h3 className="text-2xl md:text-3xl font-extrabold text-ink-900">Lyon &amp; sa métropole</h3>
            <SpeakButton text={"Zone d'intervention : Lyon et sa métropole. Nous intervenons à : " + towns.join(", ")} />
          </div>
          <p className="mt-2 text-ink-600">Déplacement inclus sur tout le périmètre ci-dessous. Au-delà ? Appelez-nous, on s'arrange.</p>
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {towns.map((t) => (
              <li key={t} className="px-3 py-1.5 text-xs font-bold rounded-full bg-brandCyan-soft text-brandCyan border border-brandCyan/30">{t}</li>
            ))}
          </ul>
        </div>
        <div className="relative aspect-square rounded-2xl bg-gradient-to-br from-brandCyan-soft via-white to-brandPurple-soft border border-ink-200 overflow-hidden">
          <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full" aria-hidden>
            <circle cx="100" cy="100" r="78" fill="rgba(6,182,212,0.10)" stroke="#06B6D4" strokeDasharray="4 4" strokeWidth="1.5" />
            <circle cx="100" cy="100" r="55" fill="rgba(139,92,246,0.10)" stroke="#8B5CF6" strokeDasharray="4 4" strokeWidth="1.5" />
            <circle cx="100" cy="100" r="9" fill="#1E293B" />
            <circle cx="100" cy="100" r="4" fill="#06B6D4" />
            <text x="100" y="125" textAnchor="middle" fontSize="9" fontWeight="800" fill="#1E293B">LYON</text>
            {[[60, 70], [140, 75], [70, 140], [150, 135], [105, 50], [55, 110]].map(([x, y], i) => (
              <g key={i}><circle cx={x} cy={y} r="3.5" fill="#8B5CF6" /></g>
            ))}
          </svg>
        </div>
      </div>
    </section>
  );
};

const PricingExamples = () => {
  const rows = [
    { icon: Laptop, label: "Mon ordinateur est lent", hours: "1h", price: 40 },
    { icon: Smartphone, label: "Transférer mes photos sur un nouveau téléphone", hours: "1h30", price: 60 },
    { icon: Wifi, label: "Ma box internet ne marche plus", hours: "1h", price: 40 },
    { icon: Lock, label: "Sécuriser mes comptes après une arnaque", hours: "2h", price: 80 },
    { icon: Wrench, label: "Configurer ma nouvelle imprimante", hours: "1h", price: 40 },
  ];
  return (
    <section className="mt-16 md:mt-24">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <div>
            <Badge tone="purple" icon={ThumbsUp}>Tarifs transparents</Badge>
            <h2 className="mt-3 text-2xl md:text-3xl font-extrabold text-ink-900">Exemples concrets de coût</h2>
            <p className="mt-1 text-ink-600">Tarifs nets après crédit d'impôt SAP. Vous ne payez que la moitié.</p>
          </div>
          <SpeakButton text="Exemples concrets de coût après le crédit d'impôt Service à la Personne. Ordinateur lent : 1 heure, 40 euros. Transfert de photos : 1h30, 60 euros. Box internet : 1 heure, 40 euros. Sécuriser les comptes : 2 heures, 80 euros. Configurer une imprimante : 1 heure, 40 euros." />
        </div>
      </div>
      <div className="rounded-2xl border border-ink-200 bg-white overflow-hidden shadow-soft">
        {rows.map((r, i) => {
          const Icon = r.icon;
          return (
            <div key={i} className={cx("flex items-center justify-between gap-3 px-5 py-4", i > 0 && "border-t border-ink-200")}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-brandPurple-soft text-brandPurple inline-flex items-center justify-center"><Icon className="w-5 h-5" /></div>
                <div>
                  <div className="font-bold text-ink-900">{r.label}</div>
                  <div className="text-xs text-ink-500">~ {r.hours} d'intervention</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-ink-500 font-bold line-through">{r.price * 2}€</div>
                <div className="text-2xl font-black text-brandCyan">{r.price}€</div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-ink-500 text-center">Tarif horaire de base 80€/h · Crédit d'impôt 50% déduit automatiquement (case 7DB).</p>
    </section>
  );
};

/* ===================================================================
   Header (with audio, font cycle, contrast)
   =================================================================== */

const Header = ({ user, onLogout, onGoHome }) => {
  const { audioEnabled, toggleAudio, supported, fontScale, cycleFont, highContrast, toggleContrast } = useA11y();
  const fontLabel = fontScale === 1 ? "A+" : fontScale === 1.25 ? "A++" : fontScale === 1.5 ? "A+++" : "A++++";
  return (
    <header className="sticky top-0 z-30">
      <div className="bg-ink-800 text-white">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-2.5 flex items-center justify-center md:justify-between gap-4 text-sm md:text-[15px]">
          <a href={`tel:${SVI_TEL}`} className="inline-flex items-center gap-2 text-white/90 hover:text-white">
            <Phone className="w-4 h-4 text-brandCyan" /><span className="font-medium">Assistance :</span><span className="font-bold tracking-wide">{SVI_PHONE}</span>
          </a>
          <span className="hidden md:inline text-white/60 text-xs">Service à la Personne agréé · Lyon &amp; Métropole</span>
        </div>
      </div>
      <div className="bg-white/95 backdrop-blur border-b border-ink-200">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between gap-2 md:gap-4">
          <button onClick={onGoHome} className="flex items-center gap-3" data-testid="header-logo"><Logo /></button>
          <div className="flex items-center gap-1.5 md:gap-2">
            {supported && (
              <button data-testid="audio-toggle-btn" onClick={toggleAudio} aria-pressed={audioEnabled} title={audioEnabled ? "Désactiver la lecture audio" : "Activer la lecture audio"}
                className={cx("inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 font-bold transition-all",
                  audioEnabled ? "border-brandCyan bg-brandCyan-soft text-brandCyan" : "border-ink-200 bg-white text-ink-500 hover:border-ink-300")}>
                {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                <span className="text-sm hidden sm:inline">{audioEnabled ? "Audio" : "Muet"}</span>
              </button>
            )}
            <button data-testid="contrast-toggle-btn" onClick={toggleContrast} aria-pressed={highContrast} title={highContrast ? "Désactiver le contraste élevé" : "Activer le contraste élevé"}
              className={cx("inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 font-bold transition-all",
                highContrast ? "border-amber-400 bg-amber-50 text-amber-700" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300")}>
              <Contrast className="w-4 h-4" /><span className="text-sm hidden sm:inline">Contraste</span>
            </button>
            <button data-testid="font-increase-btn" onClick={cycleFont} title="Agrandir le texte"
              className={cx("inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 font-bold transition-all",
                fontScale > 1 ? "border-brandCyan bg-brandCyan-soft text-brandCyan" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300")}>
              <Type className="w-4 h-4" /><span className="text-sm">{fontLabel}</span>
            </button>
            {user ? (
              <button data-testid="logout-btn" onClick={onLogout}
                className="inline-flex items-center gap-2 px-3 md:px-4 py-2.5 rounded-xl text-ink-700 hover:bg-ink-100 font-bold">
                <LogOut className="w-4 h-4" /><span className="hidden md:inline">Déconnexion</span>
              </button>
            ) : (
              <button data-testid="header-cta-login" onClick={onGoHome}
                className="inline-flex items-center gap-2 px-3 md:px-4 py-2.5 rounded-xl bg-ink-800 text-white font-bold hover:bg-ink-900">
                <User className="w-4 h-4" /><span className="hidden sm:inline">Espace Client</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

/* ===================================================================
   Landing (extended)
   =================================================================== */

const TESTIMONIALS = [
  { name: "Mireille, 72 ans", city: "Lyon 6e", rating: 5, quote: "Jordan a retrouvé toutes mes photos et m'a montré, calmement, comment éviter les arnaques. Le crédit d'impôt a fait le reste !" },
  { name: "Jean-Claude, 68 ans", city: "Villeurbanne", rating: 5, quote: "Une intervention claire, sans jargon. La box internet remarche, et la facture est divisée par deux grâce au SAP." },
  { name: "Hélène, 65 ans", city: "Caluire", rating: 5, quote: "On me parle enfin avec patience. Je recommande à tous mes amis : c'est rassurant, propre, et tellement humain." },
];

const Landing = ({ onStartAuth }) => (
  <main id="main-content" className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-14 pb-20 md:pb-14">
    <section className="grid md:grid-cols-12 gap-10 items-center animate-fade-in-up">
      <div className="md:col-span-7">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="green" icon={ShieldCheck}>Agréé SAP · 50% de crédit d'impôt</Badge>
          <GoogleReviews />
        </div>
        <div className="mt-5 flex items-start gap-3">
          <h1 className="font-extrabold tracking-tight text-ink-900 leading-[1.05] text-4xl sm:text-5xl md:text-6xl lg:text-7xl">
            L'expertise informatique <span className="text-gradient-brand">chez vous</span>
          </h1>
          <SpeakButton size="lg" text="L'expertise informatique chez vous. Dépannage, conseil et accompagnement à domicile sur Lyon. Un artisan de confiance, patient et sans jargon, pour retrouver votre sérénité numérique, avec une facture divisée par deux grâce à l'État." className="mt-3" />
        </div>
        <p className="mt-6 text-lg md:text-xl text-ink-600 max-w-xl leading-relaxed">
          Dépannage, conseil et accompagnement à domicile sur Lyon. Un artisan de confiance, patient et sans jargon, pour retrouver votre sérénité numérique — avec une facture divisée par deux grâce à l'État.
        </p>
        <div className="mt-6"><JordanCard /></div>
        <div className="mt-7 flex flex-col sm:flex-row gap-3">
          <PrimaryButton testId="hero-cta-book" onClick={onStartAuth} icon={CalendarDays}>Prendre rendez-vous</PrimaryButton>
          <a href={`tel:${SVI_TEL}`}
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold border-2 border-ink-200 text-ink-700 bg-white hover:border-ink-300">
            <Phone className="w-5 h-5 text-brandCyan" />Appeler le {SVI_PHONE}
          </a>
        </div>
        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-ink-600">
          <span className="inline-flex items-center gap-2 font-semibold"><CheckCircle2 className="w-5 h-5 text-sapGreen" /> Devis transparent</span>
          <span className="inline-flex items-center gap-2 font-semibold"><CheckCircle2 className="w-5 h-5 text-sapGreen" /> Pas de jargon technique</span>
          <span className="inline-flex items-center gap-2 font-semibold"><CheckCircle2 className="w-5 h-5 text-sapGreen" /> Facture conforme SAP</span>
        </div>
      </div>

      <div className="md:col-span-5">
        <div className="relative">
          <div className="absolute -inset-3 rounded-3xl bg-gradient-to-br from-brandCyan/20 via-transparent to-brandPurple/20 blur-2xl" />
          <div className="relative bg-white rounded-3xl border border-ink-200 shadow-card p-6 md:p-8">
            <div className="flex items-center justify-between">
              <Badge tone="cyan" icon={Sparkles}>Devis indicatif</Badge>
              <span className="text-xs text-ink-500 font-bold">Tarif net après aide</span>
            </div>
            <div className="mt-6 flex items-end justify-between">
              <div>
                <div className="text-ink-500 line-through text-xl font-bold">{HOURLY_BASE}€/h</div>
                <div className="mt-1 text-5xl md:text-6xl font-black text-ink-900">
                  {HOURLY_NET}<span className="text-brandCyan">€</span><span className="text-2xl text-ink-500">/h</span>
                </div>
              </div>
              <div className="text-right">
                <div className="inline-flex items-center gap-1.5 text-sapGreen font-bold"><ShieldCheck className="w-5 h-5" /> -50% SAP</div>
                <p className="mt-2 text-xs text-ink-500 max-w-[10rem]">Crédit d'impôt déduit automatiquement</p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-ink-50 p-3"><div className="font-bold text-ink-800">Déplacement inclus</div><div className="text-ink-500">Lyon &amp; alentours</div></div>
              <div className="rounded-xl bg-ink-50 p-3"><div className="font-bold text-ink-800">Sans engagement</div><div className="text-ink-500">Annulable 24h avant</div></div>
            </div>
            <button onClick={onStartAuth} data-testid="hero-card-cta" className="mt-6 w-full inline-flex items-center justify-between gap-2 px-5 py-3.5 rounded-xl bg-ink-800 text-white font-bold hover:bg-ink-900">
              <span>Réserver un créneau</span><ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </section>

    <HowItWorks />
    <PricingExamples />
    <ServiceMap />

    <section className="mt-16 md:mt-24">
      <div className="flex items-end justify-between gap-4 mb-8">
        <div className="flex items-start gap-3">
          <h2 className="text-2xl md:text-3xl font-extrabold text-ink-900">Ils nous font confiance</h2>
          <SpeakButton text="Ils nous font confiance. Note moyenne : 4,9 sur 5, basée sur plus de 220 interventions." />
        </div>
        <div className="hidden md:flex items-center gap-1.5 text-ink-600 font-bold">
          <Star className="w-5 h-5 fill-amber-400 text-amber-400" /><span>4.9/5 sur 220+ interventions</span>
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-5">
        {TESTIMONIALS.map((t, i) => (
          <article key={i} className="rounded-2xl border border-ink-200 bg-white p-6 shadow-soft card-hover animate-fade-in-up" style={{ animationDelay: `${i * 80}ms` }}>
            <Quote className="w-6 h-6 text-brandPurple" />
            <p className="mt-3 text-ink-800 text-lg leading-relaxed">« {t.quote} »</p>
            <div className="mt-5 flex items-center justify-between">
              <div><div className="font-bold text-ink-900">{t.name}</div><div className="text-sm text-ink-500">{t.city}</div></div>
              <div className="flex items-center gap-0.5">{Array.from({ length: t.rating }).map((_, k) => <Star key={k} className="w-4 h-4 fill-amber-400 text-amber-400" />)}</div>
            </div>
          </article>
        ))}
      </div>
    </section>

    <section className="mt-16 md:mt-24">
      <div className="rounded-3xl bg-ink-800 text-white p-8 md:p-12 grid md:grid-cols-2 gap-8 items-center">
        <div>
          <Badge tone="green" icon={ShieldCheck}>Service à la Personne</Badge>
          <h3 className="mt-4 text-3xl md:text-4xl font-extrabold leading-tight">
            Vous payez <span className="text-brandCyan">moitié prix</span>, l'État finance le reste.
          </h3>
          <p className="mt-4 text-white/80 text-lg leading-relaxed max-w-lg">
            Nous sommes agréés Service à la Personne. Vous récupérez 50% via crédit d'impôt — même si vous n'êtes pas imposable.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[{ v: "80€", l: "Tarif horaire" }, { v: "-40€", l: "Crédit d'impôt" }, { v: "40€", l: "Coût réel" }].map((s, i) => (
            <div key={i} className="rounded-2xl bg-white/10 p-5">
              <div className="text-3xl md:text-4xl font-black text-white">{s.v}</div>
              <div className="mt-2 text-sm text-white/70 font-bold">{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  </main>
);

/* ===================================================================
   Auth Flow (with address autocomplete, help tooltips, error TTS)
   =================================================================== */

const AuthFlow = ({ onCancel, onAuthenticated }) => {
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState(""); const [phoneDigits, setPhoneDigits] = useState("");
  const [code, setCode] = useState(["", "", "", ""]); const codeRefs = useRef([]);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const [maskedPhone, setMaskedPhone] = useState(""); const [devCode, setDevCode] = useState(null);
  const [profile, setProfile] = useState({ first_name: "", last_name: "", email: "", address: "", access_details: "" });
  const { speak, audioEnabled } = useA11y();

  // Auto-read errors (Item #22)
  useEffect(() => { if (error && audioEnabled) speak(`Erreur : ${error}`, `auth-err-${Date.now()}`); }, [error, speak, audioEnabled]);

  const formatPhone = (v) => v.replace(/\D/g, "").slice(0, 10).replace(/(.{2})/g, "$1 ").trim();

  const submitPhone = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10 || !(digits.startsWith("06") || digits.startsWith("07"))) {
      setError("Merci de saisir un numéro de mobile français à 10 chiffres (06 ou 07)."); return;
    }
    setError(""); setLoading(true);
    try {
      const { data } = await api.post("/auth/send-otp", { phone: digits });
      setPhoneDigits(digits); setMaskedPhone(data.masked_phone); setDevCode(data.dev_code || null);
      setStep("code"); setTimeout(() => codeRefs.current[0]?.focus(), 50);
    } catch (e) { setError(e.response?.data?.detail || "Erreur lors de l'envoi du SMS."); }
    finally { setLoading(false); }
  };
  const submitCode = async () => {
    const entered = code.join("");
    if (entered.length < 4) { setError("Merci de saisir les 4 chiffres."); return; }
    setError(""); setLoading(true);
    try {
      const { data } = await api.post("/auth/verify-otp", { phone: phoneDigits, code: entered });
      localStorage.setItem(STORAGE_TOKEN, data.token);
      localStorage.setItem(STORAGE_USER, JSON.stringify(data.user));
      if (data.is_new_user || !data.user.profile_complete) setStep("profile");
      else onAuthenticated(data.user);
    } catch (e) { setError(e.response?.data?.detail || "Code incorrect."); }
    finally { setLoading(false); }
  };
  const submitProfile = async () => {
    const { first_name, last_name, email, address } = profile;
    if (!first_name.trim() || !last_name.trim() || !email.trim() || !address.trim()) { setError("Merci de compléter les champs obligatoires."); return; }
    setError(""); setLoading(true);
    try { const { data } = await api.put("/me", profile); localStorage.setItem(STORAGE_USER, JSON.stringify(data)); onAuthenticated(data); }
    catch (e) { setError(e.response?.data?.detail || "Erreur lors de la création."); }
    finally { setLoading(false); }
  };
  const onCodeChange = (i, v) => { const d = v.replace(/\D/g, "").slice(-1); const next = [...code]; next[i] = d; setCode(next); if (d && i < 3) codeRefs.current[i + 1]?.focus(); };
  const onCodeKeyDown = (i, e) => { if (e.key === "Backspace" && !code[i] && i > 0) codeRefs.current[i - 1]?.focus(); };

  return (
    <main id="main-content" className="max-w-3xl mx-auto px-4 md:px-8 py-8 md:py-14 pb-20 md:pb-14 animate-fade-in-up">
      <button onClick={onCancel} data-testid="auth-back-btn" className="inline-flex items-center gap-1 text-ink-600 hover:text-ink-900 font-bold mb-6">
        <ChevronLeft className="w-5 h-5" /> Retour à l'accueil
      </button>
      <Card className="!p-7 md:!p-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-brandCyan-soft text-brandCyan flex items-center justify-center">
            {step === "phone" && <Phone className="w-5 h-5" />}
            {step === "code" && <Hash className="w-5 h-5" />}
            {step === "profile" && <User className="w-5 h-5" />}
          </div>
          <div>
            <div className="text-sm font-bold text-ink-500">{step === "phone" ? "Étape 1/2" : step === "code" ? "Étape 2/2" : "Création de votre dossier"}</div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-ink-900">
              {step === "phone" && "Connexion sécurisée par SMS"}
              {step === "code" && "Saisissez votre code"}
              {step === "profile" && "Quelques informations utiles"}
            </h2>
          </div>
          <SpeakButton className="ml-auto"
            text={step === "phone" ? "Connexion sécurisée par SMS. Aucun mot de passe à retenir." :
                  step === "code" ? "Saisissez votre code à 4 chiffres. Pour la démo, le code 1234 fonctionne toujours." :
                  "Création de votre dossier. Veuillez compléter prénom, nom, e-mail, adresse postale et précisions d'accès."} />
        </div>
        <p className="text-ink-600 mt-1 mb-6 text-base md:text-lg">
          {step === "phone" && "Aucun mot de passe à retenir. Nous vous envoyons un code à 4 chiffres par SMS."}
          {step === "code" && `Un code à 4 chiffres a été envoyé au ${maskedPhone}. Pour la démo, le code 1234 fonctionne toujours.`}
          {step === "profile" && "Pour éditer une facture conforme au crédit d'impôt et faciliter mon déplacement."}
        </p>
        {error && (
          <div role="alert" className="mb-5 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 font-semibold text-sm">{error}</div>
        )}

        {step === "phone" && (
          <div className="space-y-5">
            <Field label="Numéro de mobile" required hint="Format : 06 12 34 56 78"
              help="Saisissez le numéro de portable sur lequel vous recevrez le code de connexion à 4 chiffres.">
              <TextInput data-testid="auth-phone-input" inputMode="numeric" placeholder="06 12 34 56 78"
                value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} />
            </Field>
            <PrimaryButton testId="auth-send-code-btn" full onClick={submitPhone} icon={Send} loading={loading}>Recevoir mon code par SMS</PrimaryButton>
            <p className="text-xs text-ink-500 text-center">En continuant, vous acceptez nos conditions et notre politique de confidentialité.</p>
          </div>
        )}

        {step === "code" && (
          <div className="space-y-6">
            <div className="flex items-center justify-center gap-3">
              {code.map((d, i) => (
                <input key={i} data-testid={`auth-code-${i}`} ref={(el) => (codeRefs.current[i] = el)}
                  inputMode="numeric" maxLength={1} value={d}
                  onChange={(e) => onCodeChange(i, e.target.value)} onKeyDown={(e) => onCodeKeyDown(i, e)}
                  className="w-14 h-16 md:w-16 md:h-20 text-center text-3xl md:text-4xl font-black rounded-2xl border-2 border-ink-200 focus:border-brandPurple focus:outline-none bg-white text-ink-900" />
              ))}
            </div>
            <div className="text-center text-xs text-ink-500">
              Code de démo universel : <span className="ml-1 font-mono font-bold text-brandCyan">1234</span>
              {devCode && <span className="ml-2">(code dev : <span className="font-mono">{devCode}</span>)</span>}
            </div>
            <PrimaryButton testId="auth-verify-btn" full onClick={submitCode} icon={CheckCircle2} loading={loading}>Valider mon code</PrimaryButton>
            <button onClick={() => { setStep("phone"); setCode(["", "", "", ""]); setError(""); }} className="block mx-auto text-sm font-bold text-ink-600 hover:text-ink-900">
              Modifier mon numéro
            </button>
          </div>
        )}

        {step === "profile" && (
          <div className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Prénom" required><TextInput data-testid="profile-firstname" placeholder="Marie" value={profile.first_name} onChange={(e) => setProfile({ ...profile, first_name: e.target.value })} /></Field>
              <Field label="Nom" required><TextInput data-testid="profile-lastname" placeholder="Dupont" value={profile.last_name} onChange={(e) => setProfile({ ...profile, last_name: e.target.value })} /></Field>
            </div>
            <Field label="Adresse e-mail" required
              help="Utilisée pour vous envoyer votre devis et la facture conforme au crédit d'impôt.">
              <TextInput data-testid="profile-email" type="email" placeholder="marie.dupont@email.com" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
            </Field>
            <Field label="Adresse postale complète" required hint="Tapez les premières lettres, les suggestions apparaissent automatiquement"
              help="Sélectionnez votre adresse dans la liste qui s'ouvre pour éviter les erreurs de saisie.">
              <AddressAutocomplete testId="profile-address" value={profile.address} onChange={(v) => setProfile({ ...profile, address: v })} placeholder="Tapez : ex. '43 Rue Molière, Lyon'…" />
            </Field>
            <Field label="Précisions d'accès" hint="Bâtiment, étage, digicode, stationnement…"
              help="Ces précisions m'aident à arriver chez vous sans perdre de temps : code de l'immeuble, étage, ascenseur, ou place de parking visiteur.">
              <TextArea data-testid="profile-access" placeholder="Bâtiment B, 3e étage, digicode 1234A…" value={profile.access_details} onChange={(e) => setProfile({ ...profile, access_details: e.target.value })} />
            </Field>
            <PrimaryButton testId="profile-submit-btn" full onClick={submitProfile} icon={ArrowRight} loading={loading}>Créer mon dossier et continuer</PrimaryButton>
          </div>
        )}
      </Card>
    </main>
  );
};

/* ===================================================================
   Booking Wizard (DayPicker, AM/PM, step names, summary recap)
   =================================================================== */

const DEVICES = [
  { id: "pc", label: "Ordinateur (Mac/PC)", icon: Laptop, desc: "Lenteurs, virus, sauvegarde, mises à jour…" },
  { id: "mobile", label: "Smartphone & Tablette", icon: Smartphone, desc: "Photos, e-mails, applications, paramétrages…" },
  { id: "box", label: "Internet & Périphériques", icon: Wifi, desc: "Box, Wi-Fi, imprimante, TV connectée…" },
  { id: "security", label: "Comptes & Sécurité", icon: Lock, desc: "Mots de passe, arnaques, mails frauduleux…" },
];
const SYMPTOMS = {
  pc: ["Mon ordinateur est très lent", "Je n'arrive plus à imprimer", "Je voudrais sauvegarder mes photos", "Une fenêtre rouge s'affiche tout le temps"],
  mobile: ["Je ne reçois plus mes e-mails", "Je voudrais transférer mes contacts", "Mes photos prennent trop de place", "Je n'arrive pas à installer une application"],
  box: ["Le Wi-Fi ne fonctionne plus", "Ma box clignote en rouge", "L'imprimante n'imprime plus", "La télé ne se connecte plus à internet"],
  security: ["J'ai cliqué sur un lien suspect", "Je ne retrouve plus mon mot de passe", "Je voudrais sécuriser mes comptes", "On me demande de l'argent par e-mail"],
};

const BookingWizard = ({ draft, setDraft, onSubmit, onCgvOpen, submitting }) => {
  const [step, setStep] = useState(1);
  const [cgvAccepted, setCgvAccepted] = useState(false);
  const canNext1 = !!draft.device_id;
  const canNext2 = (draft.symptom || "").trim().length >= 3;
  const canNext3 = !!draft.date && !!draft.time_window;
  const selectedDevice = DEVICES.find((d) => d.id === draft.device_id);
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Card>
          <div className="flex items-start justify-between gap-3 mb-2">
            <Badge tone="green" icon={ShieldCheck}>Déplacement à votre domicile (50% SAP)</Badge>
            <span className="text-sm font-bold text-ink-500">Étape {step}/3</span>
          </div>
          <StepIndicator step={step} />

          {step === 1 && (
            <section className="animate-fade-in-up">
              <div className="flex items-start gap-3">
                <h3 className="text-2xl md:text-3xl font-extrabold text-ink-900">Quel appareil nécessite mon intervention&nbsp;?</h3>
                <SpeakButton className="ml-auto mt-1" text="Quel appareil nécessite mon intervention ? Sélectionnez la catégorie principale. Quatre choix : Ordinateur Mac ou PC, Smartphone et tablette, Internet et périphériques, ou Comptes et sécurité." />
              </div>
              <p className="mt-2 text-ink-600">Sélectionnez la catégorie principale pour préparer mon déplacement.</p>
              <div className="mt-6 grid sm:grid-cols-2 gap-3">
                {DEVICES.map((d) => {
                  const Icon = d.icon; const active = draft.device_id === d.id;
                  return (
                    <button key={d.id} data-testid={`device-${d.id}`} onClick={() => setDraft({ ...draft, device_id: d.id })}
                      className={cx("text-left rounded-2xl border-2 p-5 bg-white card-hover transition-all", active ? "border-brandPurple shadow-ring" : "border-ink-200 hover:border-ink-300")}>
                      <div className="flex items-center gap-4">
                        <div className={cx("w-12 h-12 rounded-xl flex items-center justify-center border-2", active ? "border-brandPurple bg-brandPurple-soft text-brandPurple" : "border-ink-200 bg-ink-50 text-ink-700")}><Icon className="w-6 h-6" /></div>
                        <div className="flex-1">
                          <div className="font-extrabold text-ink-900 text-lg">{d.label}</div>
                          <div className="text-sm text-ink-500 mt-0.5">{d.desc}</div>
                        </div>
                        {active && <Check className="w-6 h-6 text-brandPurple" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="animate-fade-in-up">
              <div className="flex items-start gap-3">
                <h3 className="text-2xl md:text-3xl font-extrabold text-ink-900">Décrivez ce qui ne va pas, simplement.</h3>
                <SpeakButton className="ml-auto mt-1" text="Décrivez ce qui ne va pas, simplement. Expliquez avec vos mots, pas besoin de termes techniques. Vous pouvez aussi cliquer sur l'une des suggestions ci-dessous." />
              </div>
              <p className="mt-2 text-ink-600">Expliquez avec vos mots, comme à un proche. Pas besoin de termes techniques.</p>
              <div className="mt-6">
                <Field label="Votre situation" required hint="Ex. : « Mon ordinateur est lent et fait du bruit. »">
                  <TextArea data-testid="symptom-textarea" placeholder="Racontez ce qui se passe…" value={draft.symptom || ""} onChange={(e) => setDraft({ ...draft, symptom: e.target.value })} />
                </Field>
                <div className="mt-5">
                  <div className="text-sm font-bold text-ink-700 mb-2">Suggestions adaptées à « {selectedDevice?.label} »</div>
                  <div className="flex flex-wrap gap-2">
                    {(SYMPTOMS[draft.device_id] || []).map((s, i) => (
                      <button key={i} data-testid={`symptom-suggestion-${i}`} onClick={() => setDraft({ ...draft, symptom: s })}
                        className="px-3 py-2 rounded-full border-2 border-ink-200 bg-white text-ink-700 text-sm font-semibold hover:border-brandPurple hover:text-brandPurple">+ {s}</button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="animate-fade-in-up">
              <div className="flex items-start gap-3">
                <h3 className="text-2xl md:text-3xl font-extrabold text-ink-900">Choisissez votre créneau</h3>
                <SpeakButton className="ml-auto mt-1" text="Choisissez votre créneau. Nous nous engageons sur une plage horaire, jamais une heure exacte. Sélectionnez d'abord la date dans le calendrier puis la plage horaire du matin ou de l'après-midi." />
              </div>
              <p className="mt-2 text-ink-600">Plage horaire (jamais une heure exacte) pour respecter votre tranquillité.</p>
              <div className="mt-6 grid md:grid-cols-2 gap-5">
                <Field label="Date souhaitée" required hint="Du lundi au samedi, jusqu'à 60 jours"
                  help="Cliquez sur le jour souhaité. Les dimanches et jours passés sont indisponibles.">
                  <DatePickerLBC testId="booking-date-picker" value={draft.date || ""} onChange={(v) => setDraft({ ...draft, date: v })} />
                </Field>
                <Field label="Plage horaire" required
                  help="Choisissez entre matin (8h-12h) et après-midi (14h-18h). Une plage d'une heure : Jordan arrive à l'intérieur de ce créneau.">
                  <TimeWindowPicker value={draft.time_window} onChange={(tw) => setDraft({ ...draft, time_window: tw })} />
                </Field>
              </div>
              {draft.date && draft.time_window && (
                <div className="mt-6 rounded-2xl bg-brandPurple-soft border border-brandPurple/30 p-4 flex items-center gap-3">
                  <PartyPopper className="w-5 h-5 text-brandPurple" />
                  <div className="text-ink-800">Récapitulatif&nbsp;: <span className="font-bold">{formatDateFR(draft.date)}</span> entre <span className="font-bold">{draft.time_window}</span>.</div>
                </div>
              )}
            </section>
          )}

          <div className="mt-8 flex items-center justify-between gap-3">
            <button data-testid="wizard-back" onClick={() => step > 1 && setStep(step - 1)} disabled={step === 1}
              className={cx("inline-flex items-center gap-1 font-bold text-ink-600 hover:text-ink-900", step === 1 && "opacity-40 cursor-not-allowed")}>
              <ChevronLeft className="w-5 h-5" /> Précédent
            </button>
            {step < 3 ? (
              <PrimaryButton testId="wizard-next" onClick={() => setStep(step + 1)} disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2)} icon={ChevronRight}>Continuer</PrimaryButton>
            ) : (
              <span className="text-sm font-bold text-ink-800 inline-flex items-center gap-1.5"><ArrowRight className="w-4 h-4 text-brandCyan" />Validez votre devis dans le panneau ci-contre</span>
            )}
          </div>
        </Card>
      </div>

      <aside className="lg:col-span-1">
        <div className="sticky top-32">
          <Card className="!p-6 bg-ink-800 text-white border-ink-800 !shadow-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-brandCyan"><CreditCard className="w-5 h-5" /><span className="text-sm font-bold uppercase tracking-wide">Devis indicatif</span></div>
              <Badge tone="cyan">SAP</Badge>
            </div>
            <div className="mt-5 flex items-center justify-between text-white/80">
              <span>Tarif horaire de base</span><span className="font-bold text-white">{HOURLY_BASE}€/h</span>
            </div>
            {selectedDevice && <div className="mt-3 rounded-xl border border-white/15 bg-white/5 px-4 py-3 flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-brandPurple" /><span className="text-white">{selectedDevice.label}</span></div>}
            <div className="mt-4 rounded-xl bg-sapGreen/15 border-l-4 border-sapGreen px-4 py-3">
              <div className="font-bold text-sapGreen flex items-center gap-2"><ShieldCheck className="w-5 h-5" />Avantage Fiscal SAP</div>
              <p className="text-sm text-white/85 mt-1">L'État déduit automatiquement 50% du montant de cette facture de vos impôts.</p>
            </div>

            {/* Item #11 — Récap synthétique avant validation */}
            {(draft.symptom || draft.date || draft.time_window) && (
              <div className="mt-4 rounded-xl border border-white/15 bg-white/5 p-4 space-y-1.5 text-sm">
                <div className="text-white/70 uppercase tracking-wide font-bold text-xs mb-1">Récapitulatif</div>
                {draft.symptom && <div className="text-white/90">📝 « {draft.symptom.length > 60 ? draft.symptom.slice(0, 57) + "…" : draft.symptom} »</div>}
                {draft.date && <div className="text-white/90">📅 <span className="font-bold capitalize">{formatDateFR(draft.date)}</span></div>}
                {draft.time_window && <div className="text-white/90">🕐 Entre <span className="font-bold">{draft.time_window}</span></div>}
              </div>
            )}

            <div className="mt-6 flex items-end justify-between">
              <span className="text-white/80 text-sm">Votre coût net final</span>
              <div className="text-5xl font-black text-brandCyan leading-none">{HOURLY_NET}<span className="text-2xl text-white/80">€/h</span></div>
            </div>
            <label className="mt-6 flex items-start gap-3 cursor-pointer select-none">
              <input data-testid="cgv-checkbox" type="checkbox" checked={cgvAccepted} onChange={(e) => setCgvAccepted(e.target.checked)} className="mt-1 w-5 h-5 accent-brandCyan" />
              <span className="text-sm text-white/90">J'accepte les <button type="button" onClick={onCgvOpen} className="underline font-bold text-brandCyan hover:text-brandCyan-light">CGV</button> et la politique d'annulation.</span>
            </label>
            <button data-testid="validate-booking-btn" onClick={() => onSubmit(cgvAccepted)}
              disabled={!canNext1 || !canNext2 || !canNext3 || !cgvAccepted || submitting}
              className={cx("mt-5 w-full inline-flex items-center justify-between gap-2 px-5 py-3.5 rounded-xl font-bold",
                !canNext1 || !canNext2 || !canNext3 || !cgvAccepted ? "bg-white/10 text-white/40 cursor-not-allowed" : "bg-brandCyan text-ink-900 hover:bg-brandCyan-light")}>
              <span>{submitting ? "Validation…" : "Valider ma réservation"}</span>
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
            </button>
            <p className="text-xs text-white/60 mt-3 text-center">Devis sans engagement · Annulable jusqu'à 24h avant</p>
          </Card>
        </div>
      </aside>
    </div>
  );
};

/* ===================================================================
   Suivi / Factures / Dashboard
   =================================================================== */

const PREP_CHECKLIST = [
  "Préparer les identifiants (Wi-Fi, e-mail) sur un papier",
  "Brancher l'appareil concerné sur secteur",
  "Libérer un espace de travail (table, chaise)",
  "Avoir votre pièce d'identité à portée de main",
  "Vérifier le digicode et le stationnement",
];

const DeviceAvatar = ({ deviceId, className }) => {
  const map = { pc: { Icon: Laptop, tone: "bg-brandCyan-soft text-brandCyan" }, mobile: { Icon: Smartphone, tone: "bg-brandPurple-soft text-brandPurple" }, box: { Icon: Wifi, tone: "bg-amber-50 text-amber-700" }, security: { Icon: Lock, tone: "bg-rose-50 text-rose-700" } };
  const entry = map[deviceId] || { Icon: Wrench, tone: "bg-ink-100 text-ink-700" };
  const Icon = entry.Icon;
  return <div className={cx("w-10 h-10 rounded-lg inline-flex items-center justify-center", entry.tone, className)}><Icon className="w-5 h-5" /></div>;
};

const Suivi = ({ booking, onAskCancel, onPrepUpdate }) => {
  if (!booking) {
    return (
      <Card className="text-center">
        <CalendarDays className="w-10 h-10 text-ink-400 mx-auto" />
        <h3 className="mt-3 text-2xl font-extrabold text-ink-900">Aucune intervention prévue</h3>
        <p className="mt-2 text-ink-600">Réservez un créneau depuis l'onglet « Réserver » pour suivre votre intervention ici.</p>
      </Card>
    );
  }
  const device = DEVICES.find((d) => d.id === booking.device_id);
  const prep = booking.prep_checklist || {};
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <DeviceAvatar deviceId={booking.device_id} />
              <div>
                <Badge tone="cyan" icon={TimerReset}>Intervention confirmée</Badge>
                <div className="mt-2 flex items-start gap-3">
                  <h3 className="text-2xl md:text-3xl font-extrabold text-ink-900">{device?.label}</h3>
                  <SpeakButton text={`Intervention confirmée. ${device?.label}. Référence ${booking.ref}. Rendez-vous prévu ${formatDateFR(booking.date)} entre ${booking.time_window}. Adresse : ${booking.address}. Votre demande : ${booking.symptom}`} />
                </div>
                <p className="mt-1 text-ink-600">Réf. {booking.ref}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-ink-500 font-bold">Quand ?</div>
              <div className="font-extrabold text-ink-900 capitalize">{formatDateFR(booking.date)}</div>
              <div className="text-brandCyan font-bold">{booking.time_window}</div>
            </div>
          </div>
          <div className="mt-5 grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl bg-ink-50 p-4"><div className="text-xs uppercase tracking-wide text-ink-500 font-bold">Adresse</div><div className="mt-1 font-bold text-ink-900 inline-flex items-start gap-2"><MapPin className="w-4 h-4 mt-1 text-brandCyan" /><span>{booking.address}</span></div></div>
            <div className="rounded-xl bg-ink-50 p-4"><div className="text-xs uppercase tracking-wide text-ink-500 font-bold">Précisions d'accès</div><div className="mt-1 text-ink-800">{booking.access_details || "—"}</div></div>
          </div>
          <div className="mt-5 rounded-xl border border-ink-200 p-4"><div className="text-xs uppercase tracking-wide text-ink-500 font-bold">Votre demande</div><p className="mt-1 text-ink-800">« {booking.symptom} »</p></div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-2">
            <ListChecks className="w-5 h-5 text-brandPurple" />
            <h3 className="text-xl md:text-2xl font-extrabold text-ink-900">Préparer ma visite</h3>
            <SpeakButton className="ml-auto" size="sm" text={"Préparer ma visite. " + PREP_CHECKLIST.join(". ")} />
          </div>
          <p className="text-ink-600 mb-4">Cochez chaque étape pour me faciliter le travail le jour J.</p>
          <ul className="space-y-2">
            {PREP_CHECKLIST.map((item, i) => {
              const done = !!prep[i];
              return (
                <li key={i}>
                  <button data-testid={`prep-item-${i}`} onClick={() => onPrepUpdate({ ...prep, [i]: !done })}
                    className={cx("w-full text-left rounded-xl border-2 px-4 py-3 flex items-center gap-3", done ? "border-sapGreen/50 bg-sapGreen-soft" : "border-ink-200 bg-white hover:border-ink-300")}>
                    <span className={cx("w-6 h-6 rounded-md border-2 flex items-center justify-center", done ? "bg-sapGreen border-sapGreen text-white" : "border-ink-300 bg-white")}>{done && <Check className="w-4 h-4" />}</span>
                    <span className={cx("font-semibold", done ? "text-sapGreen line-through" : "text-ink-800")}>{item}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <aside className="space-y-6">
        <Card>
          <h4 className="text-lg font-extrabold text-ink-900">Annulation gratuite</h4>
          <p className="mt-1 text-sm text-ink-600">Annulation sans frais jusqu'à 24h avant.</p>
          <button data-testid="cancel-booking-btn" onClick={onAskCancel}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-red-200 bg-red-50 text-red-700 font-bold hover:bg-red-100">
            <XCircle className="w-5 h-5" />Annuler mon rendez-vous
          </button>
        </Card>
        <Card>
          <h4 className="text-lg font-extrabold text-ink-900">Besoin d'aide&nbsp;?</h4>
          <p className="mt-1 text-sm text-ink-600">Jordan est joignable du lundi au samedi.</p>
          <a href={`tel:${SVI_TEL}`} className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-ink-800 text-white font-bold hover:bg-ink-900">
            <Phone className="w-5 h-5 text-brandCyan" />{SVI_PHONE}
          </a>
        </Card>
      </aside>
    </div>
  );
};

const InvoiceList = ({ invoices, onDownload, onPay, payingId, downloadingId, loading }) => (
  <Card>
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <h3 className="text-2xl font-extrabold text-ink-900">Mes factures SAP</h3>
        <SpeakButton size="sm" text={"Mes factures Service à la Personne. " + (invoices.length === 0 ? "Aucune facture pour le moment." : invoices.map((i) => `${i.label}. Net ${i.net_total} euros, ${i.paid ? "payée" : "à régler"}.`).join(" "))} />
      </div>
      <Badge tone="green" icon={ShieldCheck}>Conformes crédit d'impôt</Badge>
    </div>
    {loading ? (<div className="space-y-3">{[1, 2, 3].map((i) => <SkeletonCard key={i} />)}</div>) : (
      <div className="divide-y divide-ink-200">
        {invoices.length === 0 && <p className="text-ink-600 py-6 text-center">Aucune facture pour le moment.</p>}
        {invoices.map((inv) => (
          <div key={inv.id} className="py-4 grid md:grid-cols-12 items-center gap-3">
            <div className="md:col-span-5 flex items-center gap-3">
              <DeviceAvatar deviceId={inv.device_id || "pc"} />
              <div><div className="font-extrabold text-ink-900">{inv.label}</div><div className="text-sm text-ink-500">{inv.ref} · {new Date(inv.date).toLocaleDateString("fr-FR")}</div></div>
            </div>
            <div className="md:col-span-3 flex md:justify-center"><div className="text-sm text-ink-500"><span className="font-bold text-ink-800">{inv.hours}h</span> · brut <span className="line-through">{inv.base_total}€</span> <span className="font-bold text-brandCyan">net {inv.net_total}€</span></div></div>
            <div className="md:col-span-2">{inv.paid ? <Badge tone="green" icon={CheckCircle2}>Payée</Badge> : <Badge tone="purple" icon={TimerReset}>À régler</Badge>}</div>
            <div className="md:col-span-2 flex md:justify-end gap-2">
              {!inv.paid && (
                <button data-testid={`pay-${inv.id}`} onClick={() => onPay(inv.id)} disabled={payingId === inv.id}
                  className="px-3 py-2 rounded-lg bg-ink-800 text-white text-sm font-bold hover:bg-ink-900 disabled:opacity-50">{payingId === inv.id ? "…" : "Régler"}</button>
              )}
              <button data-testid={`download-${inv.id}`} onClick={() => onDownload(inv)} disabled={downloadingId === inv.id}
                className="px-3 py-2 rounded-lg border-2 border-ink-200 text-ink-800 text-sm font-bold hover:border-ink-300 inline-flex items-center gap-1 disabled:opacity-50">
                {downloadingId === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} PDF
              </button>
            </div>
          </div>
        ))}
      </div>
    )}
    <p className="mt-6 text-sm text-ink-500">PDF avec mention « Service à la Personne », pour votre déclaration d'impôts (case 7DB).</p>
  </Card>
);

const Dashboard = ({ user, booking, draftBooking, setDraftBooking, onSubmitBooking, onAskCancel, onPrepUpdate, onCgvOpen, invoices, onDownloadInvoice, onPayInvoice, payingId, downloadingId, submittingBooking, loadingInvoices }) => {
  const [tab, setTab] = useState(booking ? "suivi" : "booking");
  const tabs = [
    { id: "booking", label: "Réserver", icon: CalendarDays },
    { id: "suivi", label: "Suivi", icon: ListChecks },
    { id: "factures", label: "Factures", icon: FileText },
    { id: "compte", label: "Mon compte", icon: User },
  ];
  return (
    <main id="main-content" className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-12 pb-24 md:pb-12">
      <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-3 animate-fade-in-up">
        <div>
          <div className="text-ink-500 font-bold">Bonjour, {user.first_name} 👋</div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-ink-900">Mon Espace Client</h2>
        </div>
      </div>
      <div role="tablist" className="bg-white rounded-2xl border border-ink-200 p-1.5 inline-flex flex-wrap gap-1 mb-6">
        {tabs.map((t) => {
          const Icon = t.icon; const active = tab === t.id;
          return (
            <button key={t.id} data-testid={`tab-${t.id}`} onClick={() => setTab(t.id)}
              className={cx("inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm md:text-base font-bold", active ? "bg-ink-800 text-white" : "text-ink-700 hover:bg-ink-100")}>
              <Icon className="w-4 h-4" />{t.label}
            </button>
          );
        })}
      </div>
      <div className="animate-fade-in-up">
        {tab === "booking" && <BookingWizard draft={draftBooking} setDraft={setDraftBooking} onSubmit={(cgv) => onSubmitBooking(cgv).then((ok) => ok && setTab("suivi"))} onCgvOpen={onCgvOpen} submitting={submittingBooking} />}
        {tab === "suivi" && <Suivi booking={booking} onAskCancel={onAskCancel} onPrepUpdate={onPrepUpdate} />}
        {tab === "factures" && <InvoiceList invoices={invoices} onDownload={onDownloadInvoice} onPay={onPayInvoice} payingId={payingId} downloadingId={downloadingId} loading={loadingInvoices} />}
        {tab === "compte" && (
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-2xl font-extrabold text-ink-900">Mon dossier</h3>
              <SpeakButton size="sm" text={`Mon dossier. Identité : ${user.first_name} ${user.last_name}. Email : ${user.email}. Téléphone : ${user.phone}. Adresse : ${user.address}.`} />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-xl bg-ink-50 p-4">
                <div className="text-xs uppercase tracking-wide text-ink-500 font-bold">Identité</div>
                <div className="mt-1 font-bold text-ink-900">{user.first_name} {user.last_name}</div>
                <div className="text-ink-600 text-sm inline-flex items-center gap-1.5 mt-1"><Mail className="w-4 h-4 text-brandCyan" /> {user.email}</div>
                <div className="text-ink-600 text-sm inline-flex items-center gap-1.5 mt-1"><Phone className="w-4 h-4 text-brandCyan" /> {user.phone}</div>
              </div>
              <div className="rounded-xl bg-ink-50 p-4">
                <div className="text-xs uppercase tracking-wide text-ink-500 font-bold">Adresse</div>
                <div className="mt-1 inline-flex items-start gap-2 text-ink-900 font-bold"><MapPin className="w-4 h-4 mt-1 text-brandCyan" /><span>{user.address}</span></div>
                <div className="text-ink-600 text-sm mt-2"><span className="font-bold text-ink-700">Accès :</span> {user.access_details || "—"}</div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
};

/* ===================================================================
   Lumi chatbot + CGV (kept similar)
   =================================================================== */

const FAQ = [
  { q: "Comment se déroule une intervention à domicile ?", a: "Jordan vient chez vous au créneau choisi. Il écoute votre besoin, diagnostique sans jargon, intervient et vous explique simplement. Une facture conforme SAP vous est envoyée par e-mail." },
  { q: "Comment fonctionne le crédit d'impôt (SAP) ?", a: "L'État rembourse 50% du montant via crédit d'impôt — y compris si vous n'êtes pas imposable. La facture indique automatiquement ce qu'il faut déclarer (case 7DB)." },
  { q: "Comment et quand dois-je payer ?", a: "Le paiement s'effectue après l'intervention, par carte, virement ou chèque CESU. Aucune avance n'est demandée." },
  { q: "Puis-je annuler mon rendez-vous ?", a: "Oui, gratuitement jusqu'à 24h avant le rendez-vous depuis l'onglet « Suivi ». Au-delà, contactez-nous au numéro indiqué." },
];

const Lumi = ({ open, setOpen, isAuthed, onContactJordan }) => {
  const [view, setView] = useState("menu"); const [activeFaq, setActiveFaq] = useState(null);
  const [message, setMessage] = useState(""); const [sending, setSending] = useState(false);
  useEffect(() => { if (!open) setTimeout(() => { setView("menu"); setActiveFaq(null); setMessage(""); }, 200); }, [open]);
  const send = async () => { setSending(true); try { await onContactJordan(message); setView("sent"); } catch { } finally { setSending(false); } };
  return (
    <>
      <button data-testid="lumi-toggle" onClick={() => setOpen(!open)} aria-label="Ouvrir l'assistant Lumi"
        className={cx("fixed bottom-20 right-5 md:bottom-8 md:right-8 z-40 w-14 h-14 md:w-16 md:h-16 rounded-full bg-white border-2 border-ink-200 shadow-card flex items-center justify-center", open ? "rotate-90" : "hover:scale-105 lumi-bulb-pulse")}>
        {open ? <X className="w-6 h-6 text-ink-700" /> : <Lightbulb className="w-7 h-7 text-brandPurple" />}
      </button>
      {open && (
        <div className="fixed inset-0 z-30 flex items-end md:items-center justify-center md:justify-end p-3 md:p-8 pointer-events-none">
          <div className="w-full max-w-md pointer-events-auto animate-pop-in">
            <div className="rounded-2xl border border-ink-200 bg-white shadow-card overflow-hidden">
              <div className="bg-ink-800 text-white px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2"><Lightbulb className="w-5 h-5 text-brandCyan" /><span className="font-extrabold">Assistant Lumi</span></div>
                <button data-testid="lumi-close" onClick={() => setOpen(false)} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-4 max-h-[70vh] overflow-y-auto">
                {view === "menu" && (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 mb-2">
                      <p className="text-ink-600 text-sm flex-1">Bonjour ! Choisissez une question ou contactez Jordan directement. Cliquez sur 🔊 pour entendre la réponse.</p>
                      <SpeakButton size="sm" text="Bonjour ! Choisissez une question ou contactez Jordan directement." />
                    </div>
                    {FAQ.map((f, i) => (
                      <div key={i} className="flex items-stretch gap-2">
                        <button data-testid={`faq-${i}`} onClick={() => { setActiveFaq(i); setView("answer"); }} className="flex-1 text-left rounded-xl border-2 border-ink-200 px-4 py-3 hover:border-brandPurple">
                          <span className="font-bold text-ink-800">{f.q}</span>
                        </button>
                        <div className="flex items-center"><SpeakButton text={`${f.q} ${f.a}`} label={`Écouter la réponse à : ${f.q}`} /></div>
                      </div>
                    ))}
                    <button data-testid="contact-jordan-btn" onClick={() => setView("contact")} disabled={!isAuthed}
                      className={cx("w-full mt-2 text-left rounded-xl border-2 px-4 py-3", isAuthed ? "border-brandCyan/40 bg-brandCyan-soft hover:border-brandCyan" : "border-ink-200 bg-ink-50 opacity-60 cursor-not-allowed")}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-brandCyan">Ma question n'est pas dans la liste (Contacter Jordan)</span>
                        <ArrowRight className="w-4 h-4 text-brandCyan" />
                      </div>
                      {!isAuthed && <p className="mt-1 text-xs text-ink-500">Connectez-vous pour envoyer un message à Jordan.</p>}
                    </button>
                  </div>
                )}
                {view === "answer" && activeFaq !== null && (
                  <div className="animate-fade-in">
                    <button onClick={() => setView("menu")} className="text-sm font-bold text-ink-600 hover:text-ink-900 inline-flex items-center gap-1 mb-3"><ChevronLeft className="w-4 h-4" /> Retour</button>
                    <div className="flex items-start gap-3"><h4 className="font-extrabold text-ink-900 text-lg flex-1">{FAQ[activeFaq].q}</h4><SpeakButton text={`${FAQ[activeFaq].q} ${FAQ[activeFaq].a}`} /></div>
                    <p className="mt-2 text-ink-700 leading-relaxed">{FAQ[activeFaq].a}</p>
                    {isAuthed && <button onClick={() => setView("contact")} className="mt-4 inline-flex items-center gap-2 text-brandCyan font-bold hover:text-brandPurple"><HelpCircle className="w-4 h-4" />Cela ne répond pas — contacter Jordan</button>}
                  </div>
                )}
                {view === "contact" && (
                  <div className="animate-fade-in space-y-4">
                    <button onClick={() => setView("menu")} className="text-sm font-bold text-ink-600 hover:text-ink-900 inline-flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> Retour</button>
                    <div><h4 className="font-extrabold text-ink-900 text-lg">Contacter Jordan</h4><p className="text-sm text-ink-600 mt-1">Décrivez votre besoin, Jordan vous répond sous 24h ouvrées.</p></div>
                    <TextArea data-testid="lumi-message-input" placeholder="Bonjour Jordan, …" value={message} onChange={(e) => setMessage(e.target.value)} />
                    <PrimaryButton testId="lumi-send-btn" full icon={Send} disabled={message.trim().length < 5} loading={sending} onClick={send}>Envoyer mon message</PrimaryButton>
                    <p className="text-xs text-ink-500 text-center">Ou appelez le {SVI_PHONE}</p>
                  </div>
                )}
                {view === "sent" && (
                  <div className="animate-fade-in text-center py-6">
                    <div className="w-14 h-14 rounded-full bg-sapGreen-soft text-sapGreen mx-auto flex items-center justify-center"><CheckCircle2 className="w-8 h-8" /></div>
                    <h4 className="mt-3 text-xl font-extrabold text-ink-900">Message envoyé !</h4>
                    <p className="mt-1 text-ink-600">Jordan a bien reçu votre demande. Réponse sous 24h ouvrées.</p>
                    <button onClick={() => setView("menu")} className="mt-4 text-brandCyan font-bold hover:text-brandPurple">Revenir au menu</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const CgvModal = ({ open, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-ink-900/60 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 md:p-8 animate-pop-in">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-2xl font-extrabold text-ink-900">Conditions Générales de Vente</h3>
          <button data-testid="cgv-close" onClick={onClose} className="p-2 rounded-lg hover:bg-ink-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="prose prose-sm max-w-none text-ink-700 leading-relaxed space-y-3">
          <p>Les présentes CGV régissent les services proposés par Le Bon Clic, agréé Service à la Personne. Tarif 80€/h, dont 50% sont déduits via crédit d'impôt (article 199 sexdecies du CGI).</p>
          <p><strong>Annulation.</strong> Gratuite jusqu'à 24h avant le rendez-vous. Au-delà, forfait de 20€.</p>
          <p><strong>Paiement.</strong> Après intervention, par carte, virement ou CESU. Facture conforme SAP par e-mail.</p>
          <p><strong>Données personnelles.</strong> Confidentielles, non revendues.</p>
        </div>
        <div className="mt-6 flex justify-end"><PrimaryButton onClick={onClose}>J'ai compris</PrimaryButton></div>
      </div>
    </div>
  );
};

/* ===================================================================
   App root
   =================================================================== */

function AppInner() {
  const [view, setView] = useState("landing");
  const [user, setUser] = useState(null);
  const [booking, setBooking] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [draftBooking, setDraftBooking] = useState({ device_id: "", symptom: "", date: "", time_window: "" });
  const [lumiOpen, setLumiOpen] = useState(false);
  const [cgvOpen, setCgvOpen] = useState(false);
  const [cookieAck, setCookieAck] = useState(() => localStorage.getItem(STORAGE_COOKIES));
  const [toast, setToast] = useState(null);
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [payingId, setPayingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  const fetchAll = useCallback(async () => {
    setLoadingInvoices(true);
    try {
      const [me, b, inv] = await Promise.all([api.get("/me"), api.get("/bookings/active"), api.get("/invoices")]);
      setUser(me.data); setBooking(b.data || null); setInvoices(inv.data.invoices || []); setView("dashboard");
    } catch { localStorage.removeItem(STORAGE_TOKEN); localStorage.removeItem(STORAGE_USER); setView("landing"); setUser(null); }
    finally { setLoadingInvoices(false); }
  }, []);

  useEffect(() => { const t = localStorage.getItem(STORAGE_TOKEN); if (t) fetchAll(); }, [fetchAll]);

  const startAuth = () => setView("auth");
  const goHome = () => setView(user ? "dashboard" : "landing");
  const onAuthenticated = async (u) => { setUser(u); await fetchAll(); showToast(`Bienvenue ${u.first_name} !`); };
  const onLogout = () => { localStorage.removeItem(STORAGE_TOKEN); localStorage.removeItem(STORAGE_USER); setUser(null); setBooking(null); setInvoices([]); setDraftBooking({ device_id: "", symptom: "", date: "", time_window: "" }); setView("landing"); showToast("À bientôt !"); };

  const onSubmitBooking = async (cgvAccepted) => {
    if (!cgvAccepted) return false;
    setSubmittingBooking(true);
    try { const { data } = await api.post("/bookings", { ...draftBooking, cgv_accepted: true }); setBooking(data); setDraftBooking({ device_id: "", symptom: "", date: "", time_window: "" }); showToast("Réservation confirmée 🎉"); return true; }
    catch (e) { showToast(e.response?.data?.detail || "Erreur lors de la création."); return false; }
    finally { setSubmittingBooking(false); }
  };
  const askCancel = () => setConfirmCancel(true);
  const doCancel = async () => {
    setConfirmCancel(false);
    if (!booking) return;
    try { await api.post(`/bookings/${booking.id}/cancel`); setBooking(null); showToast("Rendez-vous annulé"); }
    catch (e) { showToast(e.response?.data?.detail || "Erreur."); }
  };
  const onPrepUpdate = async (prep) => {
    if (!booking) return;
    setBooking({ ...booking, prep_checklist: prep });
    try { await api.patch(`/bookings/${booking.id}`, { prep_checklist: prep }); } catch { }
  };
  const onDownloadInvoice = async (inv) => {
    setDownloadingId(inv.id);
    try {
      const r = await api.get(`/invoices/${inv.id}/pdf`, { responseType: "blob" });
      const blob = new Blob([r.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${inv.ref || inv.id}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      showToast(`Facture ${inv.ref} téléchargée`);
    } catch (e) { showToast(e.response?.data?.detail || "Erreur téléchargement."); }
    finally { setDownloadingId(null); }
  };
  const onPayInvoice = async (id) => {
    setPayingId(id);
    try { const { data } = await api.post(`/invoices/${id}/pay`); setInvoices((arr) => arr.map((i) => (i.id === id ? data : i))); showToast("Paiement enregistré"); }
    catch (e) { showToast(e.response?.data?.detail || "Erreur paiement."); }
    finally { setPayingId(null); }
  };
  const onContactJordan = async (message) => { await api.post("/contact", { message, context: "lumi" }); };

  const acceptCookies = () => { localStorage.setItem(STORAGE_COOKIES, "ok"); setCookieAck("ok"); };
  const rejectCookies = () => { localStorage.setItem(STORAGE_COOKIES, "no"); setCookieAck("no"); };

  return (
    <div className="app-shell">
      <SkipLink />
      <Header user={user} onLogout={onLogout} onGoHome={goHome} />

      {view === "landing" && <Landing onStartAuth={startAuth} />}
      {view === "auth" && <AuthFlow onCancel={() => setView(user ? "dashboard" : "landing")} onAuthenticated={onAuthenticated} />}
      {view === "dashboard" && user && (
        <Dashboard user={user} booking={booking} draftBooking={draftBooking} setDraftBooking={setDraftBooking}
          onSubmitBooking={onSubmitBooking} onAskCancel={askCancel} onPrepUpdate={onPrepUpdate} onCgvOpen={() => setCgvOpen(true)}
          invoices={invoices} onDownloadInvoice={onDownloadInvoice} onPayInvoice={onPayInvoice}
          payingId={payingId} downloadingId={downloadingId} submittingBooking={submittingBooking} loadingInvoices={loadingInvoices} />
      )}

      <footer className="mt-12 border-t border-ink-200 bg-white pb-20 md:pb-0">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 grid md:grid-cols-3 gap-6">
          <div><Logo size="sm" /><p className="mt-3 text-sm text-ink-600 max-w-xs">L'expertise informatique, sereinement, à votre domicile.</p></div>
          <div><h5 className="text-sm uppercase font-bold text-ink-500 tracking-wide">Assistance &amp; Contact</h5>
            <ul className="mt-2 space-y-1 text-ink-700">
              <li className="inline-flex items-center gap-2"><Phone className="w-4 h-4 text-brandCyan" /> {SVI_PHONE}</li>
              <li className="inline-flex items-center gap-2"><Mail className="w-4 h-4 text-brandCyan" /> contact@lebonclic.tech</li>
              <li className="inline-flex items-center gap-2"><Home className="w-4 h-4 text-brandCyan" /> Lyon &amp; Métropole</li>
            </ul></div>
          <div><h5 className="text-sm uppercase font-bold text-ink-500 tracking-wide">Légal &amp; transparence</h5>
            <ul className="mt-2 space-y-1 text-ink-700">
              <li><button onClick={() => setCgvOpen(true)} className="hover:underline">Conditions Générales de Vente</button></li>
              <li>Mentions légales</li><li>Politique de confidentialité</li><li>Agrément Service à la Personne</li>
            </ul></div>
        </div>
        <div className="bg-ink-50 py-3 text-center text-xs text-ink-500">© {new Date().getFullYear()} Le Bon Clic — Tous droits réservés.</div>
      </footer>

      <Lumi open={lumiOpen} setOpen={setLumiOpen} isAuthed={!!user} onContactJordan={onContactJordan} />
      <CgvModal open={cgvOpen} onClose={() => setCgvOpen(false)} />

      <ConfirmDialog
        open={confirmCancel}
        title="Confirmer l'annulation"
        message={booking ? `Vous allez annuler le rendez-vous du ${formatDateFR(booking.date)} entre ${booking.time_window}. Cette action est irréversible.` : ""}
        confirmLabel="Oui, annuler" cancelLabel="Garder le RDV" danger
        onConfirm={doCancel} onCancel={() => setConfirmCancel(false)} />

      <StickyMobileCall show={view === "landing"} />
      {!cookieAck && <CookieBanner onAccept={acceptCookies} onReject={rejectCookies} />}

      {toast && (
        <div className="fixed bottom-32 right-5 md:right-8 z-50 animate-slide-up">
          <div className="bg-ink-800 text-white rounded-xl px-4 py-3 shadow-card font-bold inline-flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-brandCyan" />{toast}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() { return (<A11yProvider><AppInner /></A11yProvider>); }
