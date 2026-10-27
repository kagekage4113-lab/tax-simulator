// ゲージ（スライダー）と数値入力の連動ロジック。DOM に依存しない純粋関数。
// 方針: 直接入力が正。ゲージ範囲外の値も state にそのまま保持し、ゲージ表示だけを端に寄せる。

// ゲージの最大値。現在値が既定最大を超える場合は、値を含む範囲まで広げて操作できるようにする。
export function sliderMaxFor(value, defaultMax, step) {
  if (!Number.isFinite(value) || value <= defaultMax) return defaultMax;
  return Math.ceil(value / step) * step;
}

// ゲージ位置の表示用に範囲内へ丸める（stateは変更しない）。
export function clampForSlider(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

// ゲージ操作で得た値を step の倍数にそろえる。
export function snapToStep(value, step) {
  return Math.round(value / step) * step;
}
