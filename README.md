# web-midi

WEB で MIDI を再生するテスト

## Usage

```
yarn dev
```

## 知見

- BPM は `60000000 / microsecondsPerBeat` で取得する
- deltaTime は予約用。現在からどれぐらい先で発火するか
  - イベントはチャンネルごとに順次発火する。
- noteNumber を周波数に変換するには: `440 * 2 ** ((noteNumber - 69) / 12)`
- FM 音源の作り方: https://m0t0k1w.tumblr.com/post/121737581743/web-audio-api%E3%81%A7fm%E3%82%B7%E3%83%B3%E3%82%BB%E3%82%92%E6%9B%B8%E3%81%8F

## 決めごと

- ES6 デプロイ。ES6 が動かないブラウザは捨てで。
