/* 1. 数学：右手系、列向量、列主序、四元数 [x, y, z, w]。 */
(function (global) {
  'use strict';

  const EPS = 1e-9;

  /** 向量相加。 */
  const add = (a, b) => a.map((v, i) => v + b[i]);
  /** 向量相减。 */
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  /** 向量数乘。 */
  const mul = (a, k) => a.map(v => v * k);
  /** 向量点积。 */
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  /** 三维向量叉积。 */
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  /** 向量归一化；零向量返回零向量。 */
  const normalize = a => {
    const n = Math.hypot(...a);
    return n > EPS ? mul(a, 1 / n) : a.map(() => 0);
  };

  /** 单位四元数 [0, 0, 0, 1]。 */
  const qIdentity = () => [0, 0, 0, 1];
  /** 四元数共轭。 */
  const qConjugate = q => [-q[0], -q[1], -q[2], q[3]];
  /** 四元数归一化；非法时回退为单位四元数。 */
  const qNormalize = q => (Math.hypot(...q) > EPS ? normalize(q) : qIdentity());

  /** 四元数乘法，组合两个旋转。 */
  function qMul(a, b) {
    const [x, y, z, w] = a;
    const [X, Y, Z, W] = b;
    return [
      w * X + x * W + y * Z - z * Y,
      w * Y - x * Z + y * W + z * X,
      w * Z + x * Y - y * X + z * W,
      w * W - x * X - y * Y - z * Z,
    ];
  }

  /** 由旋转轴和角度生成四元数。 */
  function qAxis(axis, angle) {
    const v = normalize(axis);
    const s = Math.sin(angle / 2);
    return qNormalize([...mul(v, s), Math.cos(angle / 2)]);
  }

  /** 用四元数旋转三维向量。 */
  function qRotate(q, v) {
    const u = q.slice(0, 3);
    const t = mul(cross(u, v), 2);
    return add(v, add(mul(t, q[3]), cross(u, t)));
  }

  /** 最短弧四元数：平行是单位旋转，反平行选稳定正交轴。 */
  function qFromTo(from, to) {
    const a = normalize(from);
    const b = normalize(to);
    const d = Math.max(-1, Math.min(1, dot(a, b)));
    if (d > 1 - EPS) return qIdentity();
    if (d < -1 + EPS) {
      const axis = cross(a, Math.abs(a[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0]);
      return qAxis(axis, Math.PI);
    }
    return qNormalize([...cross(a, b), 1 + d]);
  }

  /** 4×4 单位矩阵，列主序。 */
  const mIdentity = () => [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];

  /** 4×4 矩阵乘法。 */
  function mMul(a, b) {
    const out = Array(16).fill(0);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        for (let k = 0; k < 4; k++) {
          out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
        }
      }
    }
    return out;
  }

  /** 构造平移矩阵。 */
  function mTranslation(v) {
    const m = mIdentity();
    m[12] = v[0];
    m[13] = v[1];
    m[14] = v[2];
    return m;
  }

  /** 构造缩放矩阵。 */
  const mScale = v => [
    v[0], 0, 0, 0,
    0, v[1], 0, 0,
    0, 0, v[2], 0,
    0, 0, 0, 1,
  ];

  /** 四元数转旋转矩阵。 */
  function mQuat(q) {
    const [x, y, z, w] = qNormalize(q);
    const xx = x * x;
    const yy = y * y;
    const zz = z * z;
    const xy = x * y;
    const xz = x * z;
    const yz = y * z;
    const wx = w * x;
    const wy = w * y;
    const wz = w * z;
    return [
      1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0,
      2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0,
      2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0,
      0, 0, 0, 1,
    ];
  }

  /** 组合模型矩阵 T·R·S。 */
  const mCompose = (p, q, s = [1, 1, 1]) =>
    mMul(mTranslation(p), mMul(mQuat(q), mScale(s)));

  /** 用矩阵变换点（齐次坐标，含透视除法）。 */
  function mPoint(m, p) {
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    return [0, 1, 2].map(
      r => (m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]) / (Math.abs(w) > EPS ? w : 1)
    );
  }

  /** 构造透视投影矩阵。 */
  function mPerspective(fovy, aspect, near = 0.08, far = 300) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ];
  }

  /** 逆转置的 3×3，保证非均匀缩放后法线仍垂直表面。 */
  function mNormal(m) {
    const a = [m[0], m[1], m[2]];
    const b = [m[4], m[5], m[6]];
    const c = [m[8], m[9], m[10]];
    const bc = cross(b, c);
    const ca = cross(c, a);
    const ab = cross(a, b);
    const d = dot(a, bc);
    return Math.abs(d) < EPS
      ? [1, 0, 0, 0, 1, 0, 0, 0, 1]
      : [...mul(bc, 1 / d), ...mul(ca, 1 / d), ...mul(ab, 1 / d)];
  }

  /** 世界坐标轴方向：X、Y、Z。 */
  const AXES = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  const api = {
    EPS, add, sub, mul, dot, cross, normalize,
    qIdentity, qConjugate, qNormalize, qMul, qAxis, qRotate, qFromTo,
    mIdentity, mMul, mTranslation, mScale, mQuat, mCompose,
    mPoint, mPerspective, mNormal, AXES,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    (global.DolphinModules = global.DolphinModules || {}).math = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
