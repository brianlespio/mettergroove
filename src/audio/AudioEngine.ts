import { AudioFrameData, StereoMetrics, BandEnergies } from '../types/audio';

export type AudioSourceType = 'demo' | 'mic' | 'file' | 'tab' | 'system' | 'none';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private splitter: ChannelSplitterNode | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private tap: GainNode | null = null;

  // Source nodes
  private currentSourceType: AudioSourceType = 'none';
  private micStream: MediaStream | null = null;
  private micNode: MediaStreamAudioSourceNode | null = null;
  private fileBufferSource: AudioBufferSourceNode | null = null;
  private fileAudioBuffer: AudioBuffer | null = null;
  private fileElement: HTMLAudioElement | null = null;
  private fileElementSource: MediaElementAudioSourceNode | null = null;
  private fileObjectUrl: string | null = null;
  private displayStream: MediaStream | null = null;
  private displayNode: MediaStreamAudioSourceNode | null = null;
  private displayVideo: HTMLVideoElement | null = null;
  private sourceGeneration = 0;
  private inputDeviceId: string | null = null;

  // Built-in stereo demo synth state
  private demoTimer: number | null = null;
  private isDemoRunning = false;
  private step = 0;

  // Pre-allocated buffers to prevent GC thrashing at 60+ FPS
  private readonly fftSize = 2048;
  private timeL = new Float32Array(this.fftSize);
  private timeR = new Float32Array(this.fftSize);
  private freqL = new Uint8Array(this.fftSize / 2);
  private freqR = new Uint8Array(this.fftSize / 2);

  // Peak hold state
  private peakL = 0;
  private peakR = 0;

  constructor() {
    // Lazy initialized on first user interaction
  }

  public async init(): Promise<void> {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

      this.tap = this.ctx.createGain();
      this.tap.gain.setValueAtTime(1, this.ctx.currentTime);

      this.splitter = this.ctx.createChannelSplitter(2);

      this.analyserL = this.ctx.createAnalyser();
      this.analyserL.fftSize = this.fftSize;
      this.analyserL.smoothingTimeConstant = 0.20;

      this.analyserR = this.ctx.createAnalyser();
      this.analyserR.fftSize = this.fftSize;
      this.analyserR.smoothingTimeConstant = 0.20;

      // Connect splitter -> analysers
      this.splitter.connect(this.analyserL, 0);
      this.splitter.connect(this.analyserR, 1);

      // Connect master gain -> speakers
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  public getSourceType(): AudioSourceType {
    return this.currentSourceType;
  }

  public getContextState(): AudioContextState | 'uninitialized' {
    return this.ctx ? this.ctx.state : 'uninitialized';
  }

  public async getAudioContext(): Promise<AudioContext> {
    await this.init();
    if (!this.ctx) throw new Error('AudioContext no disponible');
    return this.ctx;
  }

  /** Side-chain used by MilkDrop. It is not connected to the speakers. */
  public getAudioTap(): AudioNode | null {
    return this.tap;
  }

  private routeSource(node: AudioNode, audible: boolean): void {
    if (this.splitter) node.connect(this.splitter);
    if (this.tap) node.connect(this.tap);
    if (audible && this.masterGain) node.connect(this.masterGain);
  }

  public setVolume(val: number): void {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1.5, val)), this.ctx.currentTime, 0.02);
    }
  }

  public setSmoothing(val: number): void {
    const clamped = Math.max(0, Math.min(0.95, val));
    if (this.analyserL) this.analyserL.smoothingTimeConstant = clamped;
    if (this.analyserR) this.analyserR.smoothingTimeConstant = clamped;
  }

  // --- SOURCE: Built-in Procedural Stereo Synth Demo ---
  public async playDemo(): Promise<void> {
    await this.init();
    this.stopCurrentSource();

    if (!this.ctx || !this.splitter || !this.masterGain) return;

    this.currentSourceType = 'demo';
    this.isDemoRunning = true;
    this.step = 0;

    const tempoBpm = 124;
    const stepIntervalMs = (60 / tempoBpm / 4) * 1000; // 16th notes

    const runLoop = () => {
      if (!this.isDemoRunning || !this.ctx || !this.splitter || !this.masterGain) return;

      const now = this.ctx.currentTime;
      const s = this.step % 32;
      const bar = Math.floor(this.step / 32) % 4; // 4-bar structure

      // Bar 3 is a breakdown (kick drops out, highlighting warm synths and crisp hats)
      const isBreakdown = (bar === 2);

      // 1. Kick Drum: Punchy low-end 808/909 punch (Bajos Rojos Caliente)
      if (!isBreakdown && (s === 0 || s === 8 || s === 16 || s === 24)) {
        this.triggerKick(now);
      }

      // 2. Snare / Clap: Crisp mid-high transient (Medios Agudos Tibios Claros)
      if (s === 4 || s === 12 || s === 20 || s === 28) {
        this.triggerSnare(now);
      }

      // 3. Hi-Hats: Electric high-frequency sizzle (Agudos Claros Fríos)
      // Open hat on off-beats (2, 10, 18, 26) and closed ticks on (6, 14, 22, 30)
      if (s % 2 === 0 && s % 4 !== 0) {
        const isOpen = (s % 8 === 2);
        const pan = (s % 4 === 2) ? 0.5 : -0.5;
        this.triggerHiHat(now, isOpen, pan);
      }

      // 4. Sub Bass: Deep 45-80Hz sub groove between the kicks (Bajos Rojos)
      if (!isBreakdown && (s === 3 || s === 7 || s === 11 || s === 15 || s === 19 || s === 27)) {
        const bassFreq = s === 3 || s === 19 ? 43.65 : s === 7 || s === 27 ? 49.0 : 36.7; // F1, G1, D1
        this.triggerBass(now, bassFreq);
      }

      // 5. Melodic Vocal/Synth Lead: Warm intermediate frequencies (Medios Tibios)
      // Plays primarily in breakdown and selective accents so each sound is cleanly defined
      if (isBreakdown || s === 1 || s === 5 || s === 13 || s === 21) {
        const arpFreqs = [261.63, 329.63, 392.0, 523.25, 659.25]; // C, E, G, C, E
        const arpFreq = arpFreqs[(this.step >> 1) % arpFreqs.length];
        const panAmount = Math.sin(this.step * 0.35) * 0.7;
        this.triggerSynthArp(now, arpFreq, panAmount);
      }

      this.step++;
      this.demoTimer = window.setTimeout(runLoop, stepIntervalMs);
    };

    runLoop();
  }

  private triggerKick(time: number): void {
    if (!this.ctx || !this.splitter || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);

    gain.gain.setValueAtTime(1.0, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

    osc.connect(gain);
    this.routeSource(gain, true);

    osc.start(time);
    osc.stop(time + 0.36);
  }

  private triggerSnare(time: number): void {
    if (!this.ctx || !this.splitter || !this.masterGain) return;

    // Noise component
    const bufferSize = this.ctx.sampleRate * 0.18;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1200, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.55, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    noise.connect(filter);
    filter.connect(gain);
    this.routeSource(gain, true);

    noise.start(time);
    noise.stop(time + 0.19);
  }

  private triggerHiHat(time: number, isOpen: boolean, pan: number): void {
    if (!this.ctx || !this.splitter || !this.masterGain) return;

    const bufferSize = this.ctx.sampleRate * (isOpen ? 0.22 : 0.05);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(8500, time);
    filter.Q.setValueAtTime(2.5, time);

    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(pan, time);

    const gain = this.ctx.createGain();
    const duration = isOpen ? 0.2 : 0.05;
    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    noise.connect(filter);
    filter.connect(panner);
    panner.connect(gain);
    this.routeSource(gain, true);

    noise.start(time);
    noise.stop(time + duration + 0.01);
  }

  private triggerBass(time: number, freq: number): void {
    if (!this.ctx || !this.splitter || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, time);
    filter.frequency.exponentialRampToValueAtTime(110, time + 0.2);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

    osc.connect(filter);
    filter.connect(gain);
    this.routeSource(gain, true);

    osc.start(time);
    osc.stop(time + 0.26);
  }

  private triggerSynthArp(time: number, freq: number, pan: number): void {
    if (!this.ctx || !this.splitter || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(pan, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

    osc.connect(panner);
    panner.connect(gain);
    this.routeSource(gain, true);

    osc.start(time);
    osc.stop(time + 0.31);
  }

  public getInputDeviceId(): string | null {
    return this.inputDeviceId;
  }

  // --- SOURCE: Microphone / Live Line-In / interface loopback ---
  public async startMicrophone(deviceId?: string): Promise<void> {
    await this.init();
    this.stopCurrentSource();

    if (!this.ctx || !this.splitter) return;

    const audio: MediaTrackConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };
    if (deviceId) audio.deviceId = { exact: deviceId };
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio });
    this.inputDeviceId = deviceId ?? this.micStream.getAudioTracks()[0]?.getSettings().deviceId ?? null;

    this.micNode = this.ctx.createMediaStreamSource(this.micStream);
    this.routeSource(this.micNode, false);
    // Note: Do not connect mic to masterGain/speakers to prevent feedback screeching!

    this.currentSourceType = 'mic';
  }

  // --- SOURCE: Audio File (HTMLMediaElement, with decoded-buffer fallback) ---
  public async loadAudioFile(file: File): Promise<void> {
    await this.init();
    this.stopCurrentSource();
    const generation = this.sourceGeneration;
    try {
      await this.attachMediaElementFile(file, generation);
    } catch (mediaError) {
      if (this.sourceGeneration !== generation) return;
      console.warn('Reproducción por elemento de audio no disponible, decodificando el archivo', mediaError);
      await this.attachDecodedFile(file);
    }
  }

  public async startDisplayCapture(target: 'tab' | 'system'): Promise<void> {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Este navegador no permite capturar audio de una pestaña o del sistema.');
    }
    await this.init();
    this.stopCurrentSource();
    const generation = this.sourceGeneration;
    const videoConstraint = target === 'tab' ? { displaySurface: 'browser' } : { displaySurface: 'monitor' };
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: videoConstraint,
      audio: true,
      // Chromium-only hints. Other browsers ignore them.
      ...(target === 'system' ? { systemAudio: 'include' } : {}),
    } as DisplayMediaStreamOptions);
    if (this.sourceGeneration !== generation) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('La captura no incluyó audio. Vuelve a compartir y activa el audio de la pestaña o del sistema.');
    }
    if (!this.ctx) return;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    video.style.cssText = 'position:fixed;width:0;height:0;opacity:0;pointer-events:none';
    document.body.appendChild(video);
    await video.play().catch(() => undefined);
    this.displayVideo = video;
    this.displayStream = stream;
    this.displayNode = this.ctx.createMediaStreamSource(stream);
    this.routeSource(this.displayNode, true);
    this.currentSourceType = target;
    audioTracks[0].addEventListener('ended', () => {
      if (this.displayStream === stream) this.stopCurrentSource();
    });
  }

  private attachMediaElementFile(file: File, generation: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      audio.loop = true;
      audio.preload = 'auto';
      const fail = (error: unknown) => {
        URL.revokeObjectURL(url);
        reject(error instanceof Error ? error : new Error('No se pudo reproducir el archivo'));
      };
      audio.addEventListener('error', () => fail(new Error('El archivo de audio no es reproducible en este navegador')), { once: true });
      audio.addEventListener('canplay', () => {
        if (this.sourceGeneration !== generation || !this.ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('La fuente de audio cambió'));
          return;
        }
        audio.play().then(() => {
          const source = this.ctx!.createMediaElementSource(audio);
          this.fileElement = audio;
          this.fileElementSource = source;
          this.fileObjectUrl = url;
          this.routeSource(source, true);
          this.currentSourceType = 'file';
          resolve();
        }).catch(fail);
      }, { once: true });
      audio.src = url;
    });
  }

  private async attachDecodedFile(file: File): Promise<void> {
    if (!this.ctx || !this.splitter || !this.masterGain) return;
    const arrayBuffer = await file.arrayBuffer();
    this.fileAudioBuffer = await this.ctx.decodeAudioData(arrayBuffer.slice(0));
    this.playFileBuffer();
  }

  private playFileBuffer(): void {
    if (!this.ctx || !this.fileAudioBuffer || !this.splitter || !this.masterGain) return;

    this.fileBufferSource = this.ctx.createBufferSource();
    this.fileBufferSource.buffer = this.fileAudioBuffer;
    this.fileBufferSource.loop = true;

    this.routeSource(this.fileBufferSource, true);

    this.fileBufferSource.start(0);
    this.currentSourceType = 'file';
  }

  public stopCurrentSource(): void {
    this.sourceGeneration += 1;
    if (this.demoTimer !== null) {
      clearTimeout(this.demoTimer);
      this.demoTimer = null;
    }
    this.isDemoRunning = false;

    if (this.micNode) {
      this.micNode.disconnect();
      this.micNode = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }

    if (this.fileBufferSource) {
      try {
        this.fileBufferSource.stop();
      } catch {
        // already stopped
      }
      this.fileBufferSource.disconnect();
      this.fileBufferSource = null;
    }

    if (this.fileElementSource) {
      this.fileElementSource.disconnect();
      this.fileElementSource = null;
    }
    if (this.fileElement) {
      this.fileElement.pause();
      this.fileElement.src = '';
      this.fileElement = null;
    }
    if (this.fileObjectUrl) {
      URL.revokeObjectURL(this.fileObjectUrl);
      this.fileObjectUrl = null;
    }

    if (this.displayNode) {
      this.displayNode.disconnect();
      this.displayNode = null;
    }
    if (this.displayStream) {
      this.displayStream.getTracks().forEach((track) => track.stop());
      this.displayStream = null;
    }
    if (this.displayVideo) {
      this.displayVideo.pause();
      this.displayVideo.srcObject = null;
      this.displayVideo.remove();
      this.displayVideo = null;
    }

    this.currentSourceType = 'none';
  }

  // --- FRAME DATA EXTRACTION FOR RENDERER (60 FPS) ---
  public getFrameData(): AudioFrameData {
    const sampleRate = this.ctx ? this.ctx.sampleRate : 48000;

    if (!this.analyserL || !this.analyserR) {
      return {
        timeDomainL: this.timeL,
        timeDomainR: this.timeR,
        frequencyL: this.freqL,
        frequencyR: this.freqR,
        sampleRate,
        fftSize: this.fftSize,
        metrics: {
          balance: 0,
          correlation: 1,
          midPower: 0,
          sidePower: 0,
          width: 0,
          rmsL: 0,
          rmsR: 0,
          peakL: 0,
          peakR: 0,
        },
        bands: { low: 0, mid: 0, high: 0 },
      };
    }

    this.analyserL.getFloatTimeDomainData(this.timeL);
    this.analyserR.getFloatTimeDomainData(this.timeR);
    this.analyserL.getByteFrequencyData(this.freqL);
    this.analyserR.getByteFrequencyData(this.freqR);

    // Compute RMS, Peak, Correlation, and Mid/Side metrics
    let sumSqL = 0;
    let sumSqR = 0;
    let sumProd = 0;
    let curPeakL = 0;
    let curPeakR = 0;

    let sumMidSq = 0;
    let sumSideSq = 0;

    const N = this.fftSize;
    const invSqrt2 = 0.70710678;

    for (let i = 0; i < N; i++) {
      const l = this.timeL[i];
      const r = this.timeR[i];

      const absL = Math.abs(l);
      const absR = Math.abs(r);
      if (absL > curPeakL) curPeakL = absL;
      if (absR > curPeakR) curPeakR = absR;

      sumSqL += l * l;
      sumSqR += r * r;
      sumProd += l * r;

      const mid = (l + r) * invSqrt2;
      const side = (l - r) * invSqrt2;
      sumMidSq += mid * mid;
      sumSideSq += side * side;
    }

    const rmsL = Math.sqrt(sumSqL / N);
    const rmsR = Math.sqrt(sumSqR / N);

    // Smooth peak decay
    this.peakL = Math.max(curPeakL, this.peakL * 0.94);
    this.peakR = Math.max(curPeakR, this.peakR * 0.94);

    // Balance: -1.0 (Left) to +1.0 (Right)
    const totalRms = rmsL + rmsR;
    const balance = totalRms > 0.001 ? (rmsR - rmsL) / totalRms : 0;

    // Phase Correlation: -1 (180 deg out of phase) to +1 (mono)
    const norm = Math.sqrt(sumSqL * sumSqR);
    const correlation = norm > 0.0001 ? Math.max(-1, Math.min(1, sumProd / norm)) : 1.0;

    // Mid / Side width
    const midPower = sumMidSq / N;
    const sidePower = sumSideSq / N;
    const width = midPower > 0.0001 ? Math.min(2.5, Math.sqrt(sidePower / midPower)) : 0;

    const metrics: StereoMetrics = {
      balance,
      correlation,
      midPower,
      sidePower,
      width,
      rmsL,
      rmsR,
      peakL: this.peakL,
      peakR: this.peakR,
    };

    // Calculate Multi-band Energies from FFT:
    // Low: 20-250Hz (Bajos rojo caliente), Mid: 250-2200Hz (Medios intermedios tibios),
    // MidHigh: 2200-6000Hz (Medios agudos tibios claros), High: 6000-20000Hz (Agudos claros fríos)
    const binHz = sampleRate / this.fftSize;
    const binCount = this.freqL.length;

    let lowSum = 0, lowMax = 0, lowCount = 0;
    let midSum = 0, midMax = 0, midCount = 0;
    let midHighSum = 0, midHighMax = 0, midHighCount = 0;
    let highSum = 0, highMax = 0, highCount = 0;

    for (let i = 1; i < binCount; i++) {
      const hz = i * binHz;
      const mag = (this.freqL[i] + this.freqR[i]) / 2; // avg byte [0-255]

      if (hz < 250) {
        lowSum += mag;
        if (mag > lowMax) lowMax = mag;
        lowCount++;
      } else if (hz < 2200) {
        midSum += mag;
        if (mag > midMax) midMax = mag;
        midCount++;
      } else if (hz < 6000) {
        midHighSum += mag;
        if (mag > midHighMax) midHighMax = mag;
        midHighCount++;
      } else if (hz <= 20000) {
        highSum += mag;
        if (mag > highMax) highMax = mag;
        highCount++;
      }
    }

    // Psychoacoustically equalized bands so that high transients, snares, and bass kick distinctly
    const lowAvg = lowCount > 0 ? lowSum / lowCount : 0;
    const midAvg = midCount > 0 ? midSum / midCount : 0;
    const midHighAvg = midHighCount > 0 ? midHighSum / midHighCount : 0;
    const highAvg = highCount > 0 ? highSum / highCount : 0;

    const bands: BandEnergies = {
      low: Math.min(1.0, (lowAvg * 0.75 + lowMax * 0.25) / 255 * 1.15),
      mid: Math.min(1.0, (midAvg * 0.70 + midMax * 0.30) / 255 * 1.30),
      midHigh: Math.min(1.0, (midHighAvg * 0.60 + midHighMax * 0.40) / 255 * 1.65),
      high: Math.min(1.0, (highAvg * 0.50 + highMax * 0.50) / 255 * 2.25),
    };

    return {
      timeDomainL: this.timeL,
      timeDomainR: this.timeR,
      frequencyL: this.freqL,
      frequencyR: this.freqR,
      sampleRate,
      fftSize: this.fftSize,
      metrics,
      bands,
    };
  }
}
