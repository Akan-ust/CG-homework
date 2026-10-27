/* 3. 相机：Arcball、相机基、透视矩阵与预设视角。 */
(function (global) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const math = isNode ? require('./math.js') : (global.DolphinModules || {}).math;
  const {
    add, mul, normalize,
    qConjugate, qNormalize, qMul, qAxis, qRotate, qFromTo,
    mMul, mTranslation, mQuat, mPerspective,
  } = math;

  /** 用短边统一缩放；球外投影到赤道，避免长宽比改变球面。 */
  function arcballPoint(x, y, width, height) {
    const s = Math.max(1, Math.min(width, height));
    const nx = (2 * x - width) / s;
    const ny = (height - 2 * y) / s;
    const r2 = nx * nx + ny * ny;
    return r2 <= 1
      ? [nx, ny, Math.sqrt(Math.max(0, 1 - r2))]
      : normalize([nx, ny, 0]);
  }

  /** 轨道相机：Arcball 旋转、缩放和预设视角。 */
  class Camera {
    /** 创建相机并恢复默认视角。 */
    constructor() {
      this.reset();
    }

    /** 恢复默认朝向、距离与观察目标。 */
    reset() {
      this.rotation = qNormalize(qMul(qAxis([0, 1, 0], 0.64), qAxis([1, 0, 0], -0.28)));
      this.distance = 7.2;
      this.target = [0, 0.15, 0];
      this.anchor = null;
    }

    /** 返回相机右、上、后三个世界方向。 */
    basis() {
      return {
        right: qRotate(this.rotation, [1, 0, 0]),
        up: qRotate(this.rotation, [0, 1, 0]),
        back: qRotate(this.rotation, [0, 0, 1]),
      };
    }

    /** 计算相机世界坐标。 */
    eye() {
      return add(this.target, mul(this.basis().back, this.distance));
    }

    /** 计算视图矩阵与透视投影矩阵。 */
    matrices(aspect) {
      return {
        view: mMul(mQuat(qConjugate(this.rotation)), mTranslation(mul(this.eye(), -1))),
        projection: mPerspective(Math.PI / 4, aspect, 0.08, Math.max(300, this.distance + 150)),
      };
    }

    /** 记录拖动起点与起始相机四元数。 */
    startDrag(x, y, w, h) {
      this.anchor = {
        point: arcballPoint(x, y, w, h),
        rotation: [...this.rotation],
      };
    }

    /** 根据 Arcball 起点/当前点增量更新相机旋转。 */
    drag(x, y, w, h) {
      if (!this.anchor) return;
      // 映射从起点到当前点的视空间旋转，再求逆旋转相机。
      // 锚定起始四元数，避免事件采样密度影响最终旋转。
      const delta = qFromTo(this.anchor.point, arcballPoint(x, y, w, h));
      this.rotation = qNormalize(qMul(this.anchor.rotation, qConjugate(delta)));
    }

    /** 结束拖动，清空锚点。 */
    endDrag() {
      this.anchor = null;
    }

    /** 按滚轮增量缩放相机距离。 */
    zoom(delta) {
      const clamped = Math.max(-1000, Math.min(1000, delta));
      this.distance = Math.max(3, Math.min(45, this.distance * Math.exp(clamped * 0.001)));
    }

    /** 切换到正、侧、背、顶等预设视角。 */
    preset(name) {
      const settings = {
        front: [0, 0],
        back: [Math.PI, 0],
        right: [Math.PI / 2, 0],
        top: [0, -Math.PI / 2],
      };
      const v = settings[name];
      if (v) {
        this.rotation = qNormalize(qMul(qAxis([0, 1, 0], v[0]), qAxis([1, 0, 0], v[1])));
        this.endDrag();
      }
    }
  }

  const api = {arcballPoint, Camera};
  if (isNode) {
    module.exports = api;
  } else {
    (global.DolphinModules = global.DolphinModules || {}).camera = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
