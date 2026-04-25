# Tombolone — Guida per Claude

Documento di contesto per chi (Claude o umano) interviene su questo progetto.
Per la documentazione utente, vedi `README.md`.

---

## 1. Obiettivo del progetto

Companion web per la **tombola italiana giocata in famiglia**. Non è un gioco
completo: l'estrazione fisica avviene fuori dall'app (mescolatore, urna, voce
del banditore). L'app supporta il banditore con:

- tabellone visivo aggiornato in tempo reale,
- input rapido del numero estratto (click sulla pallina o tastiera),
- "reveal" cinematografico del numero (con smorfia napoletana opzionale),
- gestione fasce e dichiarazione vincite con verifica cartella,
- secondo schermo dedicato al pubblico (proiettore / TV).

**Pubblico**: famiglie italiane, contesto natalizio/festivo, banditore non
necessariamente tecnico. Quindi: zero attrito, zero installazione, gira
offline, nessun account, nessun cloud.

---

## 2. Vincoli "duri" (non negoziabili senza chiedere)

1. **Nessun build step.** Il codice che apri è il codice che gira. Niente npm,
   niente bundler, niente transpiler. L'utente deve poter aprire `index.html`
   con un doppio-click e funzionare.
2. **Funziona via `file://` *e* via `http://localhost`.** Il dual-monitor
   richiede `localhost` (vedi §6), ma il single-window deve girare anche da
   filesystem. Questo vincolo elimina tutto ciò che richiede CORS o origini.
3. **Offline-first.** Nessuna API esterna a runtime. Le uniche risorse esterne
   sono i Google Fonts (caricati e cachati al primo avvio).
4. **Italiano ovunque.** UI, codice, commenti, messaggi d'errore. L'utente
   parla italiano. Vedi anche memoria `italian-communication.md`.
5. **localStorage è l'unica persistenza.** Niente IndexedDB, niente cookie,
   niente file salvati. La chiave è `tombolone:state:v1`.

---

## 3. Stack tecnico e perché

| Scelta | Motivazione |
|---|---|
| **Alpine.js 3.x** (bundle locale `js/alpine.min.js`, ~46 kb) | Reattività dichiarativa nell'HTML senza build step. Niente JSX, niente compile, niente `npm install`. È la scelta giusta per un'app monolitica statica come questa. React/Vue richiederebbero un toolchain. |
| **Vanilla CSS** + **CSS custom properties** | Tematizzazione con `--var`. Niente preprocessori. |
| **Container Queries** (`cqmin`, `cqw`, `cqh`) sul display pubblico | Le pallinas devono scalare in base al loro **container** reale, non alla viewport: il display può essere proiettato su risoluzioni molto diverse (1366×768 → 1920×1080) e deve riempire sempre lo spazio senza scroll né clipping. |
| **`<dialog>` nativo** per i modal | Backdrop, focus trap, ESC-to-close gratis. Stilato con `::backdrop`. |
| **`BroadcastChannel`** + fallback **`storage` event** | Sync banditore ↔ display senza server. `BroadcastChannel` è la via principale; `storage` event copre i casi `file://` dove `BroadcastChannel` può non attraversare. |
| **Plain `<script defer>`** (no `type="module"`) | Vedi §7. ES modules + `file://` = CORS hell su Chrome. |
| **Fraunces** (display) + **Newsreader** (body) — Google Fonts | Stile editoriale italiano, opsz variabile per scaling tipografico raffinato. Esplicitamente NON Inter / Space Grotesk / system-ui. |

---

## 4. Architettura

```
┌──────────────────────────────────────────────────────────────────┐
│  index.html   (banditore — controlli, input, dichiarazione vinte) │
└──────────────────────────────────────────────────────────────────┘
                       ▲                               ▲
                       │                               │
                       │   $store.tombola              │   localStorage:
                       │   (Alpine.store, singleton)   │   "tombolone:state:v1"
                       │                               │
                       ▼                               ▼
            ┌─────────────────────┐       ┌─────────────────────────┐
            │   js/store.js       │ ───▶  │  BroadcastChannel       │
            │   - state           │       │  channel "tombolone"    │
            │   - persist effect  │       │                         │
            │   - actions         │ ◀───  │  storage event fallback │
            └─────────────────────┘       └─────────────────────────┘
                       ▲                               ▲
                       │                               │
                       ▼                               │
┌──────────────────────────────────────────────────────────────────┐
│  display.html   (schermo pubblico — read-only, no controlli)      │
└──────────────────────────────────────────────────────────────────┘
```

### Separazione delle responsabilità

- **`js/store.js`** — *stato + persistenza + sync*. Singolo `Alpine.store('tombola')`.
  Definisce: state shape, computed (`ultimo`, `fasceAttive`, ...), e azioni
  (`estrai`, `undo`, `reset`, `completeSetup`, `dichiaraVincitore`,
  `verificaCartella`, `aggiornaImpostazioni`, `applyRemote`). **Tutta** la
  logica di dominio vive qui. Le componenti UI non mutano lo stato direttamente.

- **`js/app.js`** — *componenti UI del banditore*. Cinque `Alpine.data`:
  `setupForm`, `gameView`, `modalVincitore`, `modalImpostazioni`,
  `modalVerifica`, `toasts`. Solo stato locale UI (input buffer, flag di
  animazione, errori di form). Per mutare lo stato globale chiamano azioni
  dello store.

- **`js/display.js`** — *componente del display pubblico*. Un solo
  `Alpine.data('displayView')` che osserva `$store.tombola.estratti.length` e
  triggera la cerimonia (vedi §5).

- **`js/smorfia.js`** — dizionario costante `window.SMORFIA = {1: "L'Italia", ...}`.
  Plain script, espone un global. NON è un ES module (vedi §7).

- **`css/style.css`** — stile completo, 4 sezioni macro:
  setup → game (banditore) → modal/toast → display (schermo pubblico) →
  cerimonia. La sezione "DISPLAY PAGE" è quella più delicata: usa container
  queries e va capita prima di toccarla.

### Eventi cross-componente

Le componenti UI comunicano via `window.dispatchEvent` con eventi custom:
- `apri-vincitore` (con `detail: { fasciaId }`)
- `apri-impostazioni`
- `apri-verifica`
- `toast` (con `detail: { msg }`)

I modal ascoltano in `init()` e si aprono via `this.$root.showModal()`.

---

## 5. Animazioni e timing

Due animazioni "cinematografiche" diverse:

### Reveal (banditore + display)
Quando arriva un nuovo numero, gli elementi `.reveal .numero/.smorfia/.decina`
ricevono la classe `.animate` e fanno un pop-in. Reset/replay tramite il
toggle `animateReveal` (false → `$nextTick` → true) per ri-triggerare le
keyframe a ogni estrazione anche se il DOM non cambia.

### Cerimonia (solo display)
Overlay fullscreen scuro con il numero gigante. Tre fasi:
1. Pop-in al centro (scale + rotate + blur out).
2. Hold grande e fermo.
3. Trasla verso sinistra + scale down + fade.

**Durata configurabile 1.5s–30s** via slider in Impostazioni
(`setup.durataCerimonia`, default 4500ms). La durata è applicata in TRE punti
per assicurarsi che venga rispettata (vedi §7 "Animation duration"):

1. CSS variable `--ceremony-duration` settata su `<body>`.
2. Inline `style.animationDuration` su `.ceremony` e `.ceremony-num` via JS
   in un `requestAnimationFrame` (belt-and-suspenders).
3. `setTimeout` JS che disattiva `ceremonyActive` allo scadere.

---

## 6. Comandi e workflow

```bash
# Avvio rapido (single-window, no dual-monitor)
open index.html              # macOS — doppio click equivalente

# Avvio con server (necessario per dual-monitor + sync robusto)
./start.sh                   # python3 -m http.server 8080 + apre browser

# Server manualmente
python3 -m http.server 8080
# poi apri http://localhost:8080

# Git
git status
git log --oneline
git push                     # remote: git@github.com:michelemarri/Tombolone.git
```

Non c'è npm, non c'è test runner, non c'è linter, non c'è CI. Se servono in
futuro, **chiedi prima** — l'assenza è una scelta esplicita.

---

## 7. Gotchas e anti-pattern (lezioni apprese)

Ognuno di questi è un errore già fatto in passato. **Non rifarli.**

### 7.1 ES modules su `file://` — Chrome blocca con CORS error
**Sintomo**: pagina bianca, console:
`Access to script at 'file:///.../foo.js' from origin 'null' blocked by CORS`.

**Causa**: `<script type="module">` impone CORS, ogni file `file://` è
un'origine separata e quindi tutto fallisce.

**Fix**: usare `<script defer src="...">` (no `type="module"`) e esporre i
moduli come globals (`window.SMORFIA = {...}`). NON convertire smorfia.js,
store.js, app.js, display.js in ES modules.

### 7.2 `container-type: size` collassa il figlio se applicato sul `.tabellone`
**Sintomo**: tabellone si riduce a 0×0.

**Causa**: `container-type: size` impone "size containment", che impedisce
ai children di influenzare la dimensione del parent. Se il parent (.tabellone)
non ha dimensione propria, collassa.

**Fix**: applicare `container-type: size` sul **wrapper** (`.display-tabellone`),
NON su `.tabellone`. Il wrapper riceve la dimensione dal grid, e il figlio
.tabellone si stretcha a 100% × 100% di quella dimensione.

### 7.3 Pallinas che si sovrappongono / ovali
**Sintomo**: con `aspect-ratio: 1; width: 100%; height: 100%` le pallinas
diventano ovali o si sovrappongono perché width e height non sono coerenti
con il vincolo aspect-ratio.

**Fix**:
```css
.display-tabellone .pallina {
  aspect-ratio: 1;
  height: 100%;        /* primary: row-bound */
  width: auto;         /* derivato da aspect-ratio */
  max-width: 100%;     /* clampa se più larga della colonna */
  max-height: 100%;
  align-self: center;
  justify-self: center;
}
```
Risultato: `min(row_height, col_width)`. Mai overlap, sempre quadrate.

### 7.4 `overflow: hidden` clippa il glow delle pallinas appena estratte
**Sintomo**: `box-shadow` diffuso sulle pallinas vicine al bordo viene tagliato.

**Fix**: NON mettere `overflow: hidden` su `.display-tabellone`. La tabellone
è già constrained dimensionalmente, quindi non c'è overflow strutturale, solo
visivo dei box-shadow che però è desiderato.

### 7.5 Animation duration ignorata da Chrome
**Sintomo**: cambi `--ceremony-duration` ma l'animazione gira sempre alla
durata vecchia.

**Causa**: cascade/specificità tra CSS variable e `animation-duration`
shorthand può fare cose strane, specie se il keyframe è già in corso.

**Fix**: triplo guard — CSS variable + `style.animationDuration` inline via
`requestAnimationFrame` + `setTimeout` JS che chiude. Vedi
`js/display.js:onNuovaEstrazione`.

### 7.6 Alpine `x-show` senza `x-cloak` → flash di contenuto
**Sintomo**: prima del boot di Alpine vedi tutti i `<dialog>` e le sezioni
condizionali in chiaro per un frame.

**Fix**: aggiungi `x-cloak` su tutti gli elementi con `x-show` e regole
top-level: `[x-cloak] { display: none !important; }` (già in `style.css`).

### 7.7 Selettori CSS legati a `id`/`name` rimossi dal refactor Alpine
**Lezione**: quando converti markup imperativo in dichiarativo Alpine, gli
`id` hardcoded scompaiono. Aggiorna i selettori CSS di conseguenza, oppure
usa classi semantiche (`.setup form` invece di `#form-setup`).

---

## 8. Convenzioni di codice

- **Niente commenti su WHAT**, solo su WHY non-ovvi (vincoli, workaround, gotchas).
- **Italian-friendly identifiers** quando si tratta di dominio: `fasce`,
  `vincitori`, `banditore`, `cartella`, `estratti`. Sono parole tecniche del
  gioco, non vanno tradotte.
- **`Number(x)`** per coercion, non `parseInt` (default radix 10 implicito).
- **`structuredClone`** per copie profonde (es. `FASCE_DEFAULT`).
- **`?? ''`** per default friendly su stringhe nullable.
- **Eventi DOM custom + `$dispatch`** invece di accoppiare componenti via
  refs o globals.
- **Mai `innerHTML` con dati dinamici** (security hook lo blocca, e Alpine
  rende inutile farlo). Usare template Alpine con `x-text`/`x-html`/`x-for`.

### Naming
- Camel case per JS (`durataCerimonia`, `nuovaPartita`).
- Kebab case per CSS classes e custom events (`apri-vincitore`,
  `display-tabellone`, `ceremony-num`).
- Files in lowercase (`store.js`, `display.html`).

---

## 9. Quando aggiungere/rimuovere/cambiare cose

### Cambio dello state shape
1. Bumpa la versione: cambia `STATE_KEY` da `tombolone:state:v1` a `:v2`,
   oppure aggiungi una migration in `loadInitial()`.
2. Aggiorna `initialState()`.
3. Aggiorna `applyRemote()` — lì si vede chi viene sincronizzato.
4. Aggiorna lo snapshot in `Alpine.effect` di `init()`.

### Nuova fascia di default
Modifica `FASCE_DEFAULT` in `store.js`. Ogni fascia: `{ id, nome, numeri,
attiva, vinta }`. `id` deve essere stabile (usato come `:key` nei `x-for`
e per matching dei vincitori).

### Nuovo modal
1. `<dialog class="modal" x-data="modalNuovo">` in `index.html`.
2. `Alpine.data('modalNuovo', () => ({...}))` in `app.js`.
3. Listener su evento custom in `init()` → `this.$root.showModal()`.
4. Trigger: `@click="$dispatch('apri-nuovo', {...})"` da qualche bottone.

### Nuova vista display
Mantieni `display.html` **read-only**. Tutta la mutazione passa dal banditore.
Se serve un'azione interattiva sul pubblico, riconsidera l'architettura
(bidirezionale richiederebbe gestione di conflitti).

---

## 10. Cose che NON servono e che è facile aggiungere per sbaglio

- ❌ Routing (è una single-page, due file statici).
- ❌ State management library (Alpine.store basta).
- ❌ Test framework (l'app è semplice, testata a mano in famiglia).
- ❌ TypeScript (no build step).
- ❌ Service Worker / PWA (l'utente apre `index.html`, non installa nulla).
- ❌ Analytics (zero telemetria, zero account).
- ❌ Backend di qualunque tipo.
- ❌ npm / package.json.

Se l'utente chiede una di queste cose, **discuti prima** — probabilmente c'è
un fraintendimento o un caso d'uso nuovo che cambia i vincoli §2.

---

## 11. Stato attuale (snapshot 2026-04-25)

- ✅ Setup partita con fasce configurabili (Ambo, Terno disabilitato di
  default, Quaterna, Cinquina, Tombola, + custom).
- ✅ Estrazione via click pallina o tastiera (digit + Invio).
- ✅ Reveal animato banditore.
- ✅ Smorfia napoletana opzionale (1–90).
- ✅ Display pubblico (`display.html`) read-only, responsive 16:9.
- ✅ Sync cross-window: BroadcastChannel + storage event fallback.
- ✅ Persistenza localStorage (`tombolone:state:v1`).
- ✅ Modal vincitore con OTP-style verifica numeri cartella.
- ✅ Modal verifica cartella standalone.
- ✅ Modal impostazioni (smorfia toggle + durata cerimonia 1.5s–30s).
- ✅ Modalità presentazione (`P` per toggle, sfondo scuro, controlli nascosti).
- ✅ Cerimonia di estrazione: numero XXL al centro che trasla a sinistra,
  durata configurabile.
- ✅ Undo (`Cmd/Ctrl+Z` o bottone "Annulla ultimo").
- ✅ Toasts.
- ✅ Repo GitHub: <https://github.com/michelemarri/Tombolone>.

### Non ancora implementato (idee non richieste)
- Salvataggio multi-partita / cronologia.
- Esportazione PDF/PNG dei vincitori.
- Suoni / TTS del numero estratto.
- Multi-lingua (è esplicitamente solo italiano).

---

## 12. Risorse

- **Repo**: <https://github.com/michelemarri/Tombolone>
- **Alpine.js docs**: <https://alpinejs.dev>
- **Container queries spec**: <https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_container_queries>
- **`<dialog>` element**: <https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog>
- **BroadcastChannel API**: <https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel>
