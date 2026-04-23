// Componente Alpine per display.html (schermo pubblico).
// Read-only: segue lo $store.tombola aggiornato via BroadcastChannel.

document.addEventListener('alpine:init', () => {
  const Alpine = window.Alpine;

  Alpine.data('displayView', () => ({
    animateReveal: false,
    ceremonyActive: false,
    ceremonyNum: null,
    _ceremonyTimer: null,

    init() {
      let prev = this.$store.tombola.estratti.length;
      this.$watch('$store.tombola.estratti.length', (n) => {
        if (n > prev) this.onNuovaEstrazione();
        prev = n;
      });
    },

    onNuovaEstrazione() {
      const duration = this.$store.tombola.setup.durataCerimonia ?? 4500;
      // CSS variable per keyframes (cascata dal body)
      document.body.style.setProperty('--ceremony-duration', duration + 'ms');

      this.ceremonyNum = this.$store.tombola.ultimo;
      this.ceremonyActive = false;

      this.$nextTick(() => {
        this.ceremonyActive = true;

        // Belt-and-suspenders: setto direttamente animation-duration
        // sui nodi .ceremony e .ceremony-num. Previene ogni quirk di
        // cascade/specificità e garantisce che la durata sia rispettata.
        requestAnimationFrame(() => {
          document.querySelectorAll('.ceremony, .ceremony-num').forEach(el => {
            el.style.animationDuration = duration + 'ms';
          });
        });

        clearTimeout(this._ceremonyTimer);
        this._ceremonyTimer = setTimeout(() => {
          this.ceremonyActive = false;
        }, duration);
      });

      this.animateReveal = false;
      this.$nextTick(() => { this.animateReveal = true; });
    },
  }));
});
