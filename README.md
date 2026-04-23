# Tombolone

Companion web per la tombola in famiglia. Gira 100% nel browser, zero dipendenze esterne, tutto salvato in `localStorage`.

Il tabellone rispetta il layout tradizionale italiano (9 righe × 10 colonne con gap centrale, raggruppate in 3 blocchi da 30 numeri). Quando estrai un numero lo vedi grande al centro — con la smorfia napoletana se vuoi.

## Come si usa

### Monitor singolo — il modo più semplice
Apri `index.html` direttamente nel browser (doppio-click sul file).

Premi **P** per entrare in **modalità presentazione**: controlli nascosti, numero XXL, sfondo scuro. In presentazione puoi comunque digitare un numero da 1 a 90 e premere Invio per segnarlo — un piccolo indicatore in basso a destra mostra cosa stai digitando.

### Dual-monitor — per schermo pubblico + controllo banditore
Apri il terminale, vai nella cartella del progetto ed esegui:

```
./start.sh
```

(In alternativa, manualmente: `python3 -m http.server 8080` e poi apri `http://localhost:8080`.)

Poi, dal browser, clicca **Apri display**: si apre una seconda finestra che puoi trascinare sul secondo monitor o sul proiettore. Le due finestre si sincronizzano in tempo reale tramite `BroadcastChannel`.

> **Perché serve il server HTTP per il dual-monitor?**
> Quando apri file `file://` in browser moderni, ogni file è trattato come un'origine separata e la comunicazione tra finestre diventa fragile. Servire via `http://localhost` risolve il problema in modo pulito. Per il single-window (presentazione) il server non serve: basta aprire `index.html`.

## Flusso tipico di una partita

1. **Setup**: nome partita (opzionale), scegli le fasce che chiamerete (di default Ambo + Quaterna + Cinquina + Tombola sono attive; il Terno no — perché nella maggior parte delle partite viene saltato), abilita la smorfia se ti piace. Puoi rinominare le fasce o aggiungerne di custom (tombolino, premio del centro, ecc.).
2. **Gioco**: il banditore mescola a mano ed estrae; ogni numero uscito lo inserisce cliccando la pallina sul tabellone o digitando da tastiera e premendo Invio. Il numero compare in grande al centro e la pallina sul tabellone viene "stampata".
3. **Vincita**: quando qualcuno grida la sua, clicca **Dichiara** sulla fascia corrispondente. Inserisci il nome del vincitore e (opzionalmente) i numeri della sua cartella — se li inserisci, l'app verifica che siano tutti effettivamente usciti.
4. **Verifica cartella**: bottone standalone per controllare se una cartella è valida senza dichiarare vincita (per le volte in cui il giocatore ha il dubbio e il banditore vuole verificare al volo).
5. **Annulla**: se digiti un numero sbagliato, clicca "Annulla ultimo" o premi Cmd/Ctrl+Z. Puoi annullare più volte.
6. **Nuova partita**: resetta tutto (chiede conferma).

## Scorciatoie da tastiera

| Tasto | Azione |
|-------|--------|
| Cifre + Invio | Estrai (funziona anche in presentazione) |
| Cmd/Ctrl + Z | Annulla ultimo |
| P | Toggle modalità presentazione |
| Esc | Esce dalla presentazione / chiude modali |

## Persistenza

Tutto lo stato (estratti, fasce, vincitori) è salvato in `localStorage` sotto la chiave `tombolone:state:v1`. Se chiudi il browser e riapri, ritrovi la partita al punto in cui l'hai lasciata.

Reset totale: bottone **Nuova partita** (con conferma).

## Struttura del progetto

```
Tombolone/
├── index.html        controllo banditore
├── display.html      pagina "solo show" per il secondo monitor
├── css/style.css     stile completo
├── js/
│   ├── alpine.min.js micro-framework (46 kb, bundle locale)
│   ├── smorfia.js    dizionario smorfia napoletana (1–90)
│   ├── store.js      Alpine store condiviso + localStorage + sync
│   ├── app.js        componenti Alpine di index.html
│   └── display.js    componente Alpine di display.html
├── start.sh          avvia server HTTP locale + apre il browser
└── README.md
```

## Note tecniche

- **Framework**: [Alpine.js](https://alpinejs.dev) 3.x, bundle locale (~15 kb gzip). Niente build step, niente npm. Le direttive (`x-data`, `x-model`, `x-show`, `@click`…) vivono direttamente nell'HTML.
- **Sync cross-window**: `BroadcastChannel` (API nativa) quando disponibile, con fallback a `storage` event del localStorage. Sincronizza banditore ↔ display ↔ tab multipli.
- **Persistenza**: un singolo `Alpine.effect` dentro lo store riscrive `localStorage` a ogni mutazione reattiva. Niente codice manuale di save/load.
- **Zero build step**: apri `index.html` nel browser o lancia `./start.sh`. Il codice che apri è il codice che esegue.
- **Font**: Fraunces + Newsreader via Google Fonts (caricati una volta, poi in cache — l'app funziona offline dopo il primo caricamento).
- **Browser supportati**: Chrome/Edge 98+, Firefox 98+, Safari 15.4+ (per `<dialog>`, `structuredClone`, `BroadcastChannel`, Alpine.js).
