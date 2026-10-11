"use client";
import React, { useState, useRef } from "react";

/* --- Design tokens (exact brandingstudio.ai values) ------------------- */
const C = {
  bg:      "#FFFFFF",
  bgSec:   "#F8F9FA",
  bgCard:  "#FFFFFF",
  bgHover: "#F1F3F5",
  border:  "#E5E7EB",
  borderH: "#D1D5DB",
  text:    "#0F172A",
  text2:   "#475569",
  text3:   "#94A3B8",
  accent:  "#0066FF",
  accentD: "rgba(0,102,255,0.07)",
  accentB: "rgba(0,102,255,0.25)",
  sans:    "'Inter',-apple-system,sans-serif",
  head:    "'Playfair Display',Georgia,serif",
  mono:    "'JetBrains Mono',monospace",
};

/* --- Types ------------------------------------------------------------- */
type Tab = "supports" | "mockups" | "brandbook" | "export" | "quality";

interface Brand {
  name: string; tagline: string; sector: string;
  c1: string; c2: string; c3: string; logo: string | null;
}

const INIT: Brand = {
  name: "Maison Kuro", tagline: "Architecture digitale & direction artistique",
  sector: "Studio créatif", c1: "#0066FF", c2: "#00D4AA", c3: "#F1F3F5", logo: null,
};

/* --- Static content --------------------------------------------------- */
const MODULES = [
  { id: "Validation",   label: "Magic bytes · sanitisation SVG" },
  { id: "Analyse",      label: "Sharp déterministe + Vision IA" },
  { id: "Charte",       label: "LLM → JSON validé par zod"      },
  { id: "Composition",  label: "Sharp + Satori · pixel-perfect"  },
  { id: "Contrôle QC",  label: "WCAG AA · ratio ≤ 1%"            },
  { id: "Brandbook",    label: "PDF 14 sections · react-pdf"     },
  { id: "Livraison",    label: "ZIP Archiver · Telegram"         },
];

const PIPELINE = [
  { label: "Validation magic bytes",  sub: "PNG / SVG / JPEG · ≤ 20 Mo", ms: "38ms"  },
  { label: "Analyse Sharp + Vision",   sub: "Déterministe · aspect ratio",  ms: "74ms"  },
  { label: "Charte graphique LLM",     sub: "API IA · validé par zod",    ms: "290ms" },
  { label: "Composition assets",       sub: "Sharp + Satori · 5 formats",   ms: "185ms" },
  { label: "Rendu mockups",            sub: "4 catégories · cadre plat",    ms: "210ms" },
  { label: "Contrôle qualité",         sub: "WCAG AA · ratio ≤ 1%",         ms: "32ms"  },
  { label: "Export PDF + ZIP",         sub: "React-PDF · Archiver",         ms: "110ms" },
];

const STEPS = [
  "Validation fichier", "Analyse logo", "Charte graphique",
  "Planification assets", "Composition", "Contrôle qualité", "Export & Livraison",
];

const BOOK = [
  ["01","Présentation de la marque","Positionnement, mission, cible"],
  ["02","Logo & variantes","Fond clair, sombre, monochrome"],
  ["03","Palette chromatique","HEX, RGB, ratios WCAG"],
  ["04","Typographie","Polices OFL, échelle, hiérarchie"],
  ["05","Grille & espacements","Unité 8px, zones de sécurité"],
  ["06","Règles logo","Zone de dégagement, taille minimale"],
  ["07","Interdits","Usages proscrits"],
  ["08","Inventaire assets","5 formats aux cotes définies"],
  ["09","Galerie mockups","Étiquetés présentation"],
  ["10","Guide impression","300 DPI, fond perdu, repères"],
  ["11","Guide digital","Pixels, ratios, web"],
  ["12","Accessibilité","Conformité WCAG 2.1 AA"],
  ["13","Contact","Infos studio & marque"],
  ["14","Mentions légales","Licence OFL, révisions"],
];

const CHECKS = [
  { name: "Contraste WCAG 2.1 AA",         result: "7.4:1 ≥ 4.5:1",  note: "Luminance relative sur tous les textes et logos superposés." },
  { name: "Invariant ratio logo",          result: "Δ 0.00% ≤ 1%",   note: "Proportions conservées sans déformation sur tous les assets." },
  { name: "Dimensions exactes",            result: "5/5 conformes",  note: "Aucun écart par rapport aux cotes définies dans supports.ts." },
  { name: "Polices OFL intégrées",         result: "Noto Sans",      note: "Licence SIL Open Font License   aucune dépendance réseau." },
  { name: "Clés d'idempotence",            result: "sha256 vérifié", note: "Aucun appel IA re-exécuté pour une clé existante." },
  { name: "Mockups étiquetés",             result: "présentation",   note: "Tous les mockups marqués non-print-ready." },
];

const BRANDS_LOGOS = ["Supabase", "Inngest", "IA Provider", "Vercel", "Telegram Bot API"];

const TABS: { id: Tab; label: string }[] = [
  { id: "supports",  label: "Supports"  },
  { id: "mockups",   label: "Mockups"   },
  { id: "brandbook", label: "Brandbook" },
  { id: "export",    label: "Export ZIP"    },
  { id: "quality",   label: "Qualité"   },
];

/* --- Helpers ----------------------------------------------------------- */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const lum  = (hex: string) => {
  const h = hex.replace("#","");
  const [r,g,b] = [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  return (0.299*r + 0.587*g + 0.114*b)/255;
};
const fg = (hex: string) => lum(hex) > 0.45 ? "#0F172A" : "#FFFFFF";

/* --- Atoms ------------------------------------------------------------- */

function Btn({ children, variant = "primary", onClick, disabled, small }: {
  children: React.ReactNode; variant?: "primary"|"ghost"|"outline";
  onClick?: () => void; disabled?: boolean; small?: boolean;
}) {
  const [hov, setHov] = useState(false);
  const h = small ? 36 : 48;
  const px = small ? 16 : 28;
  const fs = small ? 13 : 15;

  const styles: Record<string, React.CSSProperties> = {
    primary: {
      background: disabled ? C.bgHover : C.accent,
      color: disabled ? C.text3 : "#fff",
      border: "none",
      boxShadow: hov && !disabled ? "0 8px 24px rgba(0,102,255,0.35), 0 0 0 1px rgba(0,102,255,0.5)" : "none",
      transform: hov && !disabled ? "scale(1.02)" : "scale(1)",
    },
    ghost: {
      background: hov ? C.bgHover : "transparent",
      color: C.text2,
      border: `1px solid ${C.border}`,
    },
    outline: {
      background: hov ? C.accentD : "transparent",
      color: C.accent,
      border: `1px solid ${C.accentB}`,
    },
  };

  return (
    <button
      onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        height: h, paddingInline: px,
        borderRadius: 9999,
        fontSize: fs, fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.2s",
        whiteSpace: "nowrap",
        ...styles[variant],
      }}
    >{children}</button>
  );
}

function Badge({ children, color = "blue" }: { children: React.ReactNode; color?: "blue"|"gray"|"green" }) {
  const s: Record<string, React.CSSProperties> = {
    blue:  { background: C.accentD, border: `1px solid ${C.accentB}`, color: C.accent },
    gray:  { background: C.bgHover, border: `1px solid ${C.borderH}`, color: C.text2  },
    green: { background: "rgba(0,212,170,0.1)", border: "1px solid rgba(0,212,170,0.3)", color: "#00D4AA" },
  };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 12px", borderRadius: 9999,
      fontSize: 12, fontWeight: 600,
      fontFamily: C.sans,
      ...s[color],
    }}>{children}</span>
  );
}

function SectionTag({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: C.mono, fontSize: 12, fontWeight: 500, letterSpacing: "0.08em",
      textTransform: "uppercase", color: C.text3, marginBottom: 12,
    }}>{children}</p>
  );
}

function Heading({ children, size = "xl" }: { children: React.ReactNode; size?: "sm"|"md"|"xl"|"hero" }) {
  const fs: Record<string, string> = {
    sm:   "clamp(18px,2vw,22px)",
    md:   "clamp(22px,2.5vw,28px)",
    xl:   "clamp(28px,3.5vw,40px)",
    hero: "clamp(38px,5vw,64px)",
  };
  return (
    <h2 style={{
      fontFamily: C.head,
      fontSize: fs[size],
      fontWeight: size === "hero" ? 900 : 800,
      color: C.text,
      lineHeight: 1.1,
      letterSpacing: "-0.025em",
    }}>{children}</h2>
  );
}

function Divider() {
  return <div style={{ height: 1, background: C.border }} />;
}

function Card({ children, hover = true }: { children: React.ReactNode; hover?: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => hover && setHov(true)}
      onMouseLeave={() => hover && setHov(false)}
      style={{
        background: C.bgCard,
        border: `1px solid ${hov ? C.borderH : C.border}`,
        borderRadius: 12,
        overflow: "hidden",
        transition: hover ? "border-color 0.2s, box-shadow 0.2s" : "none",
        boxShadow: hov ? "0 4px 20px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)" : "none",
      }}
    >{children}</div>
  );
}

function CheckIcon({ color = "#00D4AA" }: { color?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 7l2.5 2.5 5.5-5.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* --- Asset previews ---------------------------------------------------- */
function PreviewBanner({ b }: { b: Brand }) {
  return (
    <div style={{
      aspectRatio:"1200/500", background: b.c1, position:"relative", overflow:"hidden",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8, padding:"0 10%",
    }}>
      <div style={{ position:"absolute", inset:0, background:`radial-gradient(ellipse at 70% 50%, ${b.c2}55, transparent 60%)` }} />
      {b.logo && <img src={b.logo} alt="" style={{ height:22, objectFit:"contain", position:"relative" }} />}
      <div style={{ fontFamily:C.head, fontSize:"clamp(14px,2.4vw,22px)", fontWeight:900, color:fg(b.c1), letterSpacing:"-0.02em", position:"relative" }}>{b.name}</div>
      <div style={{ fontFamily:C.mono, fontSize:"clamp(8px,0.9vw,11px)", color:fg(b.c1), opacity:0.5, letterSpacing:"0.1em", textTransform:"uppercase", position:"relative" }}>{b.tagline}</div>
    </div>
  );
}
function PreviewCard({ b }: { b: Brand }) {
  return (
    <div style={{ aspectRatio:"1050/600", background:C.bgSec, display:"flex", alignItems:"center", justifyContent:"center", padding:"7%" }}>
      <div style={{
        width:"100%", height:"100%", background:"#FFFFFF", borderRadius:8,
        border:`1px solid ${C.border}`, boxShadow:"0 8px 24px rgba(0,0,0,0.08)",
        padding:"7% 9%", display:"flex", flexDirection:"column", justifyContent:"space-between",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:20, height:20, borderRadius:4, background:b.c1, boxShadow:`0 0 12px ${b.c1}99` }} />
          <span style={{ fontFamily:C.head, fontSize:"clamp(10px,1.6vw,15px)", fontWeight:700, color:C.text }}>{b.name}</span>
        </div>
        <div>
          <div style={{ fontSize:"clamp(9px,1.1vw,11px)", fontWeight:600, color:C.text2 }}>hello@{slug(b.name)}.co</div>
          <div style={{ fontSize:"clamp(8px,0.9vw,10px)", color:C.text3, fontFamily:C.mono }}>{slug(b.name)}.co</div>
        </div>
      </div>
    </div>
  );
}
function PreviewAvatar({ b }: { b: Brand }) {
  return (
    <div style={{ aspectRatio:"1/1", background:C.bgSec, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{
        width:"52%", height:"52%", borderRadius:"50%", background:b.c1,
        display:"flex", alignItems:"center", justifyContent:"center",
        boxShadow:`0 0 0 1px ${C.border}, 0 8px 32px ${b.c1}55`,
      }}>
        <span style={{ fontFamily:C.head, fontSize:"clamp(20px,5vw,38px)", fontWeight:900, color:fg(b.c1) }}>{b.name.charAt(0)}</span>
      </div>
    </div>
  );
}
function PreviewSquare({ b }: { b: Brand }) {
  return (
    <div style={{ aspectRatio:"1/1", background:b.c1, position:"relative", overflow:"hidden", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8 }}>
      <div style={{ position:"absolute", inset:0, background:`radial-gradient(circle at 25% 75%, ${b.c2}55, transparent 50%)` }} />
      <div style={{ fontFamily:C.head, fontSize:"clamp(12px,2vw,18px)", fontWeight:900, color:fg(b.c1), position:"relative", letterSpacing:"-0.01em" }}>{b.name}</div>
      <div style={{ fontFamily:C.mono, fontSize:"clamp(7px,0.9vw,10px)", color:fg(b.c1), opacity:0.55, position:"relative", letterSpacing:"0.08em", textTransform:"uppercase" }}>{b.sector}</div>
    </div>
  );
}
function PreviewVertical({ b }: { b: Brand }) {
  return (
    <div style={{ aspectRatio:"9/16", background:b.c1, position:"relative", overflow:"hidden", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12, padding:"10%" }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:"45%", background:`radial-gradient(ellipse at 50% 0%, ${b.c2}66, transparent 70%)` }} />
      <div style={{ width:32, height:32, borderRadius:8, background:b.c2, boxShadow:`0 6px 20px ${b.c2}77`, position:"relative" }} />
      <div style={{ fontFamily:C.head, fontSize:"clamp(13px,2.8vw,20px)", fontWeight:900, color:fg(b.c1), position:"relative", letterSpacing:"-0.015em" }}>{b.name}</div>
      <div style={{ fontFamily:C.mono, fontSize:"clamp(7px,1vw,9px)", color:fg(b.c1), opacity:0.45, letterSpacing:"0.12em", textTransform:"uppercase", position:"relative" }}>Story · Reel</div>
    </div>
  );
}

function AssetCard({ title, spec, desc, tag, tagColor, children }: {
  title:string; spec:string; desc:string; tag:string; tagColor:"blue"|"gray"|"green"; children:React.ReactNode;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background:C.bgCard, border:`1px solid ${hov?C.borderH:C.border}`,
        borderRadius:12, overflow:"hidden", display:"flex", flexDirection:"column",
        transition:"border-color 0.2s, box-shadow 0.2s",
        boxShadow: hov ? "0 4px 24px rgba(0,0,0,0.08)":"none",
      }}
    >
      {children}
      <div style={{ padding:"12px 14px", borderTop:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginBottom:4 }}>
          <span style={{ fontSize:13.5, fontWeight:600, color:C.text }}>{title}</span>
          <Badge color={tagColor}>{tag}</Badge>
        </div>
        <div style={{ fontFamily:C.mono, fontSize:10.5, color:C.text3, marginBottom:3 }}>{spec}</div>
        <div style={{ fontSize:12, color:C.text2 }}>{desc}</div>
      </div>
    </div>
  );
}

/* --- Main page --------------------------------------------------------- */
export default function Page() {
  const [brand, setBrand] = useState<Brand>(INIT);
  const [tab,   setTab]   = useState<Tab>("supports");
  const [step,  setStep]  = useState(-1);
  const [running, setRun] = useState(false);

  function generate() {
    if (running) return;
    setRun(true); setStep(0);
    let i = 0;
    const t = setInterval(() => {
      i++;
      if (i >= PIPELINE.length) { clearInterval(t); setRun(false); setStep(PIPELINE.length); }
      else setStep(i);
    }, 440);
  }

  function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => setBrand(b => ({ ...b, logo: r.result as string }));
    r.readAsDataURL(f);
  }

  return (
    <div style={{ minHeight:"100vh", background:C.bg }}>

      {/* -- Navbar ------------------------------------------------------- */}
      <nav style={{
        position:"fixed", top:0, left:0, right:0, zIndex:50,
        height:64,
        background:"rgba(255,255,255,0.92)",
        backdropFilter:"blur(10px)",
        WebkitBackdropFilter:"blur(10px)",
        borderBottom:`1px solid ${C.border}`,
        display:"flex", alignItems:"center",
      }}>
        <div style={{ maxWidth:1280, width:"100%", margin:"0 auto", padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          {/* left */}
          <div style={{ display:"flex", alignItems:"center", gap:32 }}>
            {/* logo */}
            <a href="#hero" style={{ display:"flex", alignItems:"center", gap:10, textDecoration:"none" }}>
              <div style={{
                width:28, height:28, borderRadius:7,
                background:C.bgCard, border:`1px solid ${C.borderH}`,
                display:"grid", gridTemplateColumns:"1fr 1fr", gap:3, padding:6,
              }}>
                <div style={{ borderRadius:2, background:C.text }} />
                <div style={{ borderRadius:2, background:C.accent }} />
                <div style={{ borderRadius:2, background:C.accent }} />
                <div style={{ borderRadius:2, background:C.text3 }} />
              </div>
              <span style={{ fontFamily:C.sans, fontWeight:700, fontSize:15, color:C.text, letterSpacing:"-0.01em" }}>
                Brand Studio
              </span>
            </a>
            {/* nav links */}
            {([
              { label:"Bot Telegram", href:"#hero"        },
              { label:"Pipeline",     href:"#pipeline"    },
              { label:"Assets",       href:"#app"         },
              { label:"Comparaison",  href:"#comparaison" },
            ]).map(({ label, href }) => (
              <a key={label} href={href} style={{
                fontSize:14, color:C.text2, textDecoration:"none", transition:"color 0.15s",
              }}
                onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                onMouseLeave={e => (e.currentTarget.style.color = C.text2)}
              >{label}</a>
            ))}
          </div>
          {/* right */}
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>

            <div style={{
              padding:"5px 12px", borderRadius:9999,
              background:C.bgHover, border:`1px solid ${C.border}`,
              fontFamily:C.mono, fontSize:11.5, color:C.text2,
            }}>82 / 100 BRS</div>
            <Btn variant="primary" small onClick={() => { document.getElementById("app")?.scrollIntoView({behavior:"smooth"}); setTimeout(generate, 600); }} disabled={running}>
              {running ? "Génération en cours…" : "Générer →"}
            </Btn>
          </div>
        </div>
      </nav>

      {/* -- Hero section -------------------------------------------------- */}
      <section id="hero" style={{
        paddingTop:140, paddingBottom:80,
        borderBottom:`1px solid ${C.border}`,
        maxWidth:1280, margin:"0 auto", padding:"140px 24px 80px",
      }}>
        <div style={{ maxWidth:680 }}>
          {/* overline badge */}


          {/* headline   exact clone of brandingstudio.ai */}
          <h1 style={{
            fontFamily:C.head,
            fontSize:"clamp(40px,5.5vw,68px)",
            fontWeight:900,
            lineHeight:1.05,
            letterSpacing:"-0.03em",
            marginBottom:20,
          }}>
            <span style={{
              background:"linear-gradient(180deg, #F3F4F4 0%, #A1A1AA 100%)",
              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
              display:"block",
            }}>
              Identité de marque,
            </span>
            <span style={{
              background:"linear-gradient(180deg, #F3F4F4 0%, #A1A1AA 100%)",
              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
              display:"block",
            }}>
              orchestrée
            </span>
            <span style={{
              background:"linear-gradient(180deg, #F3F4F4 0%, #A1A1AA 100%)",
              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
              display:"block",
            }}>
              par le code.
            </span>
          </h1>

          <p style={{ fontSize:17, fontWeight:300, color:C.text2, maxWidth:480, lineHeight:1.7, marginBottom:40 }}>
            Envoyez votre logo sur Telegram. Recevez votre identité visuelle complète : charte, assets, brandbook PDF, en moins d'une heure.
          </p>

          <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:16 }}>
            <Btn variant="primary" onClick={() => document.getElementById("app")?.scrollIntoView({behavior:"smooth"})}>
              Lancer /newbrand →
            </Btn>
            <Btn variant="ghost" onClick={() => document.getElementById("pipeline")?.scrollIntoView({behavior:"smooth"})}>Voir le pipeline</Btn>
          </div>
          <p style={{ fontSize:13, color:C.text3 }}>Bot Telegram privé · Accès unique · Hébergé sur Vercel</p>
        </div>
      </section>

      {/* -- Stats bar ------------------------------------------------------ */}


      {/* -- Numbers --------------------------------------------------------- */}
      <div style={{ borderBottom:`1px solid ${C.border}` }}>
        <div style={{ maxWidth:1280, margin:"0 auto", padding:"48px 24px", display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:24 }}>
          {[
            { val:"5",     label:"Supports graphiques"    },
            { val:"< 1h",  label:"Délai de livraison"     },
            { val:"14",    label:"Sections brandbook"     },
            { val:"0",     label:"Pixel géré par l'IA"   },
          ].map(stat => (
            <div key={stat.label} style={{ textAlign:"center" }}>
              <div style={{ fontFamily:C.head, fontSize:"clamp(28px,3.5vw,42px)", fontWeight:900, color:C.text, letterSpacing:"-0.03em" }}>{stat.val}</div>
              <div style={{ fontSize:13, color:C.text3, marginTop:4 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* -- What is it ------------------------------------------------------ */}
      <section style={{ padding:"64px 24px", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ maxWidth:768, margin:"0 auto" }}>
          <Heading size="md">Qu'est-ce que Brand Studio ?</Heading>
          <p style={{ fontSize:15, color:C.text2, lineHeight:1.75, margin:"16px 0 24px" }}>
            Un bot Telegram personnel qui transforme votre logo en identité visuelle complète. Le pipeline Inngest orchestre chaque étape : validation, analyse, charte graphique, composition, contrôle qualité, et livre un ZIP structuré directement dans votre conversation Telegram.
          </p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:8 }}>
            {MODULES.map(m => (
              <div key={m.id} style={{
                display:"flex", alignItems:"center", gap:10,
                padding:"10px 14px", borderRadius:10,
                background:C.bgCard, border:`1px solid ${C.border}`,
                fontSize:13,
              }}>
                <CheckIcon color={C.accent} />
                <div>
                  <div style={{ fontWeight:600, color:C.text }}>{m.id}</div>
                  <div style={{ fontSize:11, color:C.text3 }}>{m.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -- Process steps --------------------------------------------------- */}
      <section id="pipeline" style={{ padding:"80px 24px", background:C.bgSec, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ maxWidth:1280, margin:"0 auto" }}>
          <SectionTag>Le pipeline</SectionTag>
          <Heading size="xl">Sept étapes.<br />Un pipeline connecté.</Heading>
          <p style={{ fontSize:14, color:C.text3, margin:"16px 0 48px" }}>Chaque étape enchaîne la suivante via Inngest. Durée totale &lt; 1 heure.</p>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:12 }}>
            {STEPS.map((s, i) => (
              <div key={i} style={{
                display:"flex", flexDirection:"column", alignItems:"flex-start", gap:12,
                padding:"16px 14px",
                background:C.bgCard, border:`1px solid ${C.border}`,
                borderRadius:12,
                position:"relative",
                transition:"border-color 0.15s",
              }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = C.borderH)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
              >
                <div style={{
                  width:28, height:28, borderRadius:"50%",
                  background:C.bgHover, border:`1px solid ${C.borderH}`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontFamily:C.mono, fontSize:11, color:C.text2, fontWeight:600,
                }}>
                  {String(i+1).padStart(2,"0")}
                </div>
                <p style={{ fontSize:12, fontWeight:500, color:C.text2, lineHeight:1.4 }}>{s}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -- App area (2-col) ------------------------------------------------ */}
      <section id="app" style={{ padding:"80px 24px 100px" }}>
        <div style={{ maxWidth:1280, margin:"0 auto" }}>
          <div style={{ marginBottom:40 }}>
            <SectionTag>Configurez votre projet</SectionTag>
            <Heading size="xl">Renseignez votre brief,<br />lancez le pipeline.</Heading>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"300px 1fr", gap:20, alignItems:"start" }}>

            {/* -- Left: brief --------------------------------------------- */}
            <div style={{
              background:C.bgCard, border:`1px solid ${C.border}`,
              borderRadius:12, overflow:"hidden",
              position:"sticky", top:84,
            }}>
              {/* header */}
              <div style={{
                padding:"12px 18px", borderBottom:`1px solid ${C.border}`,
                display:"flex", alignItems:"center", justifyContent:"space-between",
                background:C.bgSec,
              }}>
                <span style={{ fontSize:12.5, fontWeight:600, color:C.text, letterSpacing:"-0.01em" }}>Brief</span>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <Badge color="gray">Active</Badge>
                  <button onClick={() => setBrand(INIT)} title="Réinitialiser" style={{
                    width:26, height:26, borderRadius:6, border:`1px solid ${C.border}`,
                    background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
                    color:C.text3, transition:"all 0.15s",
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.borderH; (e.currentTarget as HTMLButtonElement).style.color = C.text2; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.border; (e.currentTarget as HTMLButtonElement).style.color = C.text3; }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M2 8a6 6 0 1 1 1.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                      <path d="M2 4v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>

              <div style={{ padding:18, display:"flex", flexDirection:"column", gap:14 }}>

                {/* logo upload */}
                <div>
                  <label style={{ display:"block", fontSize:12, fontWeight:500, color:C.text2, marginBottom:6 }}>Fichier logo</label>
                  <label style={{
                    display:"block", cursor:"pointer",
                    border:`1px dashed ${C.borderH}`,
                    borderRadius:10, padding:14, textAlign:"center",
                    background:C.bgHover, transition:"border-color 0.15s",
                  }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = C.accent)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = C.borderH)}
                  >
                    <input type="file" accept="image/png,image/jpeg,image/svg+xml"
                      style={{ display:"none" }} onChange={handleLogo} />
                    {brand.logo ? (
                      <>
                        <img src={brand.logo} alt="" style={{ maxHeight:44, maxWidth:"100%", objectFit:"contain", display:"block", margin:"0 auto 6px" }} />
                        <span style={{ fontFamily:C.mono, fontSize:10.5, color:C.text3 }}>Cliquer pour remplacer</span>
                      </>
                    ) : (
                      <>
                        <div style={{
                          width:30, height:30, borderRadius:8, background:C.bgCard,
                          border:`1px solid ${C.border}`, margin:"0 auto 7px",
                          display:"flex", alignItems:"center", justifyContent:"center",
                        }}>
                          <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                            <path d="M10 4v8M6 8l4-4 4 4" stroke={C.text3} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M3 17h14" stroke={C.text3} strokeWidth="1.7" strokeLinecap="round" />
                          </svg>
                        </div>
                        <div style={{ fontSize:12.5, fontWeight:500, color:C.text2 }}>Déposer le logo ici</div>
                        <div style={{ fontFamily:C.mono, fontSize:10, color:C.text3, marginTop:2 }}>PNG · SVG · JPEG · ≤ 20 MB</div>
                      </>
                    )}
                  </label>
                </div>

                <Divider />

                {/* text fields */}
                {([
                  { k:"name",    l:"Nom de la marque" },
                  { k:"tagline", l:"Slogan"    },
                  { k:"sector",  l:"Secteur"     },
                ] as const).map(({ k, l }) => (
                  <InputField key={k} label={l} value={brand[k]} onChange={v => setBrand(b => ({ ...b, [k]:v }))} />
                ))}

                <Divider />

                {/* colors */}
                <div>
                  <div style={{ fontSize:12, fontWeight:500, color:C.text2, marginBottom:8 }}>Palette chromatique</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                    <SwatchPicker label="Primaire"   value={brand.c1} onChange={v => setBrand(b => ({ ...b, c1:v }))} />
                    <SwatchPicker label="Secondaire" value={brand.c2} onChange={v => setBrand(b => ({ ...b, c2:v }))} />
                    <SwatchPicker label="Surface"   value={brand.c3} onChange={v => setBrand(b => ({ ...b, c3:v }))} />
                  </div>
                </div>

                <Divider />

                {/* pipeline */}
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:C.text3, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>Pipeline</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                    {PIPELINE.map((p,i) => {
                      const state = step === PIPELINE.length ? "done" : step === i ? "active" : step > i ? "done" : "idle";
                      return <PipeRow key={i} label={p.label} sub={p.sub} ms={p.ms} state={state} />;
                    })}
                  </div>
                </div>

                {/* CTA */}
                <button onClick={generate} disabled={running} style={{
                  width:"100%", height:44, borderRadius:9999,
                  background: running ? C.bgHover : C.accent,
                  color: running ? C.text3 : "#fff",
                  border:"none", fontSize:14, fontWeight:600,
                  cursor: running ? "not-allowed" : "pointer",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:7,
                  boxShadow: running ? "none" : "0 4px 14px rgba(0,102,255,0.30)",
                  transition:"all 0.2s",
                }}>
                  {running
                    ? <><SpinIcon />Génération en cours…</>
                    : <><svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor"><polygon points="2,1 12,7 2,13" /></svg>Générer la collection</>
                  }
                </button>
              </div>
            </div>

            {/* -- Right: gallery ------------------------------------------ */}
            <div style={{ background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden" }}>

              {/* tab bar */}
              <div style={{
                padding:"10px 14px", borderBottom:`1px solid ${C.border}`,
                display:"flex", alignItems:"center", justifyContent:"space-between",
                background:C.bgSec,
              }}>
                <div style={{
                  display:"flex", gap:2, padding:3,
                  background:C.bgHover, border:`1px solid ${C.border}`,
                  borderRadius:9, overflowX:"auto",
                }}>
                  {TABS.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} style={{
                      height:30, padding:"0 14px",
                      background: tab === t.id ? C.bgCard : "transparent",
                      color: tab === t.id ? C.text : C.text3,
                      border:"none", borderRadius:7,
                      fontSize:12.5, fontWeight: tab === t.id ? 600 : 400,
                      cursor:"pointer", whiteSpace:"nowrap",
                      boxShadow: tab === t.id ? `0 0 0 1px ${C.borderH}` : "none",
                      transition:"all 0.12s",
                    }}>{t.label}</button>
                  ))}
                </div>
                <Badge color="green"> Validé</Badge>
              </div>

              <div style={{ padding:24 }}>

                {/* Supports */}
                {tab === "supports" && (
                  <>
                    <GalleryHeader title="Assets composés" desc="Sharp + Satori · pixel-perfect · aperçu en temps réel" badge={<Badge color="gray">5 assets</Badge>} />
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:14 }}>
                      <AssetCard title="Bannière réseaux"   spec="1200 × 630 px · ratio 1.91:1"       desc="LinkedIn, X et en-tête web."          tag="Digital"   tagColor="gray"><PreviewBanner b={brand} /></AssetCard>
                      <AssetCard title="Carte de visite"   spec="1050 × 600 px · 85 × 55 mm" desc="Print-ready 300 DPI, zone de sécurité 36px."  tag="300 DPI"   tagColor="green"><PreviewCard b={brand} /></AssetCard>
                      <AssetCard title="Publication carrée"     spec="1080 × 1080 px · ratio 1:1"      desc="Instagram, Facebook, LinkedIn feed."   tag="Digital"   tagColor="gray"><PreviewSquare b={brand} /></AssetCard>
                      <AssetCard title="Publication verticale"   spec="1080 × 1920 px · ratio 9:16"      desc="Stories et Reels, plein format."        tag="Digital"   tagColor="gray"><PreviewVertical b={brand} /></AssetCard>
                      <AssetCard title="Avatar"          spec="400 × 400 px · ratio 1:1"        desc="Lisible à 32px sur tous les réseaux." tag="Digital"   tagColor="gray"><PreviewAvatar b={brand} /></AssetCard>
                    </div>
                  </>
                )}

                {/* Mockups */}
                {tab === "mockups" && (
                  <>
                    <GalleryHeader title="Mockups de présentation" desc={'Cadre plat déterministe · étiquetés « présentation » (Exig. 23)'} badge={<Badge color="blue">Exig. 23</Badge>} />
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:14 }}>
                      <AssetCard title="Mockup carte de visite" spec="1200 × 800 px" desc="Cadre plat, sans déformation de perspective." tag="Présentation" tagColor="gray">
                        <MockupCard brand={brand} />
                      </AssetCard>
                      <AssetCard title="Mockup enseigne" spec="1200 × 800 px" desc="Intégration murale sombre, lisibilité nocturne." tag="Presentation" tagColor="gray">
                        <MockupSignage brand={brand} />
                      </AssetCard>
                      <AssetCard title="Mockup textile" spec="1200 × 800 px" desc="Brodé ou imprimé sur coton." tag="Presentation" tagColor="gray">
                        <MockupApparel brand={brand} />
                      </AssetCard>
                      <AssetCard title="Mockup écran" spec="1200 × 800 px" desc="Contexte application mobile native." tag="Presentation" tagColor="gray">
                        <MockupDevice brand={brand} />
                      </AssetCard>
                    </div>
                  </>
                )}

                {/* Brandbook */}
                {tab === "brandbook" && (
                  <>
                    <GalleryHeader title="Guide de marque PDF" desc="14 sections obligatoires · @react-pdf/renderer · polices OFL intégrées"
                      badge={
                        <Btn variant="ghost" small onClick={() => alert("Le brandbook PDF est généré automatiquement après la complétion du pipeline. Lancez /newbrand sur Telegram pour démarrer.")}>
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M4 10l4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 14h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
                          Télécharger PDF
                        </Btn>
                      }
                    />
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))", gap:8 }}>
                      {BOOK.map(([n, title, desc]) => (
                        <div key={n} style={{
                          background:C.bgSec, border:`1px solid ${C.border}`,
                          borderRadius:10, padding:"10px 12px", transition:"border-color 0.12s", cursor:"default",
                        }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = C.borderH)}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                        >
                          <div style={{ fontFamily:C.mono, fontSize:10, color:C.accent, fontWeight:500, marginBottom:5 }}>§{n}</div>
                          <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:3 }}>{title}</div>
                          <div style={{ fontSize:11.5, color:C.text3 }}>{desc}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Export */}
                {tab === "export" && (
                  <>
                    <GalleryHeader title="Archive de livraison" desc="Archiver · README.txt inclus · livré via Telegram sendDocument"
                      badge={
                        <Btn variant="primary" small onClick={() => alert("L'archive ZIP est livrée automatiquement dans votre conversation Telegram à la fin du pipeline. Lancez /newbrand pour démarrer.")}>
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M4 10l4 4 4-4" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 14h12" stroke="#fff" strokeWidth="1.7" strokeLinecap="round"/></svg>
                          Télécharger ZIP
                        </Btn>
                      }
                    />
                    <div style={{
                      background:"#0F172A", border:`1px solid #1E293B`,
                      borderRadius:10, padding:"18px 20px",
                      fontFamily:C.mono, fontSize:12.5, lineHeight:2,
                    }}>
                      {[
                        { d:0, t:"file", n:` ${slug(brand.name)}_brand_pack.zip` },
                        { d:1, t:"dir",  n:"logo/" },
                        { d:2, t:"file", n:"original/", c:"  fichier source, intact" },
                        { d:1, t:"dir",  n:"assets/" },
                        { d:2, t:"file", n:"avatar.png",           c:"400×400" },
                        { d:2, t:"file", n:"banner.png",           c:"1200×500" },
                        { d:2, t:"file", n:"business_card.png",    c:"1050×600 · 300 DPI" },
                        { d:2, t:"file", n:"post_square.png",      c:"1080×1080" },
                        { d:2, t:"file", n:"post_vertical.png",    c:"1080×1920" },
                        { d:1, t:"dir",  n:"mockups/" },
                        { d:2, t:"dir",  n:"business_card/  enseignes/  apparel/  screens/" },
                        { d:1, t:"dir",  n:"brandbook/" },
                        { d:2, t:"file", n:`brandbook_${slug(brand.name)}.pdf` },
                        { d:1, t:"file", n:"README.txt", c:"  guide d'utilisation + notice cadre plat" },
                      ].map((row, i) => (
                        <div key={i} style={{ paddingLeft:row.d*16, color:row.t==="dir"?"#818cf8":C.text2 }}>
                          {row.t==="dir" ? row.n : <><span style={{ color:row.d===0?C.text:C.text2 }}>{row.n}</span>{row.c && <span style={{ color:C.text3 }}> {row.c}</span>}</>}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Quality */}
                {tab === "quality" && (
                  <>
                    <GalleryHeader title="Audit qualité" desc="Chaque fichier vérifié avant livraison   déterministe, zéro inférence ML"
                      badge={<Badge color="green">6 / 6 validés</Badge>}
                    />
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {CHECKS.map(c => (
                        <div key={c.name} style={{
                          display:"flex", alignItems:"center", gap:14,
                          padding:"12px 14px",
                          background:C.bgSec,
                          border:"1px solid rgba(0,212,170,0.18)",
                          borderRadius:10,
                        }}>
                          <div style={{
                            width:28, height:28, borderRadius:"50%", flexShrink:0,
                            background:"rgba(0,212,170,0.1)", border:"1px solid rgba(0,212,170,0.3)",
                            display:"flex", alignItems:"center", justifyContent:"center",
                          }}>
                            <CheckIcon />
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:13.5, fontWeight:600, color:C.text, marginBottom:2 }}>{c.name}</div>
                            <div style={{ fontSize:12, color:C.text2 }}>{c.note}</div>
                          </div>
                          <Badge color="green">{c.result}</Badge>
                        </div>
                      ))}
                    </div>
                  </>
                )}

              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -- Comparison table ------------------------------------------------ */}
      <section id="comparaison" style={{ padding:"80px 24px", background:C.bgSec, borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ maxWidth:1280, margin:"0 auto" }}>
          <SectionTag>Pourquoi ce pipeline ?</SectionTag>
          <Heading size="xl">Qualité agence.<br />Vitesse pipeline.</Heading>
          <div style={{ marginTop:40, overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr>
                  {["Fonctionnalité","Outils templates","Agence classique","Brand Studio"].map((h,i) => (
                    <th key={h} style={{
                      padding:"10px 16px", textAlign:"left",
                      borderBottom:`1px solid ${C.border}`,
                      color: i===3 ? C.accent : C.text2,
                      fontWeight: i===3 ? 700 : 500,
                      fontFamily: i===3 ? C.sans : C.sans,
                      fontSize: 12,
                      textTransform:"uppercase", letterSpacing:"0.04em",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Délai de livraison",         "Quelques minutes",    "3–6 mois",            "< 1 heure, complet"],
                  ["Fondation stratégique",      "Templates fixes",     "Recherche manuelle",  "Charte LLM + analyse vision"],
                  ["Recherche concurrentielle",  "x",                   "Manuel",              " Analyse automatisée"],
                  ["Fichiers vectoriels SVG",    "x",                   "",                   ""],
                  ["25+ modèles de contenu",     "x",                   "x",                  ""],
                  ["Roadmap lancement 90j",      "x",                   "Coût supplémentaire", ""],
                  ["Guide de marque live",       "x",                   "PDF statique",        " Toujours à jour"],
                  ["Régénération instantanée",   "x",                   "Coût supplémentaire", " Consomme des BRS"],
                ].map(([feat, ...vals]) => (
                  <tr key={feat}>
                    <td style={{ padding:"11px 16px", borderBottom:`1px solid ${C.border}`, color:C.text2, fontWeight:500 }}>{feat}</td>
                    {vals.map((v,i) => (
                      <td key={i} style={{
                        padding:"11px 16px", borderBottom:`1px solid ${C.border}`,
                        color: i===2 ? C.text : C.text3,
                        fontWeight: i===2 ? 500 : 400,
                        background: i===2 ? "rgba(0,102,255,0.03)" : "transparent",
                      }}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* -- CTA footer ------------------------------------------------------ */}
      <section style={{ padding:"80px 24px", textAlign:"center" }}>
        <div style={{ maxWidth:640, margin:"0 auto" }}>
          <Heading size="xl">Votre identité mérite mieux<br />qu'un template.</Heading>
          <p style={{ fontSize:15, color:C.text2, margin:"16px auto 40px", maxWidth:480 }}>
            Envoyez /newbrand sur Telegram. Recevez votre pack complet en moins d'une heure.
          </p>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12 }}>
            <Btn variant="primary" onClick={() => document.getElementById("app")?.scrollIntoView({behavior:"smooth"})}>
              Lancer /newbrand →
            </Btn>
            <Btn variant="ghost" onClick={() => document.getElementById("pipeline")?.scrollIntoView({behavior:"smooth"})}>Voir le pipeline</Btn>
          </div>
        </div>
      </section>

      {/* -- Footer ---------------------------------------------------------- */}
      <footer style={{
        borderTop:`1px solid ${C.border}`, background:C.bg,
        padding:"32px 24px",
      }}>
        <div style={{ maxWidth:1280, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{
              width:26, height:26, borderRadius:6,
              background:C.bgCard, border:`1px solid ${C.borderH}`,
              display:"grid", gridTemplateColumns:"1fr 1fr", gap:3, padding:5,
            }}>
              <div style={{ borderRadius:2, background:C.text }} />
              <div style={{ borderRadius:2, background:C.accent }} />
              <div style={{ borderRadius:2, background:C.accent }} />
              <div style={{ borderRadius:2, background:C.text3 }} />
            </div>
            <span style={{ fontWeight:700, fontSize:14, color:C.text }}>Brand Studio</span>
          </div>
          <div style={{ display:"flex", gap:24 }}>
            {([
              { label:"Documentation", href:"#pipeline"     },
              { label:"Conditions",    href:"#comparaison"  },
              { label:"Confidentialité", href:"#hero"       },
              { label:"Statut",        href:"#hero"         },
            ]).map(({ label, href }) => (
              <a key={label} href={href} style={{ fontSize:12, color:C.text3, textDecoration:"none" }}
                onMouseEnter={e => (e.currentTarget.style.color = C.text2)}
                onMouseLeave={e => (e.currentTarget.style.color = C.text3)}
              >{label}</a>
            ))}
          </div>
          <p style={{ fontFamily:C.mono, fontSize:11, color:C.text3 }}>© 2026 Brand Studio · Bot Telegram privé · Tous droits réservés.</p>
        </div>
      </footer>

    </div>
  );
}

/* --- Small helpers ------------------------------------------------------ */

function InputField({ label, value, onChange }: { label:string; value:string; onChange:(v:string)=>void }) {
  const [foc, setFoc] = useState(false);
  return (
    <div>
      <label style={{ display:"block", fontSize:12, fontWeight:500, color:C.text2, marginBottom:5 }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)}
        onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
        style={{
          width:"100%", height:38, padding:"0 12px",
          background:C.bgHover, border:`1px solid ${foc?C.accent:C.border}`,
          borderRadius:8, fontSize:13.5, color:C.text, outline:"none", transition:"border-color 0.15s",
        }} />
    </div>
  );
}

function SwatchPicker({ label, value, onChange }: { label:string; value:string; onChange:(v:string)=>void }) {
  const id = `sw-${label}`;
  return (
    <div style={{ background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:8, overflow:"hidden", cursor:"pointer" }}
      onClick={() => document.getElementById(id)?.click()}
      onMouseEnter={e => (e.currentTarget.style.borderColor = C.borderH)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
    >
      <input id={id} type="color" value={value} onChange={e => onChange(e.target.value)} style={{ opacity:0, position:"absolute", width:0, height:0 }} />
      <div style={{ height:38, background:value }} />
      <div style={{ padding:"5px 8px" }}>
        <div style={{ fontFamily:C.mono, fontSize:10, color:C.text2, fontWeight:500 }}>{value}</div>
        <div style={{ fontSize:10, color:C.text3, marginTop:1 }}>{label}</div>
      </div>
    </div>
  );
}

function PipeRow({ label, sub, ms, state }: { label:string; sub:string; ms:string; state:"idle"|"active"|"done" }) {
  const dotBg = state==="active" ? C.accent : state==="done" ? "#00D4AA" : C.border;
  const txtCol = state==="active" ? C.accent : state==="done" ? "#00D4AA" : C.text2;
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:10, padding:"7px 10px", borderRadius:8,
      background: state==="active" ? C.accentD : state==="done" ? "rgba(0,212,170,0.06)" : "transparent",
      border:`1px solid ${state==="active" ? C.accentB : state==="done" ? "rgba(0,212,170,0.2)" : "transparent"}`,
      transition:"all 0.2s",
    }}>
      <div style={{
        width:18, height:18, borderRadius:"50%", flexShrink:0,
        background:dotBg, border:`1px solid ${state==="idle"?C.borderH:"transparent"}`,
        display:"flex", alignItems:"center", justifyContent:"center",
        transition:"background 0.2s",
      }}>
        {state==="done" && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 5.5l2 2 4-4" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        {state==="active" && <div style={{ width:5, height:5, borderRadius:"50%", background:"#fff" }} />}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, fontWeight:500, color:txtCol, lineHeight:1.3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{label}</div>
        <div style={{ fontSize:10, color:C.text3, fontFamily:C.mono }}>{sub}</div>
      </div>
      <div style={{ fontFamily:C.mono, fontSize:10, color:C.text3, flexShrink:0 }}>{ms}</div>
    </div>
  );
}

function GalleryHeader({ title, desc, badge }: { title:string; desc:string; badge:React.ReactNode }) {
  return (
    <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:20 }}>
      <div>
        <h2 style={{ fontFamily:C.head, fontSize:20, fontWeight:800, color:C.text, marginBottom:4, letterSpacing:"-0.015em" }}>{title}</h2>
        <p style={{ fontSize:12.5, color:C.text3 }}>{desc}</p>
      </div>
      <div style={{ flexShrink:0, marginTop:2 }}>{badge}</div>
    </div>
  );
}

function MockupCard({ brand:b }: { brand:Brand }) {
  return (
    <div style={{ aspectRatio:"3/2", background:C.bgSec, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{
        width:"64%", height:"66%", background:"#FFFFFF",
        border:`1px solid ${C.border}`, borderRadius:8,
        boxShadow:"0 4px 20px rgba(0,0,0,0.10)",
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6,
      }}>
        <div style={{ width:16, height:16, borderRadius:3, background:b.c1, boxShadow:`0 0 10px ${b.c1}99` }} />
        <span style={{ fontFamily:C.head, fontSize:13, fontWeight:700, color:"#0F172A" }}>{b.name}</span>
        <span style={{ fontFamily:C.mono, fontSize:9, color:"#94A3B8" }}>hello@{slug(b.name)}.co</span>
      </div>
    </div>
  );
}
function MockupSignage({ brand:b }: { brand:Brand }) {
  return (
    <div style={{ aspectRatio:"3/2", background:"#1a1a2e", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{
        width:"66%", height:"50%", background:"#0d0d0f",
        border:`1px solid ${C.borderH}`, borderRadius:8,
        boxShadow:`0 0 60px ${b.c1}22`,
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:4,
      }}>
        <span style={{ fontFamily:C.head, fontWeight:900, fontSize:14, color:C.text, letterSpacing:"0.1em" }}>{b.name.toUpperCase()}</span>
        <span style={{ fontFamily:C.mono, fontSize:9, color:C.text3 }}>FAÇADE</span>
      </div>
    </div>
  );
}
function MockupApparel({ brand:b }: { brand:Brand }) {
  return (
    <div style={{ aspectRatio:"3/2", background:C.bgHover, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{
        width:"56%", height:"62%", background:"#FFFFFF",
        border:`1px solid ${C.border}`, borderRadius:8,
        boxShadow:"0 4px 16px rgba(0,0,0,0.08)",
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6,
      }}>
        <div style={{ width:20, height:20, borderRadius:"50%", background:b.c1, boxShadow:`0 0 12px ${b.c1}88` }} />
        <span style={{ fontFamily:C.head, fontSize:12, fontWeight:700, color:"#0F172A" }}>{b.name}</span>
      </div>
    </div>
  );
}
function MockupDevice({ brand:b }: { brand:Brand }) {
  return (
    <div style={{ aspectRatio:"3/2", background:"#1a1a2e", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{
        width:"38%", background:"#1e293b", borderRadius:18,
        border:`3px solid #334155`,
        overflow:"hidden", boxShadow:"0 12px 32px rgba(0,0,0,0.25)",
        display:"flex", flexDirection:"column",
      }}>
        <div style={{ height:20, background:"#0f172a", display:"flex", alignItems:"center", justifyContent:"flex-end", paddingRight:8, gap:4 }}>
          <div style={{ width:12, height:5, borderRadius:99, border:`1.5px solid ${C.borderH}` }}>
            <div style={{ width:"75%", height:"100%", background:"#00D4AA", borderRadius:99 }} />
          </div>
        </div>
        <div style={{
          background:"#fff", padding:"14px 10px",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontFamily:C.head, fontSize:13, fontWeight:700, color:"#0F172A",
        }}>{b.name}</div>
        <div style={{ height:18, background:"#0f172a", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ width:28, height:3, borderRadius:99, background:C.borderH }} />
        </div>
      </div>
    </div>
  );
}

function SpinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{ animation:"spin 1s linear infinite" }}
    >
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  );
}
