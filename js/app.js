// Componenti Alpine per index.html (banditore).
// Lo stato vive in $store.tombola (vedi store.js). Qui solo UI locale.

document.addEventListener('alpine:init', () => {
  const Alpine = window.Alpine;

  // ---------- Toasts ----------
  Alpine.data('toasts', () => ({
    items: [],

    init() {
      window.addEventListener('toast', (e) => {
        this.push(e.detail?.msg ?? String(e.detail ?? ''));
      });
    },

    push(msg) {
      const id = Date.now() + Math.random();
      this.items.push({ id, msg });
      setTimeout(() => {
        this.items = this.items.filter(t => t.id !== id);
      }, 2600);
    },
  }));

  // ---------- Setup form ----------
  Alpine.data('setupForm', () => ({
    nomePartita: '',
    fasce: [],
    smorfia: false,

    init() {
      this.seed();
      this.$watch('$store.tombola.setup.completed', (completed) => {
        if (!completed) this.seed();
      });
    },

    seed() {
      const store = this.$store.tombola;
      this.nomePartita = '';
      this.fasce = store.FASCE_DEFAULT.map(f => ({ ...f }));
      this.smorfia = false;
    },

    aggiungi() {
      this.fasce.push({
        id: `custom-${Date.now()}`,
        nome: 'Nuova fascia',
        numeri: 5,
        attiva: true,
        vinta: false,
      });
    },

    rimuovi(i) { this.fasce.splice(i, 1); },

    conferma() {
      if (!this.fasce.some(f => f.attiva)) {
        this.$dispatch('toast', { msg: 'Attiva almeno una fascia per iniziare.' });
        return;
      }
      this.$store.tombola.completeSetup({
        nomePartita: this.nomePartita,
        fasce: this.fasce,
        smorfia: this.smorfia,
      });
    },
  }));

  // ---------- Game view ----------
  Alpine.data('gameView', () => ({
    inputNumero: '',
    presentazione: false,
    animateReveal: false,
    typingBuffer: '',

    init() {
      let prev = this.$store.tombola.estratti.length;
      this.$watch('$store.tombola.estratti.length', (n) => {
        if (n > prev) this.triggerReveal();
        prev = n;
      });
      this.$watch('$store.tombola.setup.completed', (completed) => {
        if (completed) this.$nextTick(() => this.$refs.inputNumero?.focus());
      });
      window.addEventListener('keydown', (e) => this.onKey(e));
    },

    triggerReveal() {
      this.animateReveal = false;
      this.$nextTick(() => { this.animateReveal = true; });
    },

    estrai() {
      const n = Number(this.inputNumero);
      if (!n) return;
      try {
        this.$store.tombola.estrai(n);
        this.inputNumero = '';
      } catch (e) {
        this.$dispatch('toast', { msg: e.message });
      }
    },

    estraiNum(n) {
      try {
        this.$store.tombola.estrai(n);
      } catch (e) {
        this.$dispatch('toast', { msg: e.message });
      }
    },

    nuovaPartita() {
      if (confirm('Iniziare una nuova partita?\n\nGli estratti, i vincitori e le fasce custom verranno cancellati.')) {
        this.$store.tombola.reset();
      }
    },

    togglePresentazione() {
      this.presentazione = !this.presentazione;
      document.body.classList.toggle('presentazione', this.presentazione);
      if (this.presentazione) {
        document.activeElement?.blur?.();
      } else {
        this.$refs.inputNumero?.focus();
        this.typingBuffer = '';
      }
    },

    apriDisplay() {
      const url = new URL('display.html', location.href).href;
      // 16:9 per monitor/proiettori — l'utente farà F11 per fullscreen in ogni caso
      const win = window.open(url, 'tombolone-display', 'width=1600,height=900');
      if (!win || win.closed) {
        this.$dispatch('toast', { msg: 'Popup bloccato. Abilita i popup oppure apri display.html in una nuova scheda.' });
      }
    },

    onKey(e) {
      if (e.key === 'Escape' && this.presentazione && !this.typingBuffer) {
        this.togglePresentazione();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const a = document.activeElement;
        if (a?.tagName === 'INPUT' || a?.tagName === 'TEXTAREA') return;
        e.preventDefault();
        this.$store.tombola.undo();
        return;
      }
      if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const a = document.activeElement;
        if (a?.tagName === 'INPUT' || a?.tagName === 'TEXTAREA') return;
        this.togglePresentazione();
        e.preventDefault();
        return;
      }
      this.handlePresentazioneTyping(e);
    },

    handlePresentazioneTyping(e) {
      if (!this.presentazione) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) {
        this.typingBuffer = (this.typingBuffer + e.key).slice(-2);
        e.preventDefault();
      } else if (e.key === 'Enter' && this.typingBuffer) {
        const n = Number(this.typingBuffer);
        this.typingBuffer = '';
        if (n >= 1 && n <= 90) this.estraiNum(n);
        e.preventDefault();
      } else if (e.key === 'Backspace' && this.typingBuffer) {
        this.typingBuffer = this.typingBuffer.slice(0, -1);
        e.preventDefault();
      } else if (e.key === 'Escape' && this.typingBuffer) {
        this.typingBuffer = '';
        e.preventDefault();
      }
    },
  }));

  // ---------- Modal: dichiara vincitore ----------
  Alpine.data('modalVincitore', () => ({
    fascia: null,
    nome: '',
    numeri: [],
    errore: '',

    init() {
      window.addEventListener('apri-vincitore', (e) => this.apri(e.detail?.fasciaId));
    },

    apri(fasciaId) {
      const f = this.$store.tombola.fasce.find(x => x.id === fasciaId);
      if (!f) return;
      this.fascia = f;
      this.nome = '';
      this.numeri = Array(f.numeri).fill('');
      this.errore = '';
      this.$root.showModal();
      this.$nextTick(() => this.$refs.nomeInput?.focus());
    },

    chiudi() {
      this.$root.close();
      this.fascia = null;
      this.errore = '';
    },

    avanzaCampo(i) {
      if (String(this.numeri[i] ?? '').length >= 2) {
        this.$nextTick(() => {
          const inputs = this.$root.querySelectorAll('.num-input');
          inputs[i + 1]?.focus();
        });
      }
    },

    submit() {
      const nome = this.nome.trim();
      if (!nome) { this.errore = 'Inserisci il nome del vincitore.'; return; }
      const compilati = this.numeri.map(x => String(x ?? '').trim()).filter(Boolean);
      const numeri = compilati.map(Number);

      if (compilati.length && compilati.length !== this.fascia.numeri) {
        this.errore = `Compila tutti i ${this.fascia.numeri} numeri oppure lasciali tutti vuoti.`;
        return;
      }
      for (const n of numeri) {
        if (!Number.isInteger(n) || n < 1 || n > 90) {
          this.errore = `Numero non valido: ${n}. Usa numeri tra 1 e 90.`;
          return;
        }
      }
      if (new Set(numeri).size !== numeri.length) {
        this.errore = 'Hai inserito numeri duplicati.';
        return;
      }
      if (numeri.length) {
        const check = this.$store.tombola.verificaCartella(numeri);
        if (!check.ok) {
          this.errore = `Questi numeri non sono ancora usciti: ${check.mancanti.join(', ')}.`;
          return;
        }
      }
      this.$store.tombola.dichiaraVincitore({
        fasciaId: this.fascia.id,
        nome,
        numeri,
      });
      this.chiudi();
    },
  }));

  // ---------- Modal: impostazioni ----------
  Alpine.data('modalImpostazioni', () => ({
    smorfia: false,
    durataCerimonia: 4500,

    init() {
      window.addEventListener('apri-impostazioni', () => this.apri());
    },

    apri() {
      this.smorfia = !!this.$store.tombola.setup.smorfia;
      this.durataCerimonia = this.$store.tombola.setup.durataCerimonia ?? 4500;
      this.$root.showModal();
    },

    chiudi() {
      this.$root.close();
    },

    salva() {
      this.$store.tombola.aggiornaImpostazioni({
        smorfia: this.smorfia,
        durataCerimonia: this.durataCerimonia,
      });
      this.chiudi();
    },
  }));

  // ---------- Modal: verifica cartella ----------
  Alpine.data('modalVerifica', () => ({
    raw: '',
    risultato: null,

    init() {
      window.addEventListener('apri-verifica', () => this.apri());
    },

    apri() {
      this.raw = '';
      this.risultato = null;
      this.$root.showModal();
      this.$nextTick(() => this.$refs.textarea?.focus());
    },

    chiudi() {
      this.$root.close();
      this.raw = '';
      this.risultato = null;
    },

    submit() {
      const parsed = this.raw.split(/[\s,;\n]+/).filter(Boolean).map(Number);
      const numeri = parsed.filter(n => Number.isInteger(n) && n >= 1 && n <= 90);
      const scartati = parsed.length - numeri.length;

      if (numeri.length === 0) {
        this.risultato = { ok: false, msg: 'Nessun numero valido inserito.' };
        return;
      }
      const check = this.$store.tombola.verificaCartella(numeri);
      if (check.ok) {
        const extra = scartati ? ` (${scartati} valori non validi ignorati)` : '';
        this.risultato = { ok: true, msg: `Cartella valida. Tutti i ${check.unici.length} numeri sono usciti${extra}.` };
      } else {
        this.risultato = { ok: false, msg: `Non ancora valida. Mancano: ${check.mancanti.join(', ')}.` };
      }
    },
  }));
});
