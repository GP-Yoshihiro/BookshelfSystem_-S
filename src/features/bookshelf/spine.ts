/**
 * 背表紙の見た目を ISBN から決定的に算出する純粋関数。
 *
 * 楽天ブックスAPIは背表紙の画像を提供しないため、背表紙は CSS で生成する。
 * その色と厚みをここで決める。
 *
 * ランダムに決めないのは、再読み込みのたびに色が変わると
 * 「あの赤い本」という見た目の記憶で探せなくなるため。
 * 分類ごとの色にしないのは、同じ分類の本がすべて同色になり
 * 見分けがつかなくなるため。
 */

/** 背表紙の厚みの段階（px） */
export const SPINE_WIDTHS_PX: readonly number[] = [34, 40, 46, 52];

export interface SpineStyle {
  /** 色相（0-359）。彩度と明度は描画側で固定する */
  hue: number;
  /** 背表紙の幅（px） */
  widthPx: number;
}

/**
 * djb2 による文字列ハッシュ。
 * 暗号用途ではなく見た目の振り分けにのみ使う。
 * 32ビット符号なしへ丸めて非負を保証する。
 */
export function hashString(value: string): number {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    // hash * 33 + charCode
    hash = (hash << 5) + hash + value.charCodeAt(index);
    // 32ビット符号なしへ都度丸める。丸めないと精度が落ちて衝突が増える
    hash >>>= 0;
  }
  return hash;
}

/**
 * ISBN から背表紙の色相と厚みを決める。
 *
 * 色相と厚みでハッシュの異なるビットを使うのは、両者が相関して
 * 「同じ色の本は必ず同じ厚み」になるのを避けるため。
 */
export function spineStyle(isbn: string): SpineStyle {
  const hash = hashString(isbn);
  const widthIndex = (hash >>> 16) % SPINE_WIDTHS_PX.length;
  // noUncheckedIndexedAccess のため undefined を排除する
  const widthPx = SPINE_WIDTHS_PX[widthIndex] ?? 40;

  return {
    hue: hash % 360,
    widthPx,
  };
}
