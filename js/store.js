// Alpine store centrale: stato + persistenza + sync cross-window.
// Condiviso tra index.html (banditore) e display.html (schermo pubblico).
// Plain script (no ES modules) per funzionare anche via `file://`.

const STATE_KEY = 'tombolone:state:v1';
const CHANNEL_NAME = 'tombolone';

const FASCE_DEFAULT = [
  { id: 'ambo',     nome: 'Ambo',     numeri: 2,  attiva: true,  vinta: false },
  { id: 'terno',    nome: 'Terno',    numeri: 3,  attiva: false, vinta: false },
  { id: 'quaterna', nome: 'Quaterna', numeri: 4,  attiva: true,  vinta: false },
  { id: 'cinquina', nome: 'Cinquina', numeri: 5,  attiva: true,  vinta: false },
  { id: 'tombola',  nome: 'Tombola',  numeri: 15, attiva: true,  vinta: false },
];

// Struttura statica del tabellone: 3 blocchi × 3 righe × 11 celle
// (5 numeri + null separatore + 5 numeri per riga).
const TABELLONE_STRUTTURA = (() => {
  const blocchi = [];
  for (let b = 0; b < 3; b++) {
    const righe = [];
    for (let r = 0; r < 3; r++) {
      const rigaIdx = b * 3 + r;
      const start = rigaIdx * 10 + 1;
      const riga = [];
      for (let c = 0; c < 10; c++) {
        if (c === 5) riga.push(null);
        riga.push(start + c);
      }
      righe.push(riga);
    }
    blocchi.push(righe);
  }
  return blocchi;
})();

function initialState() {
  return {
    version: 1,
    createdAt: null,
    nomePartita: '',
    setup: { completed: false, smorfia: false, durataCerimonia: 4500 },
    fasce: structuredClone(FASCE_DEFAULT),
    estratti: [],
    vincitori: [],
  };
}

function loadInitial() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return initialState();
    return { ...initialState(), ...parsed };
  } catch {
    return initialState();
  }
}

document.addEventListener('alpine:init', () => {
  const Alpine = window.Alpine;
  const channel = ('BroadcastChannel' in window) ? new BroadcastChannel(CHANNEL_NAME) : null;
  let suppressSync = false;

  Alpine.store('tombola', {
    ...loadInitial(),

    FASCE_DEFAULT,
    tabelloneBlocchi: TABELLONE_STRUTTURA,
    smorfia: window.SMORFIA,

    // ---------- Computed ----------
    get ultimo()           { return this.estratti.at(-1); },
    get ultimiVisibili()   { return this.estratti.slice(-12).reverse(); },
    get fasceAttive()      { return this.fasce.filter(f => f.attiva); },
    get totaleEstratti()   { return this.estratti.length; },
    get vincitoriRecenti() { return this.vincitori.slice().reverse(); },

    decinaLabel(n) {
      if (!n) return '';
      const d = Math.ceil(n / 10);
      return `Decina ${(d - 1) * 10 + 1}–${d * 10}`;
    },

    // ---------- Init: persist + sync ----------
    init() {
      // Effect reattivo: riscrive localStorage e broadcasta ad ogni mutazione
      Alpine.effect(() => {
        const snapshot = {
          version: this.version,
          createdAt: this.createdAt,
          nomePartita: this.nomePartita,
          setup: {
            completed: this.setup.completed,
            smorfia: this.setup.smorfia,
            durataCerimonia: this.setup.durataCerimonia,
          },
          fasce: this.fasce.map(f => ({ ...f })),
          estratti: [...this.estratti],
          vincitori: this.vincitori.map(v => ({ ...v, numeri: [...(v.numeri ?? [])] })),
        };
        try { localStorage.setItem(STATE_KEY, JSON.stringify(snapshot)); } catch {}
        if (channel && !suppressSync) {
          channel.postMessage({ type: 'sync', state: snapshot, at: Date.now() });
        }
      });

      if (channel) {
        channel.addEventListener('message', (e) => {
          if (e.data?.type === 'sync' && e.data.state) this.applyRemote(e.data.state);
        });
      }

      // Fallback cross-tab quando BroadcastChannel non attraversa (es. file://)
      window.addEventListener('storage', (e) => {
        if (e.key === STATE_KEY && e.newValue) {
          try { this.applyRemote(JSON.parse(e.newValue)); } catch {}
        }
      });
    },

    applyRemote(next) {
      suppressSync = true;
      this.version = next.version;
      this.createdAt = next.createdAt;
      this.nomePartita = next.nomePartita;
      this.setup.completed = next.setup.completed;
      this.setup.smorfia = next.setup.smorfia;
      this.setup.durataCerimonia = next.setup.durataCerimonia ?? 4500;
      this.fasce = next.fasce.map(f => ({ ...f }));
      this.estratti = [...next.estratti];
      this.vincitori = next.vincitori.map(v => ({ ...v, numeri: [...(v.numeri ?? [])] }));
      queueMicrotask(() => { suppressSync = false; });
    },

    // ---------- Azioni ----------
    estrai(n) {
      n = Number(n);
      if (!Number.isInteger(n) || n < 1 || n > 90) {
        throw new Error('Il numero deve essere tra 1 e 90.');
      }
      if (this.estratti.includes(n)) {
        throw new Error(`Il ${n} è già uscito.`);
      }
      this.estratti.push(n);
    },

    undo() {
      if (this.estratti.length === 0) return;
      this.estratti.pop();
    },

    reset() {
      const fresh = initialState();
      this.version = fresh.version;
      this.createdAt = fresh.createdAt;
      this.nomePartita = fresh.nomePartita;
      this.setup.completed = fresh.setup.completed;
      this.setup.smorfia = fresh.setup.smorfia;
      this.setup.durataCerimonia = fresh.setup.durataCerimonia;
      this.fasce = fresh.fasce;
      this.estratti = fresh.estratti;
      this.vincitori = fresh.vincitori;
    },

    completeSetup({ nomePartita, fasce, smorfia, durataCerimonia }) {
      this.nomePartita = (nomePartita ?? '').trim();
      this.fasce = fasce.map(f => ({ ...f, vinta: false }));
      this.setup.smorfia = !!smorfia;
      if (durataCerimonia != null) {
        this.setup.durataCerimonia = Math.max(1000, Math.min(30000, Number(durataCerimonia) || 4500));
      }
      this.setup.completed = true;
      this.createdAt = new Date().toISOString();
    },

    aggiornaImpostazioni({ smorfia, durataCerimonia }) {
      if (smorfia != null) this.setup.smorfia = !!smorfia;
      if (durataCerimonia != null) {
        this.setup.durataCerimonia = Math.max(1000, Math.min(30000, Number(durataCerimonia) || 4500));
      }
    },

    dichiaraVincitore({ fasciaId, nome, numeri }) {
      const fascia = this.fasce.find(f => f.id === fasciaId);
      if (fascia) fascia.vinta = true;
      this.vincitori.push({
        fasciaId,
        nome: (nome ?? '').trim(),
        numeri: Array.isArray(numeri) ? [...numeri] : [],
        at: new Date().toISOString(),
      });
    },

    verificaCartella(numeri) {
      const set = new Set(this.estratti);
      const unici = [...new Set(numeri.filter(n => Number.isInteger(n) && n >= 1 && n <= 90))];
      const mancanti = unici.filter(n => !set.has(n));
      return { ok: mancanti.length === 0 && unici.length > 0, mancanti, unici };
    },
  });
});
