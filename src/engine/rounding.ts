export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

/** Nearest even integer (ties go up). */
export function nearestEven(x: number): number {
  return Math.round(x / 2 + 1e-9) * 2;
}

/** Nearest integer with the required parity: 0 for even, 1 for odd. Ties go to the larger candidate. */
export function nearestWithParity(x: number, parity: 0 | 1): number {
  const r = Math.round(x);
  if (Math.abs(r % 2) === parity) return r;
  const lower = r - 1;
  const upper = r + 1;
  const dLower = Math.abs(x - lower);
  const dUpper = Math.abs(x - upper);
  return dLower < dUpper ? lower : upper;
}

/**
 * Largest-remainder allocation in units of 2: splits `total` over columns in
 * proportion to `weights`, every share even (an odd total puts its last hour on
 * the heaviest column). Columns with weight 0 always get 0.
 */
export function allocateEven(total: number, weights: number[]): number[] {
  const out = weights.map(() => 0);
  const W = sum(weights);
  if (total <= 0 || W <= 0) return out;
  const odd = total % 2 !== 0;
  const units = (total - (odd ? 1 : 0)) / 2;
  const q = weights.map(w => (units * w) / W);
  const fl = q.map(Math.floor);
  let left = units - sum(fl);
  const order = q
    .map((v, i) => ({ i, f: v - Math.floor(v) }))
    .filter(o => weights[o.i] > 0)
    .sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; left > 0 && order.length; k++, left--) fl[order[k % order.length].i]++;
  fl.forEach((u, i) => (out[i] = u * 2));
  if (odd) {
    let m = 0;
    weights.forEach((w, i) => { if (w > weights[m]) m = i; });
    out[m] += 1;
  }
  return out;
}
