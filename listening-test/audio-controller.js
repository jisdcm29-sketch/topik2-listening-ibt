(function () {
  "use strict";

  class TopikAudioController {
    constructor() {
      this.audio = new Audio();
      this.currentUrl = "";
      this.audio.preload = "metadata";
      this.audio.volume = 1;
    }

    load(url) {
      if (!url) return;
      if (this.currentUrl !== url) {
        this.currentUrl = url;
        this.audio.src = url;
        try {
          this.audio.currentTime = 0;
        } catch (error) {
          // metadata 로드 전 currentTime 설정 실패 가능
        }
        this.audio.load();
      }
    }

    play(url) {
      if (url) this.load(url);
      if (!this.currentUrl) {
        return Promise.reject(new Error("재생할 audio_url이 없습니다."));
      }
      return this.audio.play();
    }

    pause() {
      this.audio.pause();
    }

    stop() {
      this.audio.pause();
      try {
        this.audio.currentTime = 0;
      } catch (error) {
        // 일부 브라우저에서 metadata 로드 전 currentTime 설정이 실패할 수 있다.
      }
    }

    setVolume(value) {
      const next = Number(value);
      if (Number.isFinite(next)) {
        this.audio.volume = Math.max(0, Math.min(1, next));
      }
    }

    seekByRatio(ratio) {
      const duration = this.audio.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      const next = Math.max(0, Math.min(1, Number(ratio))) * duration;
      this.audio.currentTime = next;
    }

    getAudio() {
      return this.audio;
    }

    getCurrentUrl() {
      return this.currentUrl;
    }
  }

  window.TopikAudioController = TopikAudioController;
})();
