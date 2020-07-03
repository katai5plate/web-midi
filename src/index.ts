import { parseMidi, MIDIFile, MIDITrackEvent } from "midi-file";

type VADSR = [number, number, number, number, number];

const ctx = new AudioContext();

/**
 * 音色と音程
 */
class Osc extends OscillatorNode {
  noteNumber: number;
  pitch: number;
  constructor(
    context: AudioContext,
    params: {
      noteNumber: number;
      type: OscillatorType;
      pitch: number;
    }
  ) {
    super(context);
    this.noteNumber = params.noteNumber;
    this.type = params.type;
    this.pitch = params.pitch;
    this.setFrequency();
  }
  setFrequency() {
    this.frequency.value =
      440 * 2 ** ((this.noteNumber + this.pitch - 69) / 12);
  }
  setPitch(pitch: number) {
    this.pitch = pitch;
    this.setFrequency();
  }
}

/**
 * エンベロープ
 */
class Envelope extends GainNode {
  volume: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  boost: number;
  attackTime: number;
  decayTime: number;
  stopTime: number;
  constructor(
    context: AudioContext,
    params: { vadsr: number[]; boost: number }
  ) {
    super(context);
    [
      this.volume,
      this.attack,
      this.decay,
      this.sustain,
      this.release,
    ] = params.vadsr;
    this.boost = params.boost;
    this.gain.value = 0;
    this.stopTime = NaN;
    this.down();
  }
  getPhase() {
    if (this.context.currentTime < this.attackTime) return 0;
    if (this.context.currentTime < this.decayTime) return 1;
    if (Number.isNaN(this.stopTime)) return 2;
    if (this.context.currentTime < this.stopTime) return 3;
    return -1;
  }
  down() {
    this.attackTime = this.context.currentTime + this.attack;
    this.decayTime = this.attackTime + this.decay;
    this.gain.setValueAtTime(0, this.context.currentTime);
    this.gain.linearRampToValueAtTime(
      this.boost * this.volume,
      this.attackTime
    );
    this.gain.linearRampToValueAtTime(
      this.boost * this.volume * this.sustain,
      this.decayTime
    );
  }
  up() {
    this.stopTime = this.context.currentTime + this.release;
    this.gain.setValueAtTime(this.gain.value, this.context.currentTime);
    this.gain.linearRampToValueAtTime(0, this.stopTime);
  }
}

class Pan extends StereoPannerNode {
  constructor(context: AudioContext, panpot: number) {
    super(context);
    this.pan.value = panpot;
  }
  setPanpot(panpot: number) {
    this.pan.value = panpot;
  }
}

// Note の種類が増えたら適宜追加
type Note = SimpleNote;

/**
 * 通常の音符
 */
class SimpleNote {
  context: AudioContext;
  noteNumber: number;
  pitch: number;
  vadsr: VADSR;
  panpot: number;
  boostVolume: number;
  oscType: OscillatorType;
  osc: Osc;
  env: Envelope;
  pan: Pan;
  out: GainNode;
  constructor(
    context: AudioContext,
    params: {
      noteNumber: number;
      pitch: number;
      vadsr: VADSR;
      panpot: number;
      boostVolume: number;
      oscType: OscillatorType;
    }
  ) {
    this.context = context;
    this.noteNumber = params.noteNumber;
    this.pitch = params.pitch;
    this.vadsr = params.vadsr;
    this.panpot = params.panpot;
    this.boostVolume = params.boostVolume;
    this.oscType = params.oscType;
    this.out = new GainNode(this.context);
    this.connection();
    this.down();
  }
  connection() {
    this.osc = new Osc(this.context, {
      noteNumber: this.noteNumber,
      type: this.oscType,
      pitch: this.pitch,
    });
    this.env = new Envelope(this.context, {
      vadsr: this.vadsr,
      boost: this.boostVolume,
    });
    this.pan = new Pan(this.context, this.panpot);

    this.osc.connect(this.env).connect(this.pan).connect(this.out);
  }
  down() {
    this.env.down();
    this.osc.start();
  }
  up() {
    this.env.up();
    this.osc.stop(this.env.stopTime);
  }
}

type NoteMode = "normal" | "fm" | "psg" | "pcm";

/**
 * チャンネルの音符の状態管理
 */
class Channel {
  context: AudioContext;
  vadsr: VADSR;
  panpot: number;
  boostVolume: number;
  oscType: OscillatorType;
  noteMode: NoteMode;
  noteArgs: any[];
  polyState: { [key: number]: Note };
  polyphony: number;
  globalSend: GainNode;
  constructor(
    context: AudioContext,
    params: {
      vadsr: VADSR;
      panpot?: number;
      polyphony?: number;
      boostVolume?: number;
      oscType?: OscillatorType;
      noteMode?: NoteMode;
      noteArgs?: any[];
    }
  ) {
    this.context = context;
    this.vadsr = params.vadsr;
    this.panpot = params.panpot || 0;
    this.polyphony = params.polyphony || 16;
    this.boostVolume = params.boostVolume || 1;
    this.oscType = params.oscType || "sine";
    this.noteMode = params.noteMode || "normal";
    this.noteArgs = params.noteArgs || [];
    this.polyState = {};
    this.globalSend = new GainNode(this.context);
    this.globalSend.connect(this.context.destination);
  }
  startNote(noteNumber: number, pitch: number) {
    if (Object.keys(this.polyState).length >= this.polyphony) return;
    switch (this.noteMode) {
      case "normal":
        this.polyState[noteNumber] = new SimpleNote(this.context, {
          noteNumber,
          pitch,
          vadsr: this.vadsr,
          panpot: this.panpot,
          boostVolume: this.boostVolume,
          oscType: this.oscType,
        });
        break;
      case "fm":
      case "psg":
      case "pcm":
        throw "Unimplemented NoteMode";
      default:
        throw "Invalid NoteMode";
    }
    this.polyState[noteNumber].out.connect(this.globalSend);
    this.polyState[noteNumber].osc.onended = this.cleanNote.bind(
      this,
      noteNumber
    );
  }
  getAllNote() {
    return Object.values(this.polyState);
  }
  setPitch(pitch: number) {
    return this.getAllNote().forEach((x) => x.osc.setPitch(pitch / 8192));
  }
  stopNote(noteNumber: number) {
    if (this.polyState[noteNumber]) this.polyState[noteNumber].up();
  }
  cleanNote(noteNumber: number) {
    console.log(
      this.polyState[noteNumber].env.getPhase() === -1 ? "clear:" : "keep:",
      noteNumber,
      Object.keys(this.polyState).length
    );
    if (this.polyState[noteNumber].env.getPhase() === -1)
      delete this.polyState[noteNumber];
  }
}

class Player {
  context: AudioContext;
  channels: Channel[];
  track: MIDITrackEvent[];
  interpreters: (() => Promise<MIDITrackEvent>)[];
  constructor(
    context: AudioContext,
    params: { track: MIDITrackEvent[]; channels: Channel[] }
  ) {
    this.context = context;
    this.track = params.track;
    this.channels = params.channels;
    this.generateInterpreters();
    this.readInterpreters();
  }
  generateInterpreters() {
    this.interpreters = this.track.map((event) => () =>
      new Promise<MIDITrackEvent>((r) =>
        setTimeout(() => r(event), event.deltaTime)
      )
    );
  }
  async readInterpreters() {
    Promise.all(
      this.channels.map(async (ch, ci) => {
        for await (let elm of this.interpreters.slice(1)) {
          const event = await elm();
          console.log(event);
          if (event.channel === ci) {
            if (event.type === "noteOn") ch.startNote(event.noteNumber, 0);
            if (event.type === "noteOff") ch.stopNote(event.noteNumber);
            if (event.type === "pitchBend") ch.setPitch(event.value);
          }
        }
      })
    );
  }
}

(async () => {
  const filebuf = new Uint8Array(
    await (await fetch("./midi/multi.mid")).arrayBuffer()
  );

  const midi = parseMidi(filebuf);
  console.log(midi);

  (window as any).play = () => {
    new Player(ctx, {
      track: midi.tracks[0] as any,
      channels: [
        new Channel(ctx, {
          vadsr: [0.5, 0.1, 0, 1, 0],
          polyphony: 2,
          oscType: "sine",
        }),
        new Channel(ctx, {
          vadsr: [0.5, 0, 0, 0.5, 0],
          polyphony: 2,
          oscType: "sawtooth",
          panpot: 0.5,
        }),
        new Channel(ctx, {
          vadsr: [0.5, 0, 0.1, 0.5, 0.5],
          polyphony: 3,
          oscType: "square",
          panpot: -0.5,
        }),
      ],
    });
  };
})();
