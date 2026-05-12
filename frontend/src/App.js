import React, { useState, useEffect, useRef, useCallback } from "react";
import "@/App.css";
import axios from "axios";
import {
  Lightbulb,
  Phone,
  User,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCircle2,
  ShieldCheck,
  Star,
  Laptop,
  Smartphone,
  Wifi,
  Lock,
  Calendar,
  Clock,
  FileText,
  Download,
  XCircle,
  ListChecks,
  MapPin,
  Mail,
  Hash,
  Send,
  X,
  ArrowRight,
  Quote,
  Sparkles,
  Type,
  HelpCircle,
  CalendarDays,
  CreditCard,
  TimerReset,
  PartyPopper,
  Home,
  LogOut,
  Loader2,
  Volume2,
  VolumeX,
  PauseCircle,
} from "lucide-react";

/* =========================================================
   Le Bon Clic SPA  —  Real backend (FastAPI) + Brevo SMS
   Single-file React app. Universal demo OTP: 1234
   ========================================================= */

const SVI_PHONE = "06 25 55 47 02";
const HOURLY_BASE = 80;
const HOURLY_NET = 40;

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STORAGE_TOKEN = "lbc_token_v2";
const STORAGE_USER = "lbc_user_v2";

// ---------- axios instance with bearer ----------
const api = axios.create({ baseURL: API });
api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem(STORAGE_TOKEN);
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

/* ---------- Tiny utility components ---------- */

const cx = (...xs) => xs.filter(Boolean).join(" ");

/* ---------- Speech synthesis (Web Speech API) ---------- */

const STORAGE_AUDIO = "lbc_audio_enabled_v1";

const SpeechContext = React.createContext({
  enabled: true,
  toggle: () => {},
  speak: () => {},
  stop: () => {},
  speakingId: null,
});

const SpeechProvider = ({ children }) => {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    const v = localStorage.getItem(STORAGE_AUDIO);
    return v === null ? true : v === "1";
  });
  const [speakingId, setSpeakingId] = useState(null);
  const utterRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_AUDIO, enabled ? "1" : "0");
    if (!enabled && supported) window.speechSynthesis.cancel();
  }, [enabled, supported]);

  // Cancel speech on unmount + page hide
  useEffect(() => {
    if (!supported) return;
    const handleHide = () => window.speechSynthesis.cancel();
    window.addEventListener("pagehide", handleHide);
    return () => {
      window.removeEventListener("pagehide", handleHide);
      window.speechSynthesis.cancel();
    };
  }, [supported]);

  const stop = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    setSpeakingId(null);
    utterRef.current = null;
  }, [supported]);

  const speak = useCallback(
    (text, id = "global") => {
      if (!supported || !enabled || !text) return;
      // Stop any current speech first
      window.speechSynthesis.cancel();
      const u = new window.SpeechSynthesisUtterance(text);
      u.lang = "fr-FR";
      u.rate = 0.95;
      u.pitch = 1.0;
      u.volume = 1.0;
      // Pick a French voice if available
      const voices = window.speechSynthesis.getVoices();
      const frVoice =
        voices.find((v) => v.lang === "fr-FR") ||
        voices.find((v) => v.lang && v.lang.startsWith("fr"));
      if (frVoice) u.voice = frVoice;
      u.onend = () => {
        setSpeakingId((curr) => (curr === id ? null : curr));
        utterRef.current = null;
      };
      u.onerror = () => {
        setSpeakingId(null);
        utterRef.current = null;
      };
      utterRef.current = u;
      setSpeakingId(id);
      window.speechSynthesis.speak(u);
    },
    [supported, enabled]
  );

  const toggle = useCallback(() => {
    setEnabled((v) => {
      if (v) {
        if (supported) window.speechSynthesis.cancel();
        setSpeakingId(null);
      }
      return !v;
    });
  }, [supported]);

  // Voices on Chromium load asynchronously - trigger getVoices() once
  useEffect(() => {
    if (supported && typeof window.speechSynthesis.onvoiceschanged !== "undefined") {
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }, [supported]);

  return (
    <SpeechContext.Provider value={{ enabled, toggle, speak, stop, speakingId, supported }}>
      {children}
    </SpeechContext.Provider>
  );
};

const useSpeech = () => React.useContext(SpeechContext);

// Per-element inline speaker button. Reads `text` aloud when clicked.
let _speakIdCounter = 0;
const SpeakButton = ({ text, label = "Lire à voix haute", size = "md", className }) => {
  const { speak, stop, speakingId, enabled, supported } = useSpeech();
  const idRef = useRef(null);
  if (idRef.current === null) {
    _speakIdCounter += 1;
    idRef.current = `spk-${_speakIdCounter}`;
  }
  if (!supported || !enabled) return null;
  const speaking = speakingId === idRef.current;
  const sizes = {
    sm: "w-7 h-7",
    md: "w-9 h-9",
    lg: "w-10 h-10",
  };
  const iconSizes = { sm: "w-4 h-4", md: "w-5 h-5", lg: "w-5 h-5" };
  return (
    <button
      type="button"
      onClick={() => (speaking ? stop() : speak(text, idRef.current))}
      aria-label={speaking ? "Arrêter la lecture" : label}
      aria-pressed={speaking}
      data-testid="speak-btn"
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full border-2 transition-all",
        sizes[size],
        speaking
          ? "border-brandCyan bg-brandCyan text-white animate-pulse-soft"
          : "border-brandCyan/40 bg-brandCyan-soft text-brandCyan hover:border-brandCyan hover:bg-brandCyan/15",
        className
      )}
      title={speaking ? "Arrêter la lecture" : label}
    >
      {speaking ? (
        <PauseCircle className={iconSizes[size]} />
      ) : (
        <Volume2 className={iconSizes[size]} />
      )}
    </button>
  );
};

// Heading wrapper that adds a SpeakButton aligned with the text
const SpokenHeading = ({ as: Tag = "h3", text, children, className, btnSize = "md" }) => (
  <div className="flex items-start gap-3">
    <Tag className={className}>{children}</Tag>
    <SpeakButton text={text || (typeof children === "string" ? children : "")} size={btnSize} />
  </div>
);

const Logo = ({ size = "md" }) => {
  const sizes = {
    sm: "text-xl",
    md: "text-2xl md:text-3xl",
    lg: "text-3xl md:text-4xl",
  };
  return (
    <div className="flex items-center gap-2 select-none">
      <span className={cx("font-extrabold tracking-tight text-ink-800", sizes[size])}>
        Le Bon Clic
      </span>
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
      {Icon && <Icon className="w-4 h-4 md:w-5 md:h-5" />}
      <span>{children}</span>
    </div>
  );
};

const PrimaryButton = ({ children, onClick, disabled, full, icon: Icon, type = "button", testId, loading }) => (
  <button
    type={type}
    data-testid={testId}
    onClick={onClick}
    disabled={disabled || loading}
    className={cx(
      "inline-flex items-center justify-center gap-2 px-5 md:px-6 py-3 md:py-3.5 rounded-xl font-bold transition-all",
      "bg-ink-800 text-white hover:bg-ink-900 active:scale-[0.98] shadow-soft",
      "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-ink-800",
      full && "w-full"
    )}
  >
    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : Icon && <Icon className="w-5 h-5" />}
    {children}
  </button>
);

const Card = ({ children, className }) => (
  <div className={cx("bg-white rounded-2xl border border-ink-200/70 shadow-soft p-6 md:p-8", className)}>{children}</div>
);

const Field = ({ label, hint, children, required }) => (
  <label className="block">
    <span className="block text-base font-bold text-ink-800 mb-2">
      {label} {required && <span className="text-brandCyan">*</span>}
    </span>
    {children}
    {hint && <span className="block text-sm text-ink-500 mt-1.5">{hint}</span>}
  </label>
);

const TextInput = (props) => (
  <input
    {...props}
    className={cx(
      "w-full px-4 py-3.5 rounded-xl border-2 border-ink-200 bg-white text-ink-800 text-base md:text-lg",
      "placeholder:text-ink-400 focus:border-brandPurple focus:outline-none transition-colors",
      props.className
    )}
  />
);

const TextArea = (props) => (
  <textarea
    {...props}
    className={cx(
      "w-full px-4 py-3.5 rounded-xl border-2 border-ink-200 bg-white text-ink-800 text-base md:text-lg",
      "placeholder:text-ink-400 focus:border-brandPurple focus:outline-none transition-colors min-h-[120px] resize-y",
      props.className
    )}
  />
);

/* ---------- Header ---------- */

const Header = ({ user, onLogout, onGoHome, onIncreaseFont, fontScale }) => {
  const { enabled, toggle, supported } = useSpeech();
  return (
  <header className="sticky top-0 z-30">
    <div className="bg-ink-800 text-white">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-2.5 flex items-center justify-center md:justify-between gap-4 text-sm md:text-[15px]">
        <a href={`tel:${SVI_PHONE.replace(/\s/g, "")}`} className="inline-flex items-center gap-2 text-white/90 hover:text-white">
          <Phone className="w-4 h-4 text-brandCyan" />
          <span className="font-medium">Assistance (SVI) :</span>
          <span className="font-bold tracking-wide">{SVI_PHONE}</span>
        </a>
        <span className="hidden md:inline text-white/60 text-xs">Service à la Personne agréé · Lyon &amp; Métropole</span>
      </div>
    </div>
    <div className="bg-white/95 backdrop-blur border-b border-ink-200">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between gap-4">
        <button onClick={onGoHome} className="flex items-center gap-3" data-testid="header-logo">
          <Logo />
        </button>
        <div className="flex items-center gap-2 md:gap-3">
          {supported && (
            <button
              data-testid="audio-toggle-btn"
              onClick={toggle}
              title={enabled ? "Désactiver la lecture audio" : "Activer la lecture audio"}
              aria-label={enabled ? "Désactiver la lecture audio" : "Activer la lecture audio"}
              aria-pressed={enabled}
              className={cx(
                "inline-flex items-center gap-1.5 px-3 md:px-4 py-2.5 rounded-xl border-2 transition-all font-bold",
                enabled
                  ? "border-brandCyan bg-brandCyan-soft text-brandCyan"
                  : "border-ink-200 bg-white text-ink-500 hover:border-ink-300"
              )}
            >
              {enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              <span className="text-sm md:text-base hidden sm:inline">{enabled ? "Audio" : "Muet"}</span>
            </button>
          )}
          <button
            data-testid="font-increase-btn"
            onClick={onIncreaseFont}
            title="Agrandir le texte de 15%"
            className={cx(
              "inline-flex items-center gap-1.5 px-3 md:px-4 py-2.5 rounded-xl border-2 transition-all font-bold",
              fontScale > 1
                ? "border-brandCyan bg-brandCyan-soft text-brandCyan"
                : "border-ink-200 bg-white text-ink-700 hover:border-ink-300"
            )}
          >
            <Type className="w-4 h-4" />
            <span className="text-sm md:text-base">A+</span>
          </button>
          {user ? (
            <button
              data-testid="logout-btn"
              onClick={onLogout}
              className="inline-flex items-center gap-2 px-4 md:px-5 py-2.5 rounded-xl text-ink-700 hover:bg-ink-100 font-bold transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Se déconnecter</span>
            </button>
          ) : (
            <button
              data-testid="header-cta-login"
              onClick={onGoHome}
              className="inline-flex items-center gap-2 px-4 md:px-5 py-2.5 rounded-xl bg-ink-800 text-white font-bold hover:bg-ink-900 transition-colors"
            >
              <User className="w-4 h-4" />
              <span>Espace Client</span>
            </button>
          )}
        </div>
      </div>
    </div>
  </header>
  );
};

/* ---------- Landing ---------- */

const TESTIMONIALS = [
  {
    name: "Mireille, 72 ans",
    city: "Lyon 6e",
    rating: 5,
    quote: "Jordan a retrouvé toutes mes photos et m'a montré, calmement, comment éviter les arnaques. Le crédit d'impôt a fait le reste !",
  },
  {
    name: "Jean-Claude, 68 ans",
    city: "Villeurbanne",
    rating: 5,
    quote: "Une intervention claire, sans jargon. La box internet remarche, et la facture est divisée par deux grâce au SAP.",
  },
  {
    name: "Hélène, 65 ans",
    city: "Caluire",
    rating: 5,
    quote: "On me parle enfin avec patience. Je recommande à tous mes amis : c'est rassurant, propre, et tellement humain.",
  },
];

const Landing = ({ onStartAuth }) => (
  <main className="max-w-7xl mx-auto px-4 md:px-8 py-10 md:py-16">
    <section className="grid md:grid-cols-12 gap-10 items-center animate-fade-in-up">
      <div className="md:col-span-7">
        <Badge tone="green" icon={ShieldCheck}>Agréé Service à la Personne · 50% de crédit d'impôt</Badge>
        <div className="mt-5 flex items-start gap-3">
          <h1 className="font-extrabold tracking-tight text-ink-900 leading-[1.05] text-4xl sm:text-5xl md:text-6xl lg:text-7xl">
            L'expertise informatique <span className="text-gradient-brand">chez vous</span>
          </h1>
          <SpeakButton
            size="lg"
            text="L'expertise informatique chez vous. Dépannage, conseil et accompagnement à domicile sur Lyon. Un artisan de confiance, patient et sans jargon, pour retrouver votre sérénité numérique, avec une facture divisée par deux grâce à l'État."
            label="Écouter la présentation"
            className="mt-3"
          />
        </div>
        <p className="mt-6 text-lg md:text-xl text-ink-600 max-w-xl leading-relaxed">
          Dépannage, conseil et accompagnement à domicile sur Lyon. Un artisan de confiance, patient et sans jargon, pour
          retrouver votre sérénité numérique — avec une facture divisée par deux grâce à l'État.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <PrimaryButton testId="hero-cta-book" onClick={onStartAuth} icon={CalendarDays}>Prendre rendez-vous</PrimaryButton>
          <a
            href={`tel:${SVI_PHONE.replace(/\s/g, "")}`}
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold border-2 border-ink-200 text-ink-700 bg-white hover:border-ink-300 transition-all"
          >
            <Phone className="w-5 h-5 text-brandCyan" />
            Appeler le {SVI_PHONE}
          </a>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-ink-600">
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
                  {HOURLY_NET}<span className="text-brandCyan">€</span>
                  <span className="text-2xl text-ink-500">/h</span>
                </div>
              </div>
              <div className="text-right">
                <div className="inline-flex items-center gap-1.5 text-sapGreen font-bold">
                  <ShieldCheck className="w-5 h-5" /> -50% SAP
                </div>
                <p className="mt-2 text-xs text-ink-500 max-w-[10rem]">Crédit d'impôt déduit automatiquement</p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-ink-50 p-3"><div className="font-bold text-ink-800">Déplacement inclus</div><div className="text-ink-500">Lyon &amp; alentours</div></div>
              <div className="rounded-xl bg-ink-50 p-3"><div className="font-bold text-ink-800">Sans engagement</div><div className="text-ink-500">Annulable 24h avant</div></div>
            </div>
            <button onClick={onStartAuth} data-testid="hero-card-cta" className="mt-6 w-full inline-flex items-center justify-between gap-2 px-5 py-3.5 rounded-xl bg-ink-800 text-white font-bold hover:bg-ink-900 transition-colors">
              <span>Réserver un créneau</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </section>

    <section className="mt-16 md:mt-24">
      <div className="flex items-end justify-between gap-4 mb-8">
        <h2 className="text-2xl md:text-3xl font-extrabold text-ink-900">Ils nous font confiance</h2>
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
              <div className="flex items-center gap-0.5">{Array.from({ length: t.rating }).map((_, k) => (<Star key={k} className="w-4 h-4 fill-amber-400 text-amber-400" />))}</div>
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
            Une facture conforme vous est envoyée à chaque intervention.
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

/* ---------- Auth ---------- */

const AuthFlow = ({ onCancel, onAuthenticated }) => {
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [code, setCode] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [maskedPhone, setMaskedPhone] = useState("");
  const [devCode, setDevCode] = useState(null);
  const [profile, setProfile] = useState({
    first_name: "",
    last_name: "",
    email: "",
    address: "",
    access_details: "",
  });
  const codeRefs = useRef([]);

  const formatPhone = (v) => v.replace(/\D/g, "").slice(0, 10).replace(/(.{2})/g, "$1 ").trim();

  const submitPhone = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10 || !(digits.startsWith("06") || digits.startsWith("07"))) {
      setError("Merci de saisir un numéro de mobile français à 10 chiffres (06 ou 07).");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/send-otp", { phone: digits });
      setPhoneDigits(digits);
      setMaskedPhone(data.masked_phone);
      setDevCode(data.dev_code || null);
      setStep("code");
      setTimeout(() => codeRefs.current[0]?.focus(), 50);
    } catch (e) {
      setError(e.response?.data?.detail || "Erreur lors de l'envoi du SMS.");
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async () => {
    const entered = code.join("");
    if (entered.length < 4) { setError("Merci de saisir les 4 chiffres reçus par SMS."); return; }
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/verify-otp", { phone: phoneDigits, code: entered });
      localStorage.setItem(STORAGE_TOKEN, data.token);
      localStorage.setItem(STORAGE_USER, JSON.stringify(data.user));
      if (data.is_new_user || !data.user.profile_complete) {
        setStep("profile");
      } else {
        onAuthenticated(data.user);
      }
    } catch (e) {
      setError(e.response?.data?.detail || "Code incorrect.");
    } finally {
      setLoading(false);
    }
  };

  const submitProfile = async () => {
    const { first_name, last_name, email, address } = profile;
    if (!first_name.trim() || !last_name.trim() || !email.trim() || !address.trim()) {
      setError("Merci de compléter les champs obligatoires."); return;
    }
    setError("");
    setLoading(true);
    try {
      const { data } = await api.put("/me", profile);
      localStorage.setItem(STORAGE_USER, JSON.stringify(data));
      onAuthenticated(data);
    } catch (e) {
      setError(e.response?.data?.detail || "Erreur lors de la création du dossier.");
    } finally {
      setLoading(false);
    }
  };

  const onCodeChange = (i, v) => {
    const d = v.replace(/\D/g, "").slice(-1);
    const next = [...code]; next[i] = d; setCode(next);
    if (d && i < 3) codeRefs.current[i + 1]?.focus();
  };
  const onCodeKeyDown = (i, e) => {
    if (e.key === "Backspace" && !code[i] && i > 0) codeRefs.current[i - 1]?.focus();
  };

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-8 py-10 md:py-16 animate-fade-in-up">
      <button onClick={onCancel} data-testid="auth-back-btn" className="inline-flex items-center gap-1 text-ink-600 hover:text-ink-900 font-bold mb-6">
        <ChevronLeft className="w-5 h-5" /> Retour à l'accueil
      </button>
      <Card className="!p-8 md:!p-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-brandCyan-soft text-brandCyan flex items-center justify-center">
            {step === "phone" && <Phone className="w-5 h-5" />}
            {step === "code" && <Hash className="w-5 h-5" />}
            {step === "profile" && <User className="w-5 h-5" />}
          </div>
          <div>
            <div className="text-sm font-bold text-ink-500">
              {step === "phone" && "Étape 1/2"}
              {step === "code" && "Étape 2/2"}
              {step === "profile" && "Création de votre dossier"}
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-ink-900">
              {step === "phone" && "Connexion sécurisée par SMS"}
              {step === "code" && "Saisissez votre code"}
              {step === "profile" && "Quelques informations utiles"}
            </h2>
          </div>
          <SpeakButton
            size="md"
            className="ml-auto"
            text={
              step === "phone"
                ? "Connexion sécurisée par SMS. Aucun mot de passe à retenir. Nous vous envoyons un code à 4 chiffres par SMS."
                : step === "code"
                ? "Saisissez votre code à 4 chiffres reçu par SMS. Pour la démo, le code 1234 fonctionne toujours."
                : "Création de votre dossier. Pour éditer une facture conforme au crédit d'impôt et faciliter mon déplacement. Veuillez compléter votre prénom, nom, adresse e-mail, adresse postale, et les précisions d'accès."
            }
          />
        </div>

        <p className="text-ink-600 mt-1 mb-6 text-base md:text-lg">
          {step === "phone" && "Aucun mot de passe à retenir. Nous vous envoyons un code à 4 chiffres par SMS."}
          {step === "code" && `Un code à 4 chiffres a été envoyé au ${maskedPhone}. Pour la démo, le code 1234 fonctionne toujours.`}
          {step === "profile" && "Pour éditer une facture conforme au crédit d'impôt et faciliter mon déplacement."}
        </p>

        {error && (
          <div className="mb-5 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 font-semibold text-sm">{error}</div>
        )}

        {step === "phone" && (
          <div className="space-y-5">
            <Field label="Numéro de mobile" required hint="Format : 06 12 34 56 78">
              <TextInput data-testid="auth-phone-input" inputMode="numeric" placeholder="06 12 34 56 78"
                value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} />
            </Field>
            <PrimaryButton testId="auth-send-code-btn" full onClick={submitPhone} icon={Send} loading={loading}>
              Recevoir mon code par SMS
            </PrimaryButton>
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
            <div className="flex items-center justify-center text-xs text-ink-500">
              Code de démonstration universel : <span className="ml-1 font-mono font-bold text-brandCyan">1234</span>
              {devCode && <span className="ml-2">(code dev: <span className="font-mono">{devCode}</span>)</span>}
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
            <Field label="Adresse e-mail (pour le devis et la facture)" required>
              <TextInput data-testid="profile-email" type="email" placeholder="marie.dupont@email.com" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
            </Field>
            <Field label="Adresse postale complète" required hint="Pour mon GPS">
              <TextInput data-testid="profile-address" placeholder="N°, rue, code postal, ville" value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} />
            </Field>
            <Field label="Précisions d'accès" hint="Bâtiment, étage, digicode, stationnement…">
              <TextArea data-testid="profile-access" placeholder="Bâtiment B, 3e étage, digicode 1234A…" value={profile.access_details} onChange={(e) => setProfile({ ...profile, access_details: e.target.value })} />
            </Field>
            <PrimaryButton testId="profile-submit-btn" full onClick={submitProfile} icon={ArrowRight} loading={loading}>Créer mon dossier et continuer</PrimaryButton>
          </div>
        )}
      </Card>
    </main>
  );
};

/* ---------- Booking Wizard ---------- */

const DEVICES = [
  { id: "pc", label: "Ordinateur (Mac/PC)", icon: Laptop, desc: "Lenteurs, virus, sauvegarde, mises à jour…" },
  { id: "mobile", label: "Smartphone & Tablette", icon: Smartphone, desc: "Photos, e-mails, applications, paramétrages…" },
  { id: "box", label: "Internet & Périphériques", icon: Wifi, desc: "Box, Wi-Fi, imprimante, TV connectée…" },
  { id: "security", label: "Comptes & Sécurité", icon: Lock, desc: "Mots de passe, arnaques, mails frauduleux…" },
];

const SYMPTOM_SUGGESTIONS = {
  pc: ["Mon ordinateur est très lent", "Je n'arrive plus à imprimer", "Je voudrais sauvegarder mes photos", "Une fenêtre rouge s'affiche tout le temps"],
  mobile: ["Je ne reçois plus mes e-mails", "Je voudrais transférer mes contacts", "Mes photos prennent trop de place", "Je n'arrive pas à installer une application"],
  box: ["Le Wi-Fi ne fonctionne plus", "Ma box clignote en rouge", "L'imprimante n'imprime plus", "La télé ne se connecte plus à internet"],
  security: ["J'ai cliqué sur un lien suspect", "Je ne retrouve plus mon mot de passe", "Je voudrais sécuriser mes comptes", "On me demande de l'argent par e-mail"],
};

const TIME_WINDOWS = ["08h - 09h", "09h - 10h", "10h - 11h", "11h - 12h", "14h - 15h", "15h - 16h", "16h - 17h", "17h - 18h"];

const todayPlus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const formatDateFR = (iso) => { if (!iso) return ""; const d = new Date(iso + "T00:00"); return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); };

const StepIndicator = ({ step }) => (
  <div className="flex items-center gap-2 mb-6">
    {[1, 2, 3].map((n) => (
      <React.Fragment key={n}>
        <div className={cx("step-dot", n === step && "active", n < step && "done")} />
        {n < 3 && <div className="h-px flex-1 bg-ink-200" />}
      </React.Fragment>
    ))}
  </div>
);

const BookingWizard = ({ draft, setDraft, onSubmit, onCgvOpen, submitting }) => {
  const [step, setStep] = useState(1);
  const [cgvAccepted, setCgvAccepted] = useState(false);
  const minDate = todayPlus(1);
  const maxDate = todayPlus(45);

  const canNext1 = !!draft.device_id;
  const canNext2 = (draft.symptom || "").trim().length >= 3;
  const canNext3 = !!draft.date && !!draft.time_window;
  const selectedDevice = DEVICES.find((d) => d.id === draft.device_id);

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Card>
          <div className="flex items-start justify-between gap-3 mb-2">
            <Badge tone="green" icon={ShieldCheck}>Déplacement à votre domicile (éligible 50% SAP)</Badge>
            <span className="text-sm font-bold text-ink-500">Étape {step}/3</span>
          </div>
          <StepIndicator step={step} />

          {step === 1 && (
            <section className="animate-fade-in-up">
              <div className="flex items-start gap-3">
                <h3 className="text-2xl md:text-3xl font-extrabold text-ink-900">Quel appareil nécessite mon intervention&nbsp;?</h3>
                <SpeakButton
                  text="Quel appareil nécessite mon intervention ? Sélectionnez la catégorie principale pour préparer mon déplacement chez vous. Quatre choix : Ordinateur Mac ou PC, Smartphone et tablette, Internet et périphériques, ou Comptes et sécurité."
                  className="ml-auto mt-1"
                />
              </div>
              <p className="mt-2 text-ink-600">Sélectionnez la catégorie principale pour préparer mon déplacement chez vous.</p>
              <div className="mt-6 grid sm:grid-cols-2 gap-3">
                {DEVICES.map((d) => {
                  const Icon = d.icon;
                  const active = draft.device_id === d.id;
                  return (
                    <button key={d.id} data-testid={`device-${d.id}`} onClick={() => setDraft({ ...draft, device_id: d.id })}
                      className={cx("text-left rounded-2xl border-2 p-5 bg-white card-hover transition-all",
                        active ? "border-brandPurple shadow-ring" : "border-ink-200 hover:border-ink-300")}>
                      <div className="flex items-center gap-4">
                        <div className={cx("w-12 h-12 rounded-xl flex items-center justify-center border-2",
                          active ? "border-brandPurple bg-brandPurple-soft text-brandPurple" : "border-ink-200 bg-ink-50 text-ink-700")}>
                          <Icon className="w-6 h-6" />
                        </div>
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
                <SpeakButton
                  text="Décrivez ce qui ne va pas, simplement. Expliquez avec vos mots, comme à un proche. Pas besoin de termes techniques."
                  className="ml-auto mt-1"
                />
              </div>
              <p className="mt-2 text-ink-600">Expliquez avec vos mots, comme à un proche. Pas besoin de termes techniques.</p>
              <div className="mt-6">
                <Field label="Votre situation" required hint="Ex. : 'Mon ordinateur est lent et fait du bruit.'">
                  <TextArea data-testid="symptom-textarea" placeholder="Racontez ce qui se passe…" value={draft.symptom || ""} onChange={(e) => setDraft({ ...draft, symptom: e.target.value })} />
                </Field>
                <div className="mt-5">
                  <div className="text-sm font-bold text-ink-700 mb-2">Suggestions adaptées à « {selectedDevice?.label} »</div>
                  <div className="flex flex-wrap gap-2">
                    {(SYMPTOM_SUGGESTIONS[draft.device_id] || []).map((s, i) => (
                      <button key={i} data-testid={`symptom-suggestion-${i}`} onClick={() => setDraft({ ...draft, symptom: s })}
                        className="px-3 py-2 rounded-full border-2 border-ink-200 bg-white text-ink-700 text-sm font-semibold hover:border-brandPurple hover:text-brandPurple transition-colors">
                        + {s}
                      </button>
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
                <SpeakButton
                  text="Choisissez votre créneau. Nous nous engageons sur une plage horaire, jamais une heure exacte, pour respecter votre tranquillité. Sélectionnez d'abord la date souhaitée, puis la plage horaire qui vous convient."
                  className="ml-auto mt-1"
                />
              </div>
              <p className="mt-2 text-ink-600">Nous nous engageons sur une plage horaire (jamais une heure exacte) pour respecter votre tranquillité.</p>
              <div className="mt-6 grid md:grid-cols-2 gap-5">
                <Field label="Date souhaitée" required>
                  <div className="relative">
                    <Calendar className="w-5 h-5 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input data-testid="booking-date" type="date" min={minDate} max={maxDate} value={draft.date || ""}
                      onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                      className="w-full pl-10 pr-4 py-3.5 rounded-xl border-2 border-ink-200 bg-white text-ink-800 text-base focus:border-brandPurple focus:outline-none" />
                  </div>
                </Field>
                <Field label="Plage horaire" required>
                  <div className="grid grid-cols-2 gap-2">
                    {TIME_WINDOWS.map((tw) => {
                      const active = draft.time_window === tw;
                      return (
                        <button key={tw} data-testid={`timewindow-${tw}`} onClick={() => setDraft({ ...draft, time_window: tw })}
                          className={cx("px-3 py-3 rounded-xl border-2 text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-all",
                            active ? "chip-selected" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300")}>
                          <Clock className="w-4 h-4" />{tw}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </div>
              {draft.date && draft.time_window && (
                <div className="mt-6 rounded-2xl bg-brandPurple-soft border border-brandPurple/30 p-4 flex items-center gap-3">
                  <PartyPopper className="w-5 h-5 text-brandPurple" />
                  <div className="text-ink-800">Récapitulatif : <span className="font-bold">{formatDateFR(draft.date)}</span> entre <span className="font-bold">{draft.time_window}</span>.</div>
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
              <PrimaryButton testId="wizard-next" onClick={() => setStep(step + 1)} disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2)} icon={ChevronRight}>
                Continuer
              </PrimaryButton>
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
              <div className="flex items-center gap-2 text-brandCyan">
                <CreditCard className="w-5 h-5" />
                <span className="text-sm font-bold uppercase tracking-wide">Devis indicatif</span>
              </div>
              <Badge tone="cyan">SAP</Badge>
            </div>
            <div className="mt-5 flex items-center justify-between text-white/80">
              <span>Tarif horaire de base</span><span className="font-bold text-white">{HOURLY_BASE}€/h</span>
            </div>
            {selectedDevice && (
              <div className="mt-3 rounded-xl border border-white/15 bg-white/5 px-4 py-3 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-brandPurple" /><span className="text-white">{selectedDevice.label}</span>
              </div>
            )}
            <div className="mt-4 rounded-xl bg-sapGreen/15 border-l-4 border-sapGreen px-4 py-3">
              <div className="font-bold text-sapGreen flex items-center gap-2"><ShieldCheck className="w-5 h-5" />Avantage Fiscal SAP</div>
              <p className="text-sm text-white/85 mt-1">L'État déduit automatiquement 50% du montant de cette facture de vos impôts.</p>
            </div>
            <div className="mt-6 flex items-end justify-between">
              <span className="text-white/80 text-sm">Votre coût net final</span>
              <div className="text-5xl font-black text-brandCyan leading-none">{HOURLY_NET}<span className="text-2xl text-white/80">€/h</span></div>
            </div>
            <label className="mt-6 flex items-start gap-3 cursor-pointer select-none">
              <input data-testid="cgv-checkbox" type="checkbox" checked={cgvAccepted} onChange={(e) => setCgvAccepted(e.target.checked)} className="mt-1 w-5 h-5 accent-brandCyan" />
              <span className="text-sm text-white/90">
                J'accepte les <button type="button" onClick={onCgvOpen} className="underline font-bold text-brandCyan hover:text-brandCyan-light">Conditions Générales de Vente</button> et la politique d'annulation.
              </span>
            </label>
            <button data-testid="validate-booking-btn" onClick={() => onSubmit(cgvAccepted)} disabled={!canNext1 || !canNext2 || !canNext3 || !cgvAccepted || submitting}
              className={cx("mt-5 w-full inline-flex items-center justify-between gap-2 px-5 py-3.5 rounded-xl font-bold transition-all",
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

/* ---------- Suivi ---------- */

const PREP_CHECKLIST = [
  "Préparer les identifiants (Wi-Fi, e-mail) sur un papier",
  "Brancher l'appareil concerné sur secteur",
  "Libérer un espace de travail (table, chaise)",
  "Avoir votre pièce d'identité à portée de main",
  "Penser à vérifier le digicode et le stationnement",
];

const Suivi = ({ booking, onCancel, onPrepUpdate }) => {
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
            <div>
              <Badge tone="cyan" icon={TimerReset}>Intervention confirmée</Badge>
              <div className="mt-3 flex items-start gap-3">
                <h3 className="text-2xl md:text-3xl font-extrabold text-ink-900">{device?.label}</h3>
                <SpeakButton
                  text={`Intervention confirmée. ${device?.label || ""}. Référence ${booking.ref}. Rendez-vous prévu ${formatDateFR(booking.date)} entre ${booking.time_window}. Adresse : ${booking.address}. ${booking.access_details ? "Précisions d'accès : " + booking.access_details + "." : ""} Votre demande : ${booking.symptom}`}
                />
              </div>
              <p className="mt-1 text-ink-600">Réf. {booking.ref}</p>
            </div>
            <div className="text-right">
              <div className="text-sm text-ink-500 font-bold">Quand ?</div>
              <div className="font-extrabold text-ink-900 capitalize">{formatDateFR(booking.date)}</div>
              <div className="text-brandCyan font-bold">{booking.time_window}</div>
            </div>
          </div>
          <div className="mt-5 grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl bg-ink-50 p-4">
              <div className="text-xs uppercase tracking-wide text-ink-500 font-bold">Adresse</div>
              <div className="mt-1 font-bold text-ink-900 inline-flex items-start gap-2"><MapPin className="w-4 h-4 mt-1 text-brandCyan" /><span>{booking.address}</span></div>
            </div>
            <div className="rounded-xl bg-ink-50 p-4">
              <div className="text-xs uppercase tracking-wide text-ink-500 font-bold">Précisions d'accès</div>
              <div className="mt-1 text-ink-800">{booking.access_details || "—"}</div>
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-ink-200 p-4">
            <div className="text-xs uppercase tracking-wide text-ink-500 font-bold">Votre demande</div>
            <p className="mt-1 text-ink-800">« {booking.symptom} »</p>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-2"><ListChecks className="w-5 h-5 text-brandPurple" /><h3 className="text-xl md:text-2xl font-extrabold text-ink-900">Préparer ma visite</h3>
            <SpeakButton
              className="ml-auto"
              size="sm"
              text={"Préparer ma visite. Cochez chaque étape pour me faciliter le travail le jour J. " + PREP_CHECKLIST.join(". ") + "."}
            />
          </div>
          <p className="text-ink-600 mb-4">Cochez chaque étape pour me faciliter le travail le jour J.</p>
          <ul className="space-y-2">
            {PREP_CHECKLIST.map((item, i) => {
              const done = !!prep[i];
              return (
                <li key={i}>
                  <button data-testid={`prep-item-${i}`} onClick={() => onPrepUpdate({ ...prep, [i]: !done })}
                    className={cx("w-full text-left rounded-xl border-2 px-4 py-3 flex items-center gap-3 transition-all",
                      done ? "border-sapGreen/50 bg-sapGreen-soft" : "border-ink-200 bg-white hover:border-ink-300")}>
                    <span className={cx("w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors",
                      done ? "bg-sapGreen border-sapGreen text-white" : "border-ink-300 bg-white")}>
                      {done && <Check className="w-4 h-4" />}
                    </span>
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
          <p className="mt-1 text-sm text-ink-600">Vous pouvez annuler sans frais jusqu'à 24h avant le rendez-vous.</p>
          <button data-testid="cancel-booking-btn" onClick={onCancel}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-red-200 bg-red-50 text-red-700 font-bold hover:bg-red-100 transition-colors">
            <XCircle className="w-5 h-5" />Annuler mon rendez-vous
          </button>
        </Card>
        <Card>
          <h4 className="text-lg font-extrabold text-ink-900">Besoin d'aide&nbsp;?</h4>
          <p className="mt-1 text-sm text-ink-600">Notre conseiller est joignable du lundi au samedi.</p>
          <a href={`tel:${SVI_PHONE.replace(/\s/g, "")}`} className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-ink-800 text-white font-bold hover:bg-ink-900 transition-colors">
            <Phone className="w-5 h-5 text-brandCyan" />{SVI_PHONE}
          </a>
        </Card>
      </aside>
    </div>
  );
};

/* ---------- Factures ---------- */

const InvoiceList = ({ invoices, onDownload, onPay, payingId, downloadingId }) => (
  <Card>
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <h3 className="text-2xl font-extrabold text-ink-900">Mes factures SAP</h3>
        <SpeakButton
          size="sm"
          text={
            "Mes factures Service à la Personne. Toutes vos factures sont conformes pour le crédit d'impôt 50%. " +
            (invoices.length === 0
              ? "Aucune facture pour le moment."
              : invoices
                  .map(
                    (i) =>
                      `${i.label}. Référence ${i.ref}. ${i.hours} heure${i.hours > 1 ? "s" : ""}. Montant net après crédit d'impôt : ${i.net_total} euros. Statut : ${i.paid ? "payée" : "à régler"}.`
                  )
                  .join(" ")) +
            " Vous pouvez télécharger chaque facture au format PDF."
          }
        />
      </div>
      <Badge tone="green" icon={ShieldCheck}>Conformes crédit d'impôt</Badge>
    </div>
    <div className="divide-y divide-ink-200">
      {invoices.length === 0 && <p className="text-ink-600 py-6 text-center">Aucune facture pour le moment.</p>}
      {invoices.map((inv) => (
        <div key={inv.id} className="py-4 grid md:grid-cols-12 items-center gap-3">
          <div className="md:col-span-5">
            <div className="font-extrabold text-ink-900">{inv.label}</div>
            <div className="text-sm text-ink-500">{inv.ref} · {new Date(inv.date).toLocaleDateString("fr-FR")}</div>
          </div>
          <div className="md:col-span-3 flex md:justify-center">
            <div className="text-sm text-ink-500">
              <span className="font-bold text-ink-800">{inv.hours}h</span> · brut <span className="line-through">{inv.base_total}€</span> <span className="font-bold text-brandCyan">net {inv.net_total}€</span>
            </div>
          </div>
          <div className="md:col-span-2">
            {inv.paid ? <Badge tone="green" icon={CheckCircle2}>Payée</Badge> : <Badge tone="purple" icon={TimerReset}>À régler</Badge>}
          </div>
          <div className="md:col-span-2 flex md:justify-end gap-2">
            {!inv.paid && (
              <button data-testid={`pay-${inv.id}`} onClick={() => onPay(inv.id)} disabled={payingId === inv.id}
                className="px-3 py-2 rounded-lg bg-ink-800 text-white text-sm font-bold hover:bg-ink-900 disabled:opacity-50">
                {payingId === inv.id ? "…" : "Régler"}
              </button>
            )}
            <button data-testid={`download-${inv.id}`} onClick={() => onDownload(inv)} disabled={downloadingId === inv.id}
              className="px-3 py-2 rounded-lg border-2 border-ink-200 text-ink-800 text-sm font-bold hover:border-ink-300 inline-flex items-center gap-1 disabled:opacity-50">
              {downloadingId === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} PDF
            </button>
          </div>
        </div>
      ))}
    </div>
    <p className="mt-6 text-sm text-ink-500">Les factures sont fournies au format PDF avec mention « Service à la Personne », pour votre déclaration d'impôts (case 7DB).</p>
  </Card>
);

/* ---------- Dashboard ---------- */

const Dashboard = ({
  user, booking, draftBooking, setDraftBooking,
  onSubmitBooking, onCancelBooking, onPrepUpdate, onCgvOpen,
  invoices, onDownloadInvoice, onPayInvoice, payingId, downloadingId, submittingBooking,
}) => {
  const [tab, setTab] = useState(booking ? "suivi" : "booking");
  const tabs = [
    { id: "booking", label: "Réserver", icon: CalendarDays },
    { id: "suivi", label: "Suivi", icon: ListChecks },
    { id: "factures", label: "Factures", icon: FileText },
    { id: "compte", label: "Mon compte", icon: User },
  ];

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-12">
      <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-3 animate-fade-in-up">
        <div>
          <div className="text-ink-500 font-bold">Bonjour, {user.first_name} 👋</div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-ink-900">Mon Espace Client</h2>
        </div>
      </div>

      <div role="tablist" className="bg-white rounded-2xl border border-ink-200 p-1.5 inline-flex flex-wrap gap-1 mb-6">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} data-testid={`tab-${t.id}`} onClick={() => setTab(t.id)}
              className={cx("inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm md:text-base font-bold transition-all",
                active ? "bg-ink-800 text-white" : "text-ink-700 hover:bg-ink-100")}>
              <Icon className="w-4 h-4" />{t.label}
            </button>
          );
        })}
      </div>

      <div className="animate-fade-in-up">
        {tab === "booking" && (
          <BookingWizard draft={draftBooking} setDraft={setDraftBooking} onSubmit={(cgv) => onSubmitBooking(cgv).then((ok) => ok && setTab("suivi"))} onCgvOpen={onCgvOpen} submitting={submittingBooking} />
        )}
        {tab === "suivi" && (<Suivi booking={booking} onCancel={onCancelBooking} onPrepUpdate={onPrepUpdate} />)}
        {tab === "factures" && (<InvoiceList invoices={invoices} onDownload={onDownloadInvoice} onPay={onPayInvoice} payingId={payingId} downloadingId={downloadingId} />)}
        {tab === "compte" && (
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-2xl font-extrabold text-ink-900">Mon dossier</h3>
              <SpeakButton
                size="sm"
                text={`Mon dossier. Identité : ${user.first_name} ${user.last_name}. Email : ${user.email}. Téléphone : ${user.phone}. Adresse : ${user.address}. ${user.access_details ? "Précisions d'accès : " + user.access_details : ""}`}
              />
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

/* ---------- Lumi Chatbot ---------- */

const FAQ = [
  { q: "Comment se déroule une intervention à domicile ?", a: "Je viens chez vous au créneau choisi. J'écoute votre besoin, je diagnostique sans jargon, j'interviens et je vous explique simplement. Une facture conforme SAP vous est envoyée par e-mail." },
  { q: "Comment fonctionne le crédit d'impôt (SAP) ?", a: "L'État rembourse 50% du montant via crédit d'impôt — y compris si vous n'êtes pas imposable. La facture indique automatiquement ce qu'il faut déclarer (case 7DB)." },
  { q: "Comment et quand dois-je payer ?", a: "Le paiement s'effectue après l'intervention, par carte, virement ou chèque CESU. Aucune avance n'est demandée." },
  { q: "Puis-je annuler mon rendez-vous ?", a: "Oui, gratuitement jusqu'à 24h avant le rendez-vous depuis l'onglet « Suivi ». Au-delà, contactez-nous au numéro SVI." },
];

const Lumi = ({ open, setOpen, isAuthed, onContactMarc }) => {
  const [view, setView] = useState("menu");
  const [activeFaq, setActiveFaq] = useState(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) setTimeout(() => { setView("menu"); setActiveFaq(null); setMessage(""); }, 200);
  }, [open]);

  const send = async () => {
    setSending(true);
    try { await onContactMarc(message); setView("sent"); }
    catch (e) { /* keep on form */ }
    finally { setSending(false); }
  };

  return (
    <>
      <button data-testid="lumi-toggle" onClick={() => setOpen(!open)} aria-label="Ouvrir l'assistant Lumi"
        className={cx("fixed bottom-5 right-5 md:bottom-8 md:right-8 z-40 w-14 h-14 md:w-16 md:h-16 rounded-full bg-white border-2 border-ink-200 shadow-card flex items-center justify-center transition-transform",
          open ? "rotate-90" : "hover:scale-105 lumi-bulb-pulse")}>
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
                      <p className="text-ink-600 text-sm flex-1">Bonjour ! Choisissez une question ou contactez Jordan directement. Cliquez sur le haut-parleur 🔊 à côté d'une question pour entendre la réponse.</p>
                      <SpeakButton size="sm" text="Bonjour ! Choisissez une question ou contactez Jordan directement. Cliquez sur le haut-parleur à côté d'une question pour entendre la réponse." />
                    </div>
                    {FAQ.map((f, i) => (
                      <div key={i} className="flex items-stretch gap-2">
                        <button data-testid={`faq-${i}`} onClick={() => { setActiveFaq(i); setView("answer"); }}
                          className="flex-1 text-left rounded-xl border-2 border-ink-200 px-4 py-3 hover:border-brandPurple transition-colors">
                          <span className="font-bold text-ink-800">{f.q}</span>
                        </button>
                        <div className="flex items-center">
                          <SpeakButton text={`${f.q} ${f.a}`} label={`Écouter la réponse à : ${f.q}`} />
                        </div>
                      </div>
                    ))}
                    <button data-testid="contact-marc-btn" onClick={() => setView("contact")} disabled={!isAuthed}
                      title={!isAuthed ? "Connectez-vous d'abord" : ""}
                      className={cx("w-full mt-2 text-left rounded-xl border-2 px-4 py-3 transition-colors",
                        isAuthed ? "border-brandCyan/40 bg-brandCyan-soft hover:border-brandCyan" : "border-ink-200 bg-ink-50 opacity-60 cursor-not-allowed")}>
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
                    <div className="flex items-start gap-3">
                      <h4 className="font-extrabold text-ink-900 text-lg flex-1">{FAQ[activeFaq].q}</h4>
                      <SpeakButton text={`${FAQ[activeFaq].q} ${FAQ[activeFaq].a}`} label="Écouter la réponse" />
                    </div>
                    <p className="mt-2 text-ink-700 leading-relaxed">{FAQ[activeFaq].a}</p>
                    {isAuthed && (
                      <button onClick={() => setView("contact")} className="mt-4 inline-flex items-center gap-2 text-brandCyan font-bold hover:text-brandPurple">
                        <HelpCircle className="w-4 h-4" />Cela ne répond pas — contacter Jordan
                      </button>
                    )}
                  </div>
                )}
                {view === "contact" && (
                  <div className="animate-fade-in space-y-4">
                    <button onClick={() => setView("menu")} className="text-sm font-bold text-ink-600 hover:text-ink-900 inline-flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> Retour</button>
                    <div><h4 className="font-extrabold text-ink-900 text-lg">Contacter Jordan</h4><p className="text-sm text-ink-600 mt-1">Décrivez votre besoin, Jordan vous répond sous 24h ouvrées.</p></div>
                    <TextArea data-testid="lumi-message-input" placeholder="Bonjour Jordan, …" value={message} onChange={(e) => setMessage(e.target.value)} />
                    <PrimaryButton testId="lumi-send-btn" full icon={Send} disabled={message.trim().length < 5} loading={sending} onClick={send}>Envoyer mon message</PrimaryButton>
                    <p className="text-xs text-ink-500 text-center">Ou appelez directement le {SVI_PHONE}</p>
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

/* ---------- CGV Modal ---------- */

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
          <p>Les présentes CGV régissent les services proposés par Le Bon Clic, agréé Service à la Personne. Le tarif de base est de 80€/h, dont 50% sont déduits via crédit d'impôt (article 199 sexdecies du CGI).</p>
          <p><strong>Annulation.</strong> Annulation gratuite jusqu'à 24h avant le rendez-vous. Au-delà, un forfait de 20€ peut être appliqué.</p>
          <p><strong>Paiement.</strong> Après intervention, par carte, virement ou CESU. Une facture conforme SAP est envoyée par e-mail.</p>
          <p><strong>Données personnelles.</strong> Vos informations restent strictement confidentielles et ne sont pas revendues.</p>
        </div>
        <div className="mt-6 flex justify-end"><PrimaryButton onClick={onClose}>J'ai compris</PrimaryButton></div>
      </div>
    </div>
  );
};

/* ---------- App root ---------- */

function AppInner() {
  const [view, setView] = useState("landing");
  const [user, setUser] = useState(null);
  const [booking, setBooking] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [draftBooking, setDraftBooking] = useState({ device_id: "", symptom: "", date: "", time_window: "" });
  const [lumiOpen, setLumiOpen] = useState(false);
  const [cgvOpen, setCgvOpen] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const [toast, setToast] = useState(null);
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [payingId, setPayingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  const fetchAll = useCallback(async () => {
    try {
      const [me, b, inv] = await Promise.all([
        api.get("/me"),
        api.get("/bookings/active"),
        api.get("/invoices"),
      ]);
      setUser(me.data);
      setBooking(b.data || null);
      setInvoices(inv.data.invoices || []);
      setView("dashboard");
    } catch (e) {
      // Token invalid → reset
      localStorage.removeItem(STORAGE_TOKEN);
      localStorage.removeItem(STORAGE_USER);
      setView("landing");
      setUser(null);
    }
  }, []);

  // Hydrate
  useEffect(() => {
    const token = localStorage.getItem(STORAGE_TOKEN);
    if (token) fetchAll();
  }, [fetchAll]);

  // Font scale
  useEffect(() => { document.documentElement.style.fontSize = `${100 * fontScale}%`; }, [fontScale]);

  const startAuth = () => setView("auth");
  const goHome = () => setView(user ? "dashboard" : "landing");

  const onAuthenticated = async (u) => {
    setUser(u);
    await fetchAll();
    showToast(`Bienvenue ${u.first_name} !`);
  };

  const onLogout = () => {
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_USER);
    setUser(null); setBooking(null); setInvoices([]);
    setDraftBooking({ device_id: "", symptom: "", date: "", time_window: "" });
    setView("landing");
    showToast("À bientôt !");
  };

  const onSubmitBooking = async (cgvAccepted) => {
    if (!cgvAccepted) return false;
    setSubmittingBooking(true);
    try {
      const { data } = await api.post("/bookings", { ...draftBooking, cgv_accepted: true });
      setBooking(data);
      setDraftBooking({ device_id: "", symptom: "", date: "", time_window: "" });
      showToast("Réservation confirmée 🎉");
      return true;
    } catch (e) {
      showToast(e.response?.data?.detail || "Erreur lors de la création.");
      return false;
    } finally {
      setSubmittingBooking(false);
    }
  };

  const onCancelBooking = async () => {
    if (!booking) return;
    try {
      await api.post(`/bookings/${booking.id}/cancel`);
      setBooking(null);
      showToast("Rendez-vous annulé");
    } catch (e) {
      showToast(e.response?.data?.detail || "Erreur lors de l'annulation.");
    }
  };

  const onPrepUpdate = async (prep) => {
    if (!booking) return;
    setBooking({ ...booking, prep_checklist: prep });
    try { await api.patch(`/bookings/${booking.id}`, { prep_checklist: prep }); }
    catch (e) { /* silent — UI is optimistic */ }
  };

  const onDownloadInvoice = async (inv) => {
    setDownloadingId(inv.id);
    try {
      const r = await api.get(`/invoices/${inv.id}/pdf`, { responseType: "blob" });
      const blob = new Blob([r.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${inv.ref || inv.id}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      showToast(`Facture ${inv.ref} téléchargée`);
    } catch (e) {
      showToast(e.response?.data?.detail || "Erreur lors du téléchargement.");
    } finally {
      setDownloadingId(null);
    }
  };

  const onPayInvoice = async (id) => {
    setPayingId(id);
    try {
      const { data } = await api.post(`/invoices/${id}/pay`);
      setInvoices((arr) => arr.map((i) => (i.id === id ? data : i)));
      showToast("Paiement enregistré");
    } catch (e) {
      showToast(e.response?.data?.detail || "Erreur lors du paiement.");
    } finally {
      setPayingId(null);
    }
  };

  const onContactMarc = async (message) => {
    await api.post("/contact", { message, context: "lumi" });
  };

  const increaseFont = () => {
    setFontScale((s) => { const next = +(s + 0.15).toFixed(2); return next > 1.6 ? 1 : next; });
  };

  return (
    <div className="app-shell">
      <Header user={user} onLogout={onLogout} onGoHome={goHome} onIncreaseFont={increaseFont} fontScale={fontScale} />

      {view === "landing" && <Landing onStartAuth={startAuth} />}
      {view === "auth" && <AuthFlow onCancel={() => setView(user ? "dashboard" : "landing")} onAuthenticated={onAuthenticated} />}
      {view === "dashboard" && user && (
        <Dashboard
          user={user} booking={booking}
          draftBooking={draftBooking} setDraftBooking={setDraftBooking}
          onSubmitBooking={onSubmitBooking} onCancelBooking={onCancelBooking}
          onPrepUpdate={onPrepUpdate} onCgvOpen={() => setCgvOpen(true)}
          invoices={invoices} onDownloadInvoice={onDownloadInvoice} onPayInvoice={onPayInvoice}
          payingId={payingId} downloadingId={downloadingId} submittingBooking={submittingBooking}
        />
      )}

      <footer className="mt-12 border-t border-ink-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 grid md:grid-cols-3 gap-6">
          <div><Logo size="sm" /><p className="mt-3 text-sm text-ink-600 max-w-xs">L'expertise informatique, sereinement, à votre domicile.</p></div>
          <div>
            <h5 className="text-sm uppercase font-bold text-ink-500 tracking-wide">Assistance &amp; Contact</h5>
            <ul className="mt-2 space-y-1 text-ink-700">
              <li className="inline-flex items-center gap-2"><Phone className="w-4 h-4 text-brandCyan" /> {SVI_PHONE}</li>
              <li className="inline-flex items-center gap-2"><Mail className="w-4 h-4 text-brandCyan" /> contact@lebonclic.tech</li>
              <li className="inline-flex items-center gap-2"><Home className="w-4 h-4 text-brandCyan" /> Lyon &amp; Métropole</li>
            </ul>
          </div>
          <div>
            <h5 className="text-sm uppercase font-bold text-ink-500 tracking-wide">Légal &amp; transparence</h5>
            <ul className="mt-2 space-y-1 text-ink-700">
              <li><button onClick={() => setCgvOpen(true)} className="hover:underline">Conditions Générales de Vente</button></li>
              <li>Mentions légales</li>
              <li>Politique de confidentialité</li>
              <li>Agrément Service à la Personne</li>
            </ul>
          </div>
        </div>
        <div className="bg-ink-50 py-3 text-center text-xs text-ink-500">© {new Date().getFullYear()} Le Bon Clic — Tous droits réservés.</div>
      </footer>

      <Lumi open={lumiOpen} setOpen={setLumiOpen} isAuthed={!!user} onContactMarc={onContactMarc} />
      <CgvModal open={cgvOpen} onClose={() => setCgvOpen(false)} />

      {toast && (
        <div className="fixed bottom-24 right-5 md:right-8 z-50 animate-slide-up">
          <div className="bg-ink-800 text-white rounded-xl px-4 py-3 shadow-card font-bold inline-flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-brandCyan" />{toast}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <SpeechProvider>
      <AppInner />
    </SpeechProvider>
  );
}
