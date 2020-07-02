// MIDI 解析メモ
import { parseMidi } from "midi-file";
(async () => {
  const midi = parseMidi(
    new Uint8Array(await (await fetch("./midi/test.mid")).arrayBuffer())
  );
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
})();

// ここからシンセ

type VADSR = [number, number, number, number, number];

const ctx = new AudioContext();

/**
 * 音色と音程
 */
class Osc extends OscillatorNode {
  noteNumber: number;
  pitch: number;
  constructor(
    ctx: AudioContext,
    noteNumber: number,
    type: OscillatorType,
    pitch: number
  ) {
    super(ctx);
    this.type = type;
    this.noteNumber = noteNumber;
    this.pitch = pitch;
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
  constructor(ctx: AudioContext, vadsr: number[], boost = 1) {
    super(ctx);
    [this.volume, this.attack, this.decay, this.sustain, this.release] = vadsr;
    this.boost = boost;
    this.gain.value = 0;
    this.down();
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

/**
 * 音符
 */
class Note {
  context: AudioContext;
  noteNumber: number;
  pitch: number;
  vadsr: VADSR;
  boostVolume: number;
  oscType: OscillatorType;
  osc: Osc;
  amp: Envelope;
  constructor(
    ctx: AudioContext,
    noteNumber: number,
    pitch: number,
    vadsr: VADSR,
    boostVolume = 1,
    oscType = "sine" as OscillatorType
  ) {
    this.context = ctx;
    this.noteNumber = noteNumber;
    this.pitch = pitch;
    this.vadsr = vadsr;
    this.boostVolume = boostVolume;
    this.oscType = oscType;
    this.osc = new Osc(this.context, this.noteNumber, this.oscType, this.pitch);
    this.amp = new Envelope(this.context, this.vadsr, this.boostVolume);
    this.osc.connect(this.amp);
    this.amp.connect(this.context.destination);
    this.down();
  }
  down() {
    this.amp.down();
    this.osc.start();
  }
  up() {
    this.amp.up();
    this.osc.stop(this.amp.stopTime);
  }
}

/**
 * チャンネルの音符の状態管理
 */
class Channel {
  context: AudioContext;
  vadsr: VADSR;
  boostVolume: number;
  oscType: OscillatorType;
  currentNotes: { [key: number]: Note };
  constructor(
    ctx: AudioContext,
    vadsr: VADSR,
    boostVolume = 1,
    oscType = "sine" as OscillatorType
  ) {
    this.context = ctx;
    this.vadsr = vadsr;
    this.boostVolume = boostVolume;
    this.oscType = oscType;
    this.currentNotes = {};
  }
  startNote(noteNumber: number, pitch: number) {
    this.currentNotes[noteNumber] = new Note(
      this.context,
      noteNumber,
      pitch,
      this.vadsr,
      this.boostVolume,
      this.oscType
    );
    this.currentNotes[noteNumber].osc.onended = this.cleanNote.bind(
      this,
      noteNumber
    );
  }
  stopNote(noteNumber: number) {
    this.currentNotes[noteNumber].up();
  }
  cleanNote(noteNumber: number) {
    console.log("clear:", noteNumber);
    delete this.currentNotes[noteNumber];
  }
}

let noteNumber = 69;

// let n: Note;
// setInterval(() => {
//   document.querySelector("#memo").innerHTML = "|".repeat(
//     n ? n.amp.gain.value * 50 : 0
//   );
// }, 10);

(window as any).ch = new Channel(ctx, [0.5, 0.1, 0.1, 0.5, 1], 1, "sawtooth");

(window as any).down = () => {
  (window as any).ch.startNote(noteNumber, 0);
};
(window as any).up = () => {
  (window as any).ch.stopNote(noteNumber);
};

// (window as any).play = () => {
//   playNote(noteNumber, [0.5, 0.1, 0.1, 0.5, 1]);
// };
(window as any).sub = () => {
  noteNumber--;
};
