const AudioService = {
  ctx: null,
  buffers: new Map(),
  currentSource: null,
  htmlAudio: null,
  playbackQueue: Promise.resolve(),

  ensureCtx() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    this.ctx = new Ctx();
    return this.ctx;
  },

  async preload(url) {
    try {
      const ctx = this.ensureCtx();
      if (!ctx) return null;
      if (this.buffers.has(url)) return this.buffers.get(url);
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const arrayBuffer = await resp.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      this.buffers.set(url, audioBuffer);
      return audioBuffer;
    } catch (e) {
      return null;
    }
  },

  play(url) {
    return new Promise(async (resolve) => {
      try {
        const ctx = this.ensureCtx();
        if (ctx && this.buffers.has(url)) {
          const src = ctx.createBufferSource();
          src.buffer = this.buffers.get(url);
          const analyser = ctx.createAnalyser();
          src.connect(analyser);
          analyser.connect(ctx.destination);
          this.currentSource = src;
          this.currentAnalyser = analyser;
          const duration = src.buffer.duration || 0.8;
          let doneResolved = false;
          let doneResolve = null;
          const done = new Promise((res) => { doneResolve = res; });
          // ensure context resumed (user gesture may be required)
          if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
            try { await ctx.resume(); } catch (e) {}
          }
          src.onended = () => {
            if (this.currentSource === src) this.currentSource = null;
            if (!doneResolved) {
              doneResolved = true;
              doneResolve();
            }
          };
          // start immediately and return duration and analyser
          src.start();
          resolve({ duration, analyser, done });
          return;
        }
      } catch (e) {
        // fall through to HTMLAudio fallback
      }

      // HTMLAudio fallback: resolve when metadata available (duration known)
      try {
        if (this.htmlAudio) {
          try { this.htmlAudio.pause(); } catch (e) {}
          this.htmlAudio = null;
        }
        const audio = new Audio(url);
        this.htmlAudio = audio;
        let doneResolved = false;
        let doneResolve = null;
        const done = new Promise((res) => { doneResolve = res; });
        const finishDone = () => {
          if (!doneResolved) {
            doneResolved = true;
            doneResolve();
          }
        };
        audio.addEventListener('ended', finishDone, { once: true });
        audio.addEventListener('error', finishDone, { once: true });
        // if we have an AudioContext, create a media element source + analyser
        const ctx = this.ensureCtx();
        if (ctx) {
          try {
            const sourceNode = ctx.createMediaElementSource(audio);
            const analyser = ctx.createAnalyser();
            sourceNode.connect(analyser);
            analyser.connect(ctx.destination);
            this.currentMediaSource = sourceNode;
            this.currentAnalyser = analyser;
            const onMeta = () => resolve({ duration: isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 1.0, analyser, done });
            audio.addEventListener('loadedmetadata', onMeta);
            audio.play().catch(() => {
              finishDone();
              resolve({ duration: 1.0, analyser, done: Promise.resolve() });
            });
            setTimeout(() => { resolve({ duration: 1.0, analyser, done }); }, 1400);
            return;
          } catch (e) {
            // fall back to plain HTMLAudio
          }
        }

        const onMeta = () => resolve({ duration: isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 1.0, analyser: null, done });
        audio.addEventListener('loadedmetadata', onMeta);
        audio.play().catch(() => {
          finishDone();
          resolve({ duration: 1.0, analyser: null, done: Promise.resolve() });
        });
        setTimeout(() => { resolve({ duration: 1.0, analyser: null, done }); }, 1400);
      } catch (e) {
        resolve({ duration: 1.0, analyser: null, done: Promise.resolve() });
      }
    });
  },

  async playAndWait(url) {
    const waitForPlayback = async () => {
      const res = await this.play(url);
      const duration = Math.max(0, Number(res?.duration || 0));
      const done = res?.done;
      if (done && typeof done.then === 'function') {
        try {
          await Promise.race([
            done,
            new Promise((resolve) => setTimeout(resolve, Math.max(400, duration * 1000 + 200))),
          ]);
          return res;
        } catch (e) {
          return res;
        }
      }
      if (duration > 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.max(300, duration * 1000)));
      }
      return res;
    };

    this.playbackQueue = this.playbackQueue
      .then(() => waitForPlayback())
      .catch(() => waitForPlayback());

    return this.playbackQueue;
  },

  stop() {
    try {
      if (this.currentSource) {
        try { this.currentSource.stop(); } catch (e) {}
        this.currentSource = null;
      }
      if (this.htmlAudio) {
        try { this.htmlAudio.pause(); } catch (e) {}
        this.htmlAudio = null;
      }
    } catch (e) {}
  }
};

export default AudioService;
