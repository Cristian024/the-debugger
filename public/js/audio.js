const DEFAULT_SOURCES = {
  logBeep: '/assets/audio/log-beep.wav',
  menuMusic: '/assets/audio/menu.mp3',
};

const DEFAULT_VOLUMES = {
  logBeep: 0.32,
  menuMusic: 0.22,
};

export class AudioManager {
  constructor(sources = DEFAULT_SOURCES, volumes = DEFAULT_VOLUMES) {
    this.sources = { ...sources };
    this.volumes = { ...volumes };
    this.beep = null;
    this.music = null;
    this.musicRequested = false;
    this.muted = false;

    this.handleFirstGesture = () => this.unlock();

    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', this.handleFirstGesture, { once: true });
      document.addEventListener('keydown', this.handleFirstGesture, { once: true });
    }
  }

  configure({ sources = {}, volumes = {} } = {}) {
    this.stopMenuMusic();
    this.beep?.pause();
    this.beep = null;
    this.sources = { ...this.sources, ...sources };
    this.volumes = { ...this.volumes, ...volumes };
  }

  playLogBeep() {
    if (this.muted || !this.sources.logBeep) {
      return;
    }

    try {
      if (!this.beep) {
        this.beep = new Audio(this.sources.logBeep);
        this.beep.preload = 'auto';
        this.beep.volume = this.volumes.logBeep;
      }

      this.beep.currentTime = 0;
      this.beep.play()?.catch(() => {});
    } catch {
      this.beep = null;
    }
  }

  prime() {
    if (!this.sources.menuMusic) {
      return;
    }

    try {
      if (!this.music) {
        this.music = new Audio(this.sources.menuMusic);
        this.music.loop = true;
        this.music.preload = 'auto';
        this.music.volume = this.volumes.menuMusic;
      }

      const music = this.music;
      const wasMuted = music.muted;
      music.muted = true;
      const promise = music.play();

      if (promise) {
        promise
          .then(() => {
            music.pause();
            music.currentTime = 0;
            music.muted = wasMuted;
          })
          .catch(() => {
            music.muted = wasMuted;
          });
      } else {
        music.muted = wasMuted;
      }
    } catch {}
  }

  playMenuMusic() {
    this.musicRequested = true;

    if (this.muted || !this.sources.menuMusic) {
      return;
    }

    try {
      if (!this.music) {
        this.music = new Audio(this.sources.menuMusic);
        this.music.loop = true;
        this.music.preload = 'auto';
        this.music.volume = this.volumes.menuMusic;
      }

      if (this.music.paused) {
        this.music.play()?.catch(() => {});
      }
    } catch {
      this.music = null;
    }
  }

  stopMenuMusic() {
    this.musicRequested = false;

    if (!this.music) {
      return;
    }

    this.music.pause();
    this.music.currentTime = 0;
  }

  unlock() {
    if (this.musicRequested && this.music?.paused) {
      this.playMenuMusic();
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);

    if (this.muted) {
      this.music?.pause();
      this.beep?.pause();
      return;
    }

    if (this.musicRequested && this.music?.paused) {
      this.playMenuMusic();
    }
  }

  destroy() {
    this.stopMenuMusic();
    this.beep?.pause();
    this.music = null;
    this.beep = null;

    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', this.handleFirstGesture);
      document.removeEventListener('keydown', this.handleFirstGesture);
    }
  }
}

export const audio = new AudioManager();
