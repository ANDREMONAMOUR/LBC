/**
 * AdminApp — Le Bon Clic admin/CRM space.
 *
 * Mounted when window.location.pathname starts with "/admin".
 * Self-contained: own auth, own axios instance with Bearer admin token,
 * own state-based navigation between Dashboard / Clients / Bookings / Invoices.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  LayoutDashboard, Users, Calendar, Receipt, LogOut, Search, Plus, Edit3,
  Check, X, Loader2, ChevronLeft, RefreshCw, Phone, Mail, MapPin, Clock,
  Wallet, BadgeCheck, AlertCircle, Tag, Save, Trash2, ArrowUpRight, Menu,
  Activity, Send, MailCheck, MessageSquare,
} from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL || "";
const API = BACKEND + "/api";

const STORAGE_TOKEN = "lbc_admin_token";
const STORAGE_ADMIN = "lbc_admin_user";

// Catalogue device labels (mirror backend)
const DEVICES = [
  { id: "pc", label: "Dépannage PC / Mac" },
  { id: "mobile", label: "Smartphone / Tablette" },
  { id: "box", label: "Box Internet / Wi-Fi" },
  { id: "security", label: "Sécurité informatique / Logiciel" },
];
const deviceLabel = (id) => (DEVICES.find((d) => d.id === id)?.label) || id;

const TIME_SLOTS = [
  "08h - 09h", "09h - 10h", "10h - 11h", "11h - 12h",
  "14h - 15h", "15h - 16h", "16h - 17h", "17h - 18h",
];

const STATUS_META = {
  confirmed:   { label: "Confirmé",   bg: "bg-blue-50",   fg: "text-blue-700",   ring: "ring-blue-200" },
  in_progress: { label: "En cours",   bg: "bg-amber-50",  fg: "text-amber-700",  ring: "ring-amber-200" },
  completed:   { label: "Réalisé",    bg: "bg-emerald-50",fg: "text-emerald-700",ring: "ring-emerald-200" },
  cancelled:   { label: "Annulé",     bg: "bg-rose-50",   fg: "text-rose-700",   ring: "ring-rose-200" },
};

/* ============================================================================
   UTILITIES
============================================================================ */
const fmtEUR = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n || 0));
const fmtDate = (s) => {
  if (!s) return "—";
  try {
    const d = new Date(s.length === 10 ? s + "T00:00:00" : s);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return s; }
};
const initials = (first, last, phone) => {
  const f = (first || "").trim()[0] || "";
  const l = (last || "").trim()[0] || "";
  if (f || l) return (f + l).toUpperCase();
  return (phone || "?").slice(-2);
};

const adminApi = axios.create({ baseURL: API, timeout: 15000 });
adminApi.interceptors.request.use((cfg) => {
  const t = localStorage.getItem(STORAGE_TOKEN);
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});
adminApi.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem(STORAGE_TOKEN);
      localStorage.removeItem(STORAGE_ADMIN);
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

/* ============================================================================
   UI primitives
============================================================================ */
const Btn = ({ children, onClick, variant = "primary", size = "md", icon: Icon, loading, disabled, type = "button", className = "", title }) => {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2 text-sm", lg: "px-5 py-2.5 text-base" };
  const variants = {
    primary: "bg-cyan-600 text-white hover:bg-cyan-700 focus:ring-cyan-400",
    secondary: "bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 focus:ring-slate-400",
    danger: "bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-400",
    ghost: "text-slate-700 hover:bg-slate-100 focus:ring-slate-300",
    success: "bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-400",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} title={title}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (Icon ? <Icon className="w-4 h-4" /> : null)}
      {children}
    </button>
  );
};

const Input = ({ value, onChange, placeholder, type = "text", className = "", icon: Icon, ...rest }) => (
  <div className="relative">
    {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />}
    <input value={value} onChange={onChange} placeholder={placeholder} type={type}
      className={`w-full ${Icon ? "pl-9" : "px-3"} pr-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:border-cyan-400 text-sm ${className}`}
      {...rest} />
  </div>
);

const Textarea = ({ value, onChange, placeholder, rows = 3, className = "" }) => (
  <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows}
    className={`w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:border-cyan-400 text-sm ${className}`} />
);

const Select = ({ value, onChange, options, placeholder, className = "" }) => (
  <select value={value || ""} onChange={onChange}
    className={`w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:border-cyan-400 text-sm ${className}`}>
    {placeholder && <option value="">{placeholder}</option>}
    {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

const Label = ({ children }) => <label className="block text-xs font-semibold text-slate-600 mb-1.5">{children}</label>;

const StatusPill = ({ status }) => {
  const m = STATUS_META[status] || { label: status, bg: "bg-slate-100", fg: "text-slate-700", ring: "ring-slate-200" };
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${m.bg} ${m.fg} ${m.ring}`}>{m.label}</span>;
};

const PaidPill = ({ paid }) => paid
  ? <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 bg-emerald-50 text-emerald-700 ring-emerald-200"><BadgeCheck className="w-3 h-3"/>Payée</span>
  : <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 bg-amber-50 text-amber-700 ring-amber-200"><Clock className="w-3 h-3"/>En attente</span>;

const Avatar = ({ first, last, phone, size = "md" }) => {
  const sz = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-14 h-14 text-base" }[size];
  return <div className={`${sz} rounded-full bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center text-white font-bold shrink-0`}>{initials(first, last, phone)}</div>;
};

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>{children}</div>
);

const Modal = ({ open, onClose, title, children, maxWidth = "max-w-2xl" }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${maxWidth} max-h-[90vh] overflow-hidden flex flex-col`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-500"/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
};

const Toast = ({ msg, type = "info", onClose }) => {
  useEffect(() => { if (msg) { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); } }, [msg, onClose]);
  if (!msg) return null;
  const colors = { success: "bg-emerald-600", error: "bg-rose-600", info: "bg-slate-800" };
  return (
    <div className="fixed bottom-6 right-6 z-[60] animate-slideup">
      <div className={`${colors[type]} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-md`}>
        {type === "success" && <Check className="w-5 h-5"/>}
        {type === "error" && <AlertCircle className="w-5 h-5"/>}
        <span className="text-sm font-medium">{msg}</span>
      </div>
    </div>
  );
};

/* ============================================================================
   LOGIN
============================================================================ */
const AdminLogin = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e?.preventDefault?.();
    setError(""); setLoading(true);
    try {
      const { data } = await adminApi.post("/admin/auth/login", { email: email.trim(), password });
      localStorage.setItem(STORAGE_TOKEN, data.token);
      localStorage.setItem(STORAGE_ADMIN, JSON.stringify(data.admin));
      onLogin(data.admin);
    } catch (err) {
      setError(err.response?.data?.detail || "Erreur de connexion.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-cyan-50 to-purple-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-purple-500 items-center justify-center mb-3">
            <LayoutDashboard className="w-7 h-7 text-white"/>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Espace Admin</h1>
          <p className="text-sm text-slate-500 mt-1">Le Bon Clic — Gestion CRM</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@lebonclic.tech" icon={Mail} type="email" autoFocus />
          </div>
          <div>
            <Label>Mot de passe</Label>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" type="password" />
          </div>
          {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
          <Btn type="submit" className="w-full" loading={loading} icon={loading ? null : ArrowUpRight}>Se connecter</Btn>
        </form>
        <div className="mt-6 pt-6 border-t border-slate-200 text-xs text-slate-500 text-center">
          <a href="/" className="hover:text-cyan-600">← Retour au site public</a>
        </div>
      </Card>
    </div>
  );
};

/* ============================================================================
   DASHBOARD
============================================================================ */
const KpiCard = ({ icon: Icon, label, value, sub, accent = "cyan" }) => {
  const accents = {
    cyan:    "from-cyan-50 to-cyan-100 text-cyan-700 ring-cyan-200",
    purple:  "from-purple-50 to-purple-100 text-purple-700 ring-purple-200",
    emerald: "from-emerald-50 to-emerald-100 text-emerald-700 ring-emerald-200",
    amber:   "from-amber-50 to-amber-100 text-amber-700 ring-amber-200",
    rose:    "from-rose-50 to-rose-100 text-rose-700 ring-rose-200",
  }[accent];
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</div>
          <div className="text-3xl font-bold text-slate-900 mt-1">{value}</div>
          {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
        </div>
        <div className={`bg-gradient-to-br ${accents} ring-1 p-2.5 rounded-xl`}><Icon className="w-5 h-5"/></div>
      </div>
    </Card>
  );
};

const AdminDashboard = ({ go, notify }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.get("/admin/dashboard");
      setData(data);
    } catch (e) {
      notify("Erreur de chargement du tableau de bord.", "error");
    } finally { setLoading(false); }
  }, [notify]);

  useEffect(() => { fetch(); }, [fetch]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-cyan-600"/></div>;
  if (!data) return null;
  const k = data.kpis;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tableau de bord</h1>
          <p className="text-sm text-slate-500">Vue d'ensemble de votre activité.</p>
        </div>
        <Btn variant="secondary" size="sm" icon={RefreshCw} onClick={fetch}>Actualiser</Btn>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={Users}    label="Clients"          value={k.total_clients}        sub={`${k.profile_complete} profils complets`} accent="cyan" />
        <KpiCard icon={Calendar} label="RDV cette semaine" value={k.bookings_week}        sub={`${k.bookings_today} aujourd'hui`} accent="purple" />
        <KpiCard icon={Wallet}   label="CA du mois"        value={fmtEUR(k.revenue_month)} sub={`${k.paid_count_month} factures payées`} accent="emerald" />
        <KpiCard icon={Receipt}  label="Factures impayées" value={k.invoices_unpaid}      sub={fmtEUR(k.unpaid_amount)} accent="amber" />
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900">Prochains rendez-vous</h2>
          <button onClick={() => go("bookings")} className="text-xs text-cyan-600 hover:text-cyan-700 font-medium">Tout voir →</button>
        </div>
        {data.upcoming.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-8">Aucun RDV à venir.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.upcoming.map((b) => (
              <div key={b.id} className="py-3 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-cyan-50 ring-1 ring-cyan-100 flex flex-col items-center justify-center shrink-0">
                  <div className="text-[10px] uppercase text-cyan-600 font-semibold">{new Date(b.date + "T00:00:00").toLocaleDateString("fr-FR", { month: "short" })}</div>
                  <div className="text-lg font-bold text-cyan-700 -mt-0.5">{new Date(b.date + "T00:00:00").getDate()}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 truncate">{b.client_name || "Client"} <span className="text-slate-400 font-normal">• {b.time_window}</span></div>
                  <div className="text-xs text-slate-500 truncate">{deviceLabel(b.device_id)} · {b.address || "—"}</div>
                </div>
                <StatusPill status={b.status} />
                {b.client_phone && (
                  <a href={`tel:${b.client_phone}`} className="p-2 rounded-lg hover:bg-slate-100" title="Appeler">
                    <Phone className="w-4 h-4 text-slate-600"/>
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

/* ============================================================================
   CLIENTS
============================================================================ */
const AdminClients = ({ notify }) => {
  const [q, setQ] = useState("");
  const [data, setData] = useState({ clients: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.get("/admin/clients", { params: { q, limit: 100 } });
      setData(data);
    } catch (e) {
      notify("Erreur de chargement clients.", "error");
    } finally { setLoading(false); }
  }, [q, notify]);

  useEffect(() => {
    const t = setTimeout(fetch, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, fetch]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-sm text-slate-500">{data.total} client{data.total > 1 ? "s" : ""} enregistré{data.total > 1 ? "s" : ""}.</p>
        </div>
        <div className="w-full md:w-80">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (nom, téléphone, email…)" icon={Search} />
        </div>
      </div>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-cyan-600"/></div>
        ) : data.clients.length === 0 ? (
          <div className="text-center py-16 text-slate-500">Aucun client trouvé.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.clients.map((c) => (
              <button key={c.id} onClick={() => setSelectedId(c.id)} className="w-full p-4 hover:bg-slate-50 flex items-center gap-4 text-left">
                <Avatar first={c.first_name} last={c.last_name} phone={c.phone} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 truncate">
                    {(c.first_name || c.last_name) ? `${c.first_name} ${c.last_name}`.trim() : <span className="text-slate-400 italic">Profil incomplet</span>}
                  </div>
                  <div className="text-xs text-slate-500 truncate flex items-center gap-3">
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3"/>{c.phone}</span>
                    {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3"/>{c.email}</span>}
                  </div>
                </div>
                {c.tags?.length > 0 && (
                  <div className="hidden md:flex gap-1">
                    {c.tags.slice(0, 2).map((t) => <span key={t} className="px-2 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-semibold rounded-full ring-1 ring-purple-200">{t}</span>)}
                  </div>
                )}
                {c.profile_complete ? <BadgeCheck className="w-5 h-5 text-emerald-500"/> : <AlertCircle className="w-5 h-5 text-amber-500"/>}
              </button>
            ))}
          </div>
        )}
      </Card>

      {selectedId && <ClientDetail clientId={selectedId} onClose={() => setSelectedId(null)} onRefresh={fetch} notify={notify} />}
    </div>
  );
};

const ClientDetail = ({ clientId, onClose, onRefresh, notify }) => {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async () => {
    try {
      const { data } = await adminApi.get(`/admin/clients/${clientId}`);
      setData(data);
      setForm({
        first_name: data.client.first_name || "",
        last_name: data.client.last_name || "",
        email: data.client.email || "",
        address: data.client.address || "",
        access_details: data.client.access_details || "",
        admin_notes: data.client.admin_notes || "",
        tags: (data.client.tags || []).join(", "),
      });
    } catch (e) { notify("Erreur chargement client.", "error"); }
  }, [clientId, notify]);

  useEffect(() => { fetch(); }, [fetch]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean) };
      await adminApi.patch(`/admin/clients/${clientId}`, payload);
      notify("Client mis à jour.", "success");
      setEditing(false);
      fetch(); onRefresh?.();
    } catch (e) { notify(e.response?.data?.detail || "Erreur de sauvegarde.", "error"); }
    finally { setSaving(false); }
  };

  if (!data) return <Modal open={true} onClose={onClose} title="Chargement…"><div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-cyan-600"/></div></Modal>;
  const c = data.client;

  return (
    <Modal open={true} onClose={onClose} title="Fiche client" maxWidth="max-w-3xl">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Avatar first={c.first_name} last={c.last_name} phone={c.phone} size="lg" />
          <div className="flex-1">
            <div className="text-xl font-bold text-slate-900">
              {(c.first_name || c.last_name) ? `${c.first_name} ${c.last_name}`.trim() : <span className="text-slate-400 italic">Profil incomplet</span>}
            </div>
            <div className="text-sm text-slate-500 flex items-center gap-3 mt-1 flex-wrap">
              <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:text-cyan-600"><Phone className="w-3.5 h-3.5"/>{c.phone}</a>
              {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-cyan-600"><Mail className="w-3.5 h-3.5"/>{c.email}</a>}
              {c.address && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5"/>{c.address}</span>}
            </div>
          </div>
          {!editing && <Btn variant="secondary" size="sm" icon={Edit3} onClick={() => setEditing(true)}>Modifier</Btn>}
        </div>

        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl">
            <div><Label>Prénom</Label><Input value={form.first_name} onChange={(e) => setForm({...form, first_name: e.target.value})} /></div>
            <div><Label>Nom</Label><Input value={form.last_name} onChange={(e) => setForm({...form, last_name: e.target.value})} /></div>
            <div className="md:col-span-2"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} icon={Mail} /></div>
            <div className="md:col-span-2"><Label>Adresse</Label><Input value={form.address} onChange={(e) => setForm({...form, address: e.target.value})} icon={MapPin} /></div>
            <div className="md:col-span-2"><Label>Accès logistique</Label><Input value={form.access_details} onChange={(e) => setForm({...form, access_details: e.target.value})} placeholder="Code interphone, étage…" /></div>
            <div className="md:col-span-2"><Label>Tags (séparés par virgules)</Label><Input value={form.tags} onChange={(e) => setForm({...form, tags: e.target.value})} icon={Tag} placeholder="VIP, senior, pro…" /></div>
            <div className="md:col-span-2"><Label>Notes admin (internes)</Label><Textarea value={form.admin_notes} onChange={(e) => setForm({...form, admin_notes: e.target.value})} placeholder="Remarques sur ce client…" rows={4} /></div>
            <div className="md:col-span-2 flex gap-2 justify-end">
              <Btn variant="secondary" onClick={() => { setEditing(false); fetch(); }}>Annuler</Btn>
              <Btn variant="primary" icon={Save} loading={saving} onClick={save}>Enregistrer</Btn>
            </div>
          </div>
        ) : (
          <>
            {c.tags?.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {c.tags.map((t) => <span key={t} className="px-2.5 py-1 bg-purple-50 text-purple-700 text-xs font-semibold rounded-full ring-1 ring-purple-200">{t}</span>)}
              </div>
            )}
            {c.access_details && <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-3"><span className="font-semibold text-amber-800">Accès :</span> <span className="text-amber-700">{c.access_details}</span></div>}
            {c.admin_notes && <div className="text-sm bg-slate-50 border border-slate-200 rounded-lg p-3 whitespace-pre-wrap"><span className="font-semibold text-slate-700">Notes :</span> <span className="text-slate-600">{c.admin_notes}</span></div>}
          </>
        )}

        <div>
          <h4 className="font-semibold text-slate-900 mb-2">Réservations ({data.bookings.length})</h4>
          {data.bookings.length === 0 ? <p className="text-sm text-slate-500">Aucune réservation.</p> : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {data.bookings.map((b) => (
                <div key={b.id} className="p-3 flex items-center gap-3 hover:bg-slate-50">
                  <div className="text-xs text-slate-500 font-mono w-20">{b.ref}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{deviceLabel(b.device_id)}</div>
                    <div className="text-xs text-slate-500">{fmtDate(b.date)} · {b.time_window}</div>
                  </div>
                  <StatusPill status={b.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h4 className="font-semibold text-slate-900 mb-2">Factures ({data.invoices.length})</h4>
          {data.invoices.length === 0 ? <p className="text-sm text-slate-500">Aucune facture.</p> : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {data.invoices.map((i) => (
                <div key={i.id} className="p-3 flex items-center gap-3 hover:bg-slate-50">
                  <div className="text-xs text-slate-500 font-mono w-24">{i.ref}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{i.label}</div>
                    <div className="text-xs text-slate-500">{fmtDate(i.date)} · {i.hours}h · {fmtEUR(i.net_total)} net SAP</div>
                  </div>
                  <PaidPill paid={i.paid} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

/* ============================================================================
   BOOKINGS
============================================================================ */
const AdminBookings = ({ notify }) => {
  const [filters, setFilters] = useState({ status: "", date_from: "", date_to: "" });
  const [data, setData] = useState({ bookings: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 200 };
      if (filters.status) params.status = filters.status;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      const { data } = await adminApi.get("/admin/bookings", { params });
      setData(data);
    } catch (e) { notify("Erreur chargement RDV.", "error"); }
    finally { setLoading(false); }
  }, [filters, notify]);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Interventions</h1>
          <p className="text-sm text-slate-500">{data.total} RDV trouvé{data.total > 1 ? "s" : ""}.</p>
        </div>
        <Btn icon={Plus} onClick={() => setCreating(true)}>Nouvelle intervention</Btn>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label>Statut</Label>
            <Select value={filters.status} onChange={(e) => setFilters({...filters, status: e.target.value})} placeholder="Tous"
              options={Object.entries(STATUS_META).map(([v, m]) => ({value: v, label: m.label}))} />
          </div>
          <div><Label>Du</Label><Input type="date" value={filters.date_from} onChange={(e) => setFilters({...filters, date_from: e.target.value})} /></div>
          <div><Label>Au</Label><Input type="date" value={filters.date_to} onChange={(e) => setFilters({...filters, date_to: e.target.value})} /></div>
          <div className="flex items-end"><Btn variant="ghost" icon={RefreshCw} onClick={() => setFilters({status: "", date_from: "", date_to: ""})}>Réinitialiser</Btn></div>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-cyan-600"/></div>
        ) : data.bookings.length === 0 ? (
          <div className="text-center py-16 text-slate-500">Aucun RDV correspondant.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.bookings.map((b) => (
              <button key={b.id} onClick={() => setEditingId(b.id)} className="w-full p-4 hover:bg-slate-50 flex items-center gap-3 md:gap-4 text-left">
                <div className="w-12 h-12 rounded-xl bg-cyan-50 ring-1 ring-cyan-100 flex flex-col items-center justify-center shrink-0">
                  <div className="text-[10px] uppercase text-cyan-600 font-semibold">{new Date(b.date + "T00:00:00").toLocaleDateString("fr-FR", { month: "short" })}</div>
                  <div className="text-lg font-bold text-cyan-700 -mt-0.5">{new Date(b.date + "T00:00:00").getDate()}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 truncate">{b.client?.name || "Client"} <span className="text-slate-400 font-mono text-xs ml-1">{b.ref}</span></div>
                  <div className="text-xs text-slate-500 truncate">{deviceLabel(b.device_id)} · {b.time_window}</div>
                </div>
                <StatusPill status={b.status} />
              </button>
            ))}
          </div>
        )}
      </Card>

      {editingId && <BookingEditor bookingId={editingId} onClose={() => setEditingId(null)} onSaved={fetch} notify={notify} />}
      {creating && <BookingCreator onClose={() => setCreating(false)} onCreated={fetch} notify={notify} />}
    </div>
  );
};

const BookingTimeline = ({ bookingId }) => {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await adminApi.get(`/admin/bookings/${bookingId}/timeline`);
        if (!cancelled) setItems(data.items || []);
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.detail || "Erreur de chargement.");
      }
    })();
    return () => { cancelled = true; };
  }, [bookingId]);

  if (items === null && !error) {
    return <div className="py-4 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-cyan-600"/></div>;
  }
  if (error) {
    return <div className="text-sm text-rose-600">{error}</div>;
  }
  if (items.length === 0) {
    return <div className="text-sm text-slate-500 italic">Aucun événement pour cette réservation.</div>;
  }

  const eventStyle = (kind, channel, event) => {
    if (kind === "internal") return { dot: "bg-slate-400", text: "text-slate-700" };
    if (channel === "sms") {
      if (event && event.toLowerCase().includes("bounce")) return { dot: "bg-rose-500", text: "text-rose-700" };
      return { dot: "bg-emerald-500", text: "text-emerald-700" };
    }
    if (channel === "email") {
      if (event === "hard_bounce" || event === "blocked" || event === "complaint" || event === "spam") return { dot: "bg-rose-500", text: "text-rose-700" };
      if (event === "soft_bounce" || event === "deferred") return { dot: "bg-amber-500", text: "text-amber-700" };
      if (event === "opened" || event === "unique_opened" || event === "click" || event === "clicked") return { dot: "bg-cyan-500", text: "text-cyan-700" };
      return { dot: "bg-emerald-500", text: "text-emerald-700" };
    }
    return { dot: "bg-slate-400", text: "text-slate-700" };
  };

  const fmt = (ts) => {
    try {
      const d = new Date(ts);
      return d.toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return ts; }
  };

  return (
    <div className="relative pl-5 border-l-2 border-slate-200 space-y-3 py-1">
      {items.map((it, idx) => {
        const st = eventStyle(it.kind, it.channel, it.event);
        return (
          <div key={idx} className="relative" data-testid={`timeline-item-${idx}`}>
            <span className={`absolute -left-[27px] top-1 w-3 h-3 rounded-full ring-2 ring-white ${st.dot}`} />
            <div className={`text-sm font-medium ${st.text}`}>{it.label}</div>
            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
              <span>{fmt(it.ts)}</span>
              {it.detail?.tag && <span className="inline-flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">#{it.detail.tag}</span>}
              {it.detail?.subject && <span className="italic truncate max-w-[20rem]">« {it.detail.subject} »</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const BookingEditor = ({ bookingId, onClose, onSaved, notify }) => {
  const [b, setB] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Load bookings list filtered to this id (no /bookings/:id route, but list is fine)
        const { data } = await adminApi.get("/admin/bookings", { params: { limit: 500 } });
        const found = data.bookings.find((x) => x.id === bookingId);
        if (!found) { notify("Réservation introuvable.", "error"); onClose(); return; }
        setB(found);
        setForm({
          date: found.date, time_window: found.time_window, status: found.status,
          field_notes: found.field_notes || "", actual_hours: found.actual_hours ?? "",
        });
      } catch (e) { notify("Erreur chargement.", "error"); onClose(); }
    })();
  }, [bookingId, notify, onClose]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      if (payload.actual_hours === "") delete payload.actual_hours;
      else payload.actual_hours = parseFloat(payload.actual_hours);
      await adminApi.patch(`/admin/bookings/${bookingId}`, payload);
      notify("Intervention mise à jour.", "success");
      onSaved(); onClose();
    } catch (e) { notify(e.response?.data?.detail || "Erreur.", "error"); }
    finally { setSaving(false); }
  };

  if (!b) return <Modal open={true} onClose={onClose} title="Chargement…"><div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-cyan-600"/></div></Modal>;

  return (
    <Modal open={true} onClose={onClose} title={`Intervention ${b.ref}`}>
      <div className="space-y-4">
        <div className="bg-slate-50 rounded-xl p-4">
          <div className="font-medium text-slate-900">{b.client?.name}</div>
          <div className="text-sm text-slate-600 flex flex-wrap gap-3 mt-1">
            {b.client?.phone && <a href={`tel:${b.client.phone}`} className="flex items-center gap-1 hover:text-cyan-600"><Phone className="w-3.5 h-3.5"/>{b.client.phone}</a>}
            <span>{deviceLabel(b.device_id)}</span>
          </div>
          {b.symptom && <div className="text-sm text-slate-600 mt-2 italic">"{b.symptom}"</div>}
          {b.address && <div className="text-sm text-slate-600 mt-1 flex items-center gap-1"><MapPin className="w-3.5 h-3.5"/>{b.address}</div>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})} /></div>
          <div><Label>Créneau</Label><Select value={form.time_window} onChange={(e) => setForm({...form, time_window: e.target.value})}
              options={TIME_SLOTS.map((s) => ({value: s, label: s}))} /></div>
          <div><Label>Statut</Label><Select value={form.status} onChange={(e) => setForm({...form, status: e.target.value})}
              options={Object.entries(STATUS_META).map(([v, m]) => ({value: v, label: m.label}))} /></div>
          <div><Label>Heures réelles (à la fin)</Label><Input type="number" step="0.25" min="0" value={form.actual_hours} onChange={(e) => setForm({...form, actual_hours: e.target.value})} placeholder="ex: 1.5" /></div>
        </div>

        <div><Label>Notes terrain</Label>
          <Textarea value={form.field_notes} onChange={(e) => setForm({...form, field_notes: e.target.value})} rows={4} placeholder="Travaux réalisés, matériel installé, recommandations…" />
        </div>

        <div className="border-t border-slate-200 pt-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-700">
            <Activity className="w-4 h-4 text-cyan-600" />
            Historique des notifications
          </div>
          <BookingTimeline bookingId={bookingId} />
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Btn variant="secondary" onClick={onClose}>Annuler</Btn>
          <Btn icon={Save} loading={saving} onClick={save}>Enregistrer</Btn>
        </div>
      </div>
    </Modal>
  );
};

const BookingCreator = ({ onClose, onCreated, notify }) => {
  const [form, setForm] = useState({
    phone: "", first_name: "", last_name: "", email: "", address: "", access_details: "",
    device_id: "pc", symptom: "", date: "", time_window: "10h - 11h",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form, phone: form.phone.replace(/\D/g, "") };
      await adminApi.post("/admin/bookings", payload);
      notify("Intervention créée.", "success");
      onCreated(); onClose();
    } catch (e) { notify(e.response?.data?.detail || "Erreur.", "error"); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={true} onClose={onClose} title="Nouvelle intervention">
      <div className="space-y-4">
        <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3 text-sm text-cyan-800">
          Saisissez les coordonnées client. Si le numéro existe déjà, la fiche existante sera utilisée.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 md:col-span-1"><Label>Téléphone *</Label><Input value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} placeholder="06 12 34 56 78" icon={Phone} /></div>
          <div><Label>Prénom</Label><Input value={form.first_name} onChange={(e) => setForm({...form, first_name: e.target.value})} /></div>
          <div><Label>Nom</Label><Input value={form.last_name} onChange={(e) => setForm({...form, last_name: e.target.value})} /></div>
          <div className="col-span-2"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} icon={Mail} /></div>
          <div className="col-span-2"><Label>Adresse</Label><Input value={form.address} onChange={(e) => setForm({...form, address: e.target.value})} icon={MapPin} placeholder="N°, rue, ville" /></div>
          <div className="col-span-2"><Label>Accès logistique</Label><Input value={form.access_details} onChange={(e) => setForm({...form, access_details: e.target.value})} placeholder="Code, étage, parking…" /></div>

          <div><Label>Type intervention *</Label><Select value={form.device_id} onChange={(e) => setForm({...form, device_id: e.target.value})}
            options={DEVICES.map((d) => ({value: d.id, label: d.label}))} /></div>
          <div><Label>Date *</Label><Input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})} /></div>
          <div className="col-span-2"><Label>Créneau *</Label><Select value={form.time_window} onChange={(e) => setForm({...form, time_window: e.target.value})}
            options={TIME_SLOTS.map((s) => ({value: s, label: s}))} /></div>
          <div className="col-span-2"><Label>Description du besoin *</Label><Textarea value={form.symptom} onChange={(e) => setForm({...form, symptom: e.target.value})} rows={3} placeholder="Symptôme, demande client…" /></div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Btn variant="secondary" onClick={onClose}>Annuler</Btn>
          <Btn icon={Plus} loading={saving} onClick={save} disabled={!form.phone || !form.symptom || !form.date}>Créer l'intervention</Btn>
        </div>
      </div>
    </Modal>
  );
};

/* ============================================================================
   INVOICES
============================================================================ */
const AdminInvoices = ({ notify }) => {
  const [filters, setFilters] = useState({ paid: "" });
  const [data, setData] = useState({ invoices: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 200 };
      if (filters.paid === "paid") params.paid = true;
      else if (filters.paid === "unpaid") params.paid = false;
      const { data } = await adminApi.get("/admin/invoices", { params });
      setData(data);
    } catch (e) { notify("Erreur chargement factures.", "error"); }
    finally { setLoading(false); }
  }, [filters, notify]);

  useEffect(() => { fetch(); }, [fetch]);

  const togglePaid = async (inv) => {
    try {
      await adminApi.patch(`/admin/invoices/${inv.id}`, { paid: !inv.paid });
      notify(inv.paid ? "Marquée impayée." : "Marquée payée.", "success");
      fetch();
    } catch (e) { notify("Erreur.", "error"); }
  };

  const download = async (inv) => {
    try {
      const r = await adminApi.get(`/invoices/${inv.id}/pdf`, { responseType: "blob" });
      const blob = new Blob([r.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Facture-${inv.ref}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { notify("Téléchargement impossible.", "error"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Factures</h1>
          <p className="text-sm text-slate-500">{data.total} facture{data.total > 1 ? "s" : ""}.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filters.paid} onChange={(e) => setFilters({...filters, paid: e.target.value})}
            options={[
              { value: "", label: "Toutes" },
              { value: "paid", label: "Payées" },
              { value: "unpaid", label: "Impayées" },
            ]} />
          <Btn icon={Plus} onClick={() => setCreating(true)}>Nouvelle facture</Btn>
        </div>
      </div>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-cyan-600"/></div>
        ) : data.invoices.length === 0 ? (
          <div className="text-center py-16 text-slate-500">Aucune facture.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.invoices.map((i) => (
              <div key={i.id} className="p-4 hover:bg-slate-50 flex items-center gap-3 md:gap-4">
                <button onClick={() => setEditingId(i.id)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                  <div className="font-mono text-xs text-slate-500 w-28 shrink-0">{i.ref}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 truncate">{i.label}</div>
                    <div className="text-xs text-slate-500 truncate">{i.client?.name || "—"} · {fmtDate(i.date)} · {i.hours}h</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold text-slate-900">{fmtEUR(i.net_total)}</div>
                    <div className="text-[10px] text-slate-500">net SAP</div>
                  </div>
                </button>
                <PaidPill paid={i.paid} />
                <div className="flex items-center gap-1">
                  <button onClick={() => togglePaid(i)} className="p-2 rounded-lg hover:bg-slate-100" title={i.paid ? "Marquer impayée" : "Marquer payée"}>
                    {i.paid ? <X className="w-4 h-4 text-rose-500"/> : <Check className="w-4 h-4 text-emerald-500"/>}
                  </button>
                  <button onClick={() => download(i)} className="p-2 rounded-lg hover:bg-slate-100" title="Télécharger PDF">
                    <Receipt className="w-4 h-4 text-slate-600"/>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {editingId && <InvoiceEditor invoiceId={editingId} invoices={data.invoices} onClose={() => setEditingId(null)} onSaved={fetch} notify={notify} />}
      {creating && <InvoiceCreator onClose={() => setCreating(false)} onCreated={fetch} notify={notify} />}
    </div>
  );
};

const InvoiceEditor = ({ invoiceId, invoices, onClose, onSaved, notify }) => {
  const initial = useMemo(() => invoices.find((x) => x.id === invoiceId), [invoices, invoiceId]);
  const [form, setForm] = useState(() => initial ? {
    label: initial.label || "", date: initial.date || "", hours: initial.hours || 0,
    base_total: initial.base_total || 0, net_total: initial.net_total || 0, paid: !!initial.paid,
  } : {});
  const [saving, setSaving] = useState(false);

  if (!initial) return null;

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.patch(`/admin/invoices/${invoiceId}`, {
        ...form,
        hours: parseFloat(form.hours),
        base_total: parseFloat(form.base_total),
        net_total: parseFloat(form.net_total),
      });
      notify("Facture mise à jour.", "success");
      onSaved(); onClose();
    } catch (e) { notify(e.response?.data?.detail || "Erreur.", "error"); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={true} onClose={onClose} title={`Facture ${initial.ref}`}>
      <div className="space-y-4">
        <div className="bg-slate-50 rounded-xl p-3 text-sm">
          <span className="font-medium">{initial.client?.name || "—"}</span>
          <span className="text-slate-500"> · {initial.client?.phone || "—"}</span>
        </div>
        <div><Label>Libellé</Label><Input value={form.label} onChange={(e) => setForm({...form, label: e.target.value})} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})} /></div>
          <div><Label>Heures</Label><Input type="number" step="0.25" min="0" value={form.hours} onChange={(e) => setForm({...form, hours: e.target.value})} /></div>
          <div className="flex items-end gap-2">
            <input type="checkbox" id="paid" checked={form.paid} onChange={(e) => setForm({...form, paid: e.target.checked})} className="w-5 h-5 rounded text-cyan-600" />
            <label htmlFor="paid" className="text-sm font-medium text-slate-700 pb-1">Payée</label>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Total brut (€)</Label><Input type="number" step="0.01" value={form.base_total} onChange={(e) => setForm({...form, base_total: e.target.value})} /></div>
          <div><Label>Total net SAP (€)</Label><Input type="number" step="0.01" value={form.net_total} onChange={(e) => setForm({...form, net_total: e.target.value})} /></div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Btn variant="secondary" onClick={onClose}>Annuler</Btn>
          <Btn icon={Save} loading={saving} onClick={save}>Enregistrer</Btn>
        </div>
      </div>
    </Modal>
  );
};

const InvoiceCreator = ({ onClose, onCreated, notify }) => {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({
    user_id: "", booking_id: "", label: "", date: new Date().toISOString().slice(0, 10),
    hours: 1, base_total: "", net_total: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi.get("/admin/clients", { params: { limit: 200 } }).then((r) => setUsers(r.data.clients));
  }, []);

  // Auto-compute totals if hours changed
  useEffect(() => {
    const h = parseFloat(form.hours) || 0;
    if (form.base_total === "" || form.net_total === "") {
      setForm((f) => ({ ...f, base_total: f.base_total === "" ? (h * 80).toFixed(2) : f.base_total, net_total: f.net_total === "" ? (h * 40).toFixed(2) : f.net_total }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.hours]);

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.post("/admin/invoices", {
        user_id: form.user_id, booking_id: form.booking_id || null,
        label: form.label, date: form.date, hours: parseFloat(form.hours),
        base_total: form.base_total ? parseFloat(form.base_total) : undefined,
        net_total: form.net_total ? parseFloat(form.net_total) : undefined,
      });
      notify("Facture créée.", "success");
      onCreated(); onClose();
    } catch (e) { notify(e.response?.data?.detail || "Erreur.", "error"); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={true} onClose={onClose} title="Nouvelle facture">
      <div className="space-y-4">
        <div><Label>Client *</Label>
          <Select value={form.user_id} onChange={(e) => setForm({...form, user_id: e.target.value})} placeholder="-- Sélectionner --"
            options={users.map((u) => ({value: u.id, label: `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.phone}))} />
        </div>
        <div><Label>Libellé *</Label><Input value={form.label} onChange={(e) => setForm({...form, label: e.target.value})} placeholder="ex: Dépannage PC + installation antivirus" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Date *</Label><Input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})} /></div>
          <div><Label>Heures *</Label><Input type="number" step="0.25" min="0.5" value={form.hours} onChange={(e) => setForm({...form, hours: e.target.value})} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Total brut (€)</Label><Input type="number" step="0.01" value={form.base_total} onChange={(e) => setForm({...form, base_total: e.target.value})} placeholder="auto = heures × 80" /></div>
          <div><Label>Total net SAP (€)</Label><Input type="number" step="0.01" value={form.net_total} onChange={(e) => setForm({...form, net_total: e.target.value})} placeholder="auto = heures × 40" /></div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Btn variant="secondary" onClick={onClose}>Annuler</Btn>
          <Btn icon={Plus} loading={saving} onClick={save} disabled={!form.user_id || !form.label || !form.date || !form.hours}>Créer la facture</Btn>
        </div>
      </div>
    </Modal>
  );
};

/* ============================================================================
   LAYOUT + MAIN APP
============================================================================ */
const Sidebar = ({ section, setSection, admin, onLogout, mobileOpen, setMobileOpen }) => {
  const items = [
    { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
    { id: "clients",   label: "Clients",         icon: Users },
    { id: "bookings",  label: "Interventions",   icon: Calendar },
    { id: "invoices",  label: "Factures",        icon: Receipt },
  ];
  return (
    <>
      {mobileOpen && <div className="md:hidden fixed inset-0 bg-slate-900/50 z-30" onClick={() => setMobileOpen(false)} />}
      <aside className={`fixed md:static top-0 left-0 h-full w-72 bg-slate-900 text-slate-200 z-40 transition-transform ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 flex flex-col`}>
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center text-white font-bold">LBC</div>
            <div>
              <div className="font-bold text-white">Le Bon Clic</div>
              <div className="text-xs text-slate-400">Espace Admin</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {items.map((it) => (
            <button key={it.id} onClick={() => { setSection(it.id); setMobileOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${section === it.id ? "bg-cyan-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}>
              <it.icon className="w-5 h-5" />{it.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-800">
          <div className="px-3 py-2 mb-2">
            <div className="text-xs text-slate-400">Connecté en tant que</div>
            <div className="text-sm font-medium text-white truncate">{admin?.first_name || admin?.email}</div>
          </div>
          <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-rose-300 hover:bg-rose-500/10">
            <LogOut className="w-4 h-4"/>Déconnexion
          </button>
          <a href="/" className="w-full flex items-center gap-3 px-3 py-2 mt-1 rounded-lg text-xs text-slate-400 hover:bg-slate-800">
            ← Site public
          </a>
        </div>
      </aside>
    </>
  );
};

const AdminApp = () => {
  const [admin, setAdmin] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_ADMIN) || "null"); } catch { return null; }
  });
  const [section, setSection] = useState("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState({ msg: "", type: "info" });

  const notify = useCallback((msg, type = "info") => setToast({ msg, type }), []);
  const logout = () => {
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_ADMIN);
    setAdmin(null);
  };

  // Verify token on mount
  useEffect(() => {
    if (admin) {
      adminApi.get("/admin/me").catch(() => { logout(); });
    }
  }, [admin]);

  if (!admin) return <AdminLogin onLogin={setAdmin} />;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar section={section} setSection={setSection} admin={admin} onLogout={logout} mobileOpen={mobileNav} setMobileOpen={setMobileNav} />

      <main className="flex-1 min-w-0">
        <header className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
          <button onClick={() => setMobileNav(true)} className="p-2 -ml-2"><Menu className="w-5 h-5 text-slate-700"/></button>
          <span className="font-semibold text-slate-900">Admin</span>
          <span className="w-9" />
        </header>
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          {section === "dashboard" && <AdminDashboard go={setSection} notify={notify} />}
          {section === "clients"   && <AdminClients notify={notify} />}
          {section === "bookings"  && <AdminBookings notify={notify} />}
          {section === "invoices"  && <AdminInvoices notify={notify} />}
        </div>
      </main>

      <Toast msg={toast.msg} type={toast.type} onClose={() => setToast({ msg: "", type: "info" })} />
    </div>
  );
};

export default AdminApp;
