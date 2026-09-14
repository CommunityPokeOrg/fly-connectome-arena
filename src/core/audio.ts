export type SynthWave = OscillatorType;

export class AudioSynth {
  public muted = false;
  private context: AudioContext | undefined;
  private master: GainNode | undefined;

  private ensureContext(): AudioContext | undefined {
    if (typeof window === 'undefined' || typeof AudioContext === 'undefined') {
      return undefined;
    }
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.24;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') {
      void this.context.resume();
    }
    return this.context;
  }

  public blip(frequency: number, duration = 0.06, type: SynthWave = 'square', volume = 0.12): void {
    if (this.muted) {
      return;
    }
    const context = this.ensureContext();
    if (!context || !this.master) {
      return;
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.72), start + duration);
    gain.gain.setValueAtTime(Math.max(0.001, volume), start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }

  public fire(): void {
    this.blip(530, 0.045, 'square', 0.1);
  }

  public hit(): void {
    this.blip(190, 0.08, 'sawtooth', 0.14);
  }

  public explosion(): void {
    this.blip(78, 0.2, 'sawtooth', 0.18);
  }

  public damage(): void {
    this.blip(120, 0.12, 'square', 0.14);
  }
}
