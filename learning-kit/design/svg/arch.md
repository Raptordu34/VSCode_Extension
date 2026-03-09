# Architecture — SVG Elements

> Conventions : voir `CATALOG.md`

Formes pour schémas d'architecture système. Toutes en viewBox carrée 80×80 sauf exceptions.

---

## arch-client

Moniteur/navigateur — représente un utilisateur final ou un terminal.

```html
<svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="8" width="64" height="44" rx="5"
    fill="rgba(214,117,86,0.08)" stroke="#d67556" stroke-width="1.5"/>
  <line x1="40" y1="52" x2="40" y2="62" stroke="#d67556" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="28" y1="62" x2="52" y2="62" stroke="#d67556" stroke-width="1.5" stroke-linecap="round"/>
  <text x="40" y="72" text-anchor="middle"
    font-family="'Inter',system-ui,sans-serif" font-size="9" fill="#9e9a94">Client</text>
</svg>
```

---

## arch-server

Serveur en rack — API, backend, applicatif.

```html
<svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="12" y="10" width="56" height="52" rx="4"
    fill="rgba(214,117,86,0.08)" stroke="#d67556" stroke-width="1.5"/>
  <line x1="12" y1="28" x2="68" y2="28" stroke="#d67556" stroke-width="1" stroke-dasharray="3 2" opacity="0.5"/>
  <line x1="12" y1="44" x2="68" y2="44" stroke="#d67556" stroke-width="1" stroke-dasharray="3 2" opacity="0.5"/>
  <circle cx="22" cy="20" r="2.5" fill="#d67556" opacity="0.7"/>
  <circle cx="22" cy="36" r="2.5" fill="#d67556" opacity="0.4"/>
  <circle cx="22" cy="52" r="2.5" fill="#5ba6a0" opacity="0.6"/>
  <text x="40" y="74" text-anchor="middle"
    font-family="'Inter',system-ui,sans-serif" font-size="9" fill="#9e9a94">Serveur</text>
</svg>
```

---

## arch-database

Cylindre — base de données SQL, NoSQL, cache.

```html
<svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="14" y="22" width="52" height="36" fill="rgba(214,117,86,0.08)" stroke="none"/>
  <line x1="14" y1="22" x2="14" y2="58" stroke="#d67556" stroke-width="1.5"/>
  <line x1="66" y1="22" x2="66" y2="58" stroke="#d67556" stroke-width="1.5"/>
  <ellipse cx="40" cy="58" rx="26" ry="8"
    fill="rgba(214,117,86,0.12)" stroke="#d67556" stroke-width="1.5"/>
  <ellipse cx="40" cy="22" rx="26" ry="8"
    fill="rgba(214,117,86,0.15)" stroke="#d67556" stroke-width="1.5"/>
  <!-- ellipse intermédiaire (optionnelle) -->
  <ellipse cx="40" cy="36" rx="26" ry="8"
    fill="none" stroke="#d67556" stroke-width="1" opacity="0.35" stroke-dasharray="4 3"/>
  <text x="40" y="76" text-anchor="middle"
    font-family="'Inter',system-ui,sans-serif" font-size="9" fill="#9e9a94">Base de données</text>
</svg>
```

> Variante sans ellipse intermédiaire : supprimer la dernière `<ellipse>`.

---

## arch-cloud

Nuage — service cloud, CDN, réseau externe.

```html
<svg width="90" height="80" viewBox="0 0 90 80" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M 22 52 C 10 52, 8 36, 18 32 C 16 18, 32 10, 44 20
           C 48 12, 62 12, 66 24 C 76 24, 82 36, 74 44
           C 74 50, 68 52, 62 52 Z"
    fill="rgba(214,117,86,0.08)" stroke="#d67556" stroke-width="1.5" stroke-linejoin="round"/>
  <text x="45" y="70" text-anchor="middle"
    font-family="'Inter',system-ui,sans-serif" font-size="9" fill="#9e9a94">Cloud</text>
</svg>
```

---

## arch-microservice

Hexagone — microservice, fonction Lambda, module isolé.

```html
<svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
  <polygon points="40,8 68,24 68,56 40,72 12,56 12,24"
    fill="rgba(91,166,160,0.08)" stroke="#5ba6a0" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="40" cy="40" r="4" fill="#5ba6a0" opacity="0.6"/>
  <text x="40" y="54" text-anchor="middle"
    font-family="'Inter',system-ui,sans-serif" font-size="8" fill="#5ba6a0">μService</text>
</svg>
```

---

## arch-queue

File de messages — message broker, event bus, buffer.

```html
<svg width="100" height="60" viewBox="0 0 100 60" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="10" width="88" height="40" rx="5"
    fill="rgba(214,117,86,0.08)" stroke="#d67556" stroke-width="1.5"/>
  <line x1="28" y1="10" x2="28" y2="50" stroke="#d67556" stroke-width="1" opacity="0.3"/>
  <line x1="50" y1="10" x2="50" y2="50" stroke="#d67556" stroke-width="1" opacity="0.3"/>
  <line x1="72" y1="10" x2="72" y2="50" stroke="#d67556" stroke-width="1" opacity="0.3"/>
  <path d="M 94 30 L 98 30" stroke="#d67556" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M 98 30 L 93 27 Q 95 30 93 33 Z" fill="#d67556"/>
</svg>
```
