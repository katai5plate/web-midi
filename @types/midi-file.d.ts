declare module "midi-file" {
  interface MIDIFile {
    header: {
      format: number;
      numTracks: number;
      ticksPerBeat: number;
    };
    tracks: {
      deltaTime: number;
      meta: boolean;
      type: string;
      number: number;
      text: string;
      channel: number;
      port: number;
      microsecondsPerBeat: number;
      frameRate: number;
      hour: number;
      min: number;
      sec: number;
      frame: number;
      subFrame: number;
      numerator: number;
      denominator: number;
      metronome: number;
      thirtyseconds: number;
      key: number;
      scale: number;
      data: Uint8Array;
      metatypeByte: number;
      running: boolean;
      noteNumber: number;
      velocity: number;
      byte9: boolean;
      amount: number;
      controllerType: number;
      value: number;
      programNumber: number;
    }[][];
  }
  function parseMidi(data: Uint8Array): MIDIFile;
}
