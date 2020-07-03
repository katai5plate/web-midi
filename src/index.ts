import { parseMidi } from "midi-file";

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
}

/**
 * 音符
 */
class Note {
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

    this.osc.connect(this.env);
    this.env.connect(this.pan);
    this.pan.connect(this.context.destination);
    this.down();
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

/**
 * チャンネルの音符の状態管理
 */
class Channel {
  context: AudioContext;
  vadsr: VADSR;
  panpot: number;
  boostVolume: number;
  oscType: OscillatorType;
  polyState: { [key: number]: Note };
  polyphony: number;
  constructor(
    context: AudioContext,
    params: {
      vadsr: VADSR;
      panpot?: number;
      polyphony?: number;
      boostVolume?: number;
      oscType?: OscillatorType;
    }
  ) {
    this.context = context;
    this.vadsr = params.vadsr;
    this.panpot = params.panpot || 0;
    this.polyphony = params.polyphony || 16;
    this.boostVolume = params.boostVolume || 1;
    this.oscType = params.oscType || "sine";
    this.polyState = {};
  }
  startNote(noteNumber: number, pitch: number) {
    if (Object.keys(this.polyState).length >= this.polyphony) return;
    this.polyState[noteNumber] = new Note(this.context, {
      noteNumber,
      pitch,
      vadsr: this.vadsr,
      panpot: this.panpot,
      boostVolume: this.boostVolume,
      oscType: this.oscType,
    });
    this.polyState[noteNumber].osc.onended = this.cleanNote.bind(
      this,
      noteNumber
    );
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

let noteNumber = 69;

// let n: Note;
// setInterval(() => {
//   document.querySelector("#memo").innerHTML = "|".repeat(
//     n ? n.amp.gain.value * 50 : 0
//   );
// }, 10);

(window as any).ch = new Channel(ctx, {
  vadsr: [0.5, 0, 0.1, 0.5, 0.5],
  oscType: "triangle",
});
// (window as any).ch = new Channel(ctx, [0.5, 0, 0.1, 0.5, 0], 0, 3, 1, "sawtooth");

(window as any).down = () => {
  (window as any).ch.startNote(noteNumber, 0);
};
(window as any).up = () => {
  (window as any).ch.stopNote(noteNumber);
};
(window as any).sub = () => {
  noteNumber--;
};

(async () => {
  const filebuf = new Uint8Array(
    await (await fetch("./midi/reap2.mid")).arrayBuffer()
  );

  const midi = parseMidi(filebuf);
  midi.tracks = midi.tracks.map((track) =>
    track
      .reduce((p, c) => {
        if ("channel" in c) {
          p[c.channel + 1] = [...p[c.channel + 1], c];
        } else {
          p[0] = [...p[0], c];
        }
        return p;
      }, new Array(17).fill([]))
      .filter((x) => x.length)
  );
  console.log(midi);

  (window as any).play = () => {
    (async () => {
      for await (let t of (midi as any).tracks[0][1].map((x) => () =>
        new Promise((r) => setTimeout(() => r(x), x.deltaTime * 0.75))
      )) {
        const res = await t();
        console.log(res);
        if (res.type === "noteOn")
          (window as any).ch.startNote(res.noteNumber, 0);
        if (res.type === "noteOff") (window as any).ch.stopNote(res.noteNumber);
      }
    })();
  };
})();
