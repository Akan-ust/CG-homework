/* 4. 物体状态与连续输入：局部增量右乘，相机世界轴增量左乘。 */
(function (global) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const math = isNode ? require('./math.js') : (global.DolphinModules || {}).math;
  const {add, mul, qIdentity, qNormalize, qMul, qAxis, qRotate, mCompose, AXES} = math;

  /** 物体变换状态：位置、四元数姿态与轨迹。 */
  class ModelState {
    /** 创建模型状态并开启轨迹记录。 */
    constructor() {
      this.recordTrail = true;
      this.reset();
    }

    /** 恢复位置、姿态和轨迹。 */
    reset() {
      this.position = [0, 0, 0];
      this.rotation = qIdentity();
      this.trail = [[0, 0, 0]];
    }

    /** 返回当前姿态下的局部 +Z 世界方向。 */
    forward() {
      return qRotate(this.rotation, [0, 0, 1]);
    }

    /** 生成模型矩阵 T·R。 */
    matrix() {
      return mCompose(this.position, this.rotation);
    }

    /** 平移模型并追加轨迹点。 */
    translate(v) {
      // 有限演示区域避免模型移动至远裁剪面之外；不改变方向算法。
      this.position = add(this.position, v).map(n => Math.max(-40, Math.min(40, n)));
      if (this.recordTrail && Math.hypot(...this.position.map((n, i) => n - this.trail.at(-1)[i])) > 0.025) {
        this.trail.push([...this.position]);
        if (this.trail.length > 3000) this.trail.shift();
      }
    }

    /** 沿模型局部前向移动。 */
    localMove(d) {
      this.translate(mul(this.forward(), d));
    }

    /** 绕模型局部轴旋转（右乘）。 */
    localRotate(axis, angle) {
      this.rotation = qNormalize(qMul(this.rotation, qAxis(AXES[axis], angle)));
    }

    /** 沿相机右/上方向平移模型。 */
    screenMove(x, y, basis) {
      this.translate(add(mul(basis.right, x), mul(basis.up, y)));
    }

    /** 绕相机世界轴旋转模型（左乘）。 */
    screenRotate(axis, angle, basis) {
      this.rotation = qNormalize(
        qMul(qAxis([basis.right, basis.up, basis.back][axis], angle), this.rotation)
      );
    }

    /** 清空轨迹，仅保留当前位置。 */
    clearTrail() {
      this.trail = [[...this.position]];
    }
  }

  /** 物体坐标系模式：按键到动作的映射。 */
  const localKeys = {
    KeyW: 'forward', KeyS: 'backward', KeyA: 'yaw+', KeyD: 'yaw-',
    KeyI: 'pitch+', KeyK: 'pitch-', KeyQ: 'roll+', KeyE: 'roll-',
  };
  /** 屏幕坐标系模式：按键到动作的映射。 */
  const screenKeys = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    KeyI: 'sx+', KeyK: 'sx-', KeyA: 'sy+', KeyD: 'sy-',
    KeyQ: 'sz+', KeyE: 'sz-',
  };
  /** 页面需要拦截的按键：两种模式的动作键，加上 R 重置。 */
  const KEY_CODES = new Set([...Object.keys(localKeys), ...Object.keys(screenKeys), 'KeyR']);

  /** 连续输入控制器：把按键和长按按钮映射到模型动作。 */
  class InputController {
    /** 绑定模型、相机并初始化输入状态。 */
    constructor(model, camera) {
      this.model = model;
      this.camera = camera;
      this.mode = 'local';
      this.keys = new Set();
      this.held = new Set();
      this.speed = 1.8;
      this.angularSpeed = 1.1;
    }

    /** 清空按键、长按和拖动状态。 */
    clear() {
      this.keys.clear();
      this.held.clear();
      this.camera.endDrag();
    }

    /** 切换物体/屏幕控制模式。 */
    setMode(mode) {
      this.clear();
      this.mode = mode;
    }

    /** 记录按下的按键。 */
    keyDown(code) {
      this.keys.add(code);
    }

    /** 移除松开的按键。 */
    keyUp(code) {
      this.keys.delete(code);
    }

    /** 执行一次命名动作，距离/角度由 dt 决定。 */
    action(name, dt) {
      const step = this.speed * dt;
      const angle = this.angularSpeed * dt;
      const basis = this.camera.basis();
      const model = this.model;

      if (name === 'forward') model.localMove(step);
      else if (name === 'backward') model.localMove(-step);
      else if (name === 'left') model.screenMove(-step, 0, basis);
      else if (name === 'right') model.screenMove(step, 0, basis);
      else if (name === 'up') model.screenMove(0, step, basis);
      else if (name === 'down') model.screenMove(0, -step, basis);
      else {
        const axisMap = {yaw: 1, pitch: 0, roll: 2, sx: 0, sy: 1, sz: 2};
        const kind = name.slice(0, -1);
        const sign = name.endsWith('+') ? 1 : -1;
        if (kind in axisMap) {
          if (kind.startsWith('s')) model.screenRotate(axisMap[kind], angle * sign, basis);
          else model.localRotate(axisMap[kind], angle * sign);
        }
      }
    }

    /** 每帧把当前按键和长按转换为动作。 */
    update(dt) {
      const map = this.mode === 'local' ? localKeys : screenKeys;
      const actions = new Set(this.held);
      for (const key of this.keys) if (map[key]) actions.add(map[key]);
      for (const action of actions) this.action(action, Math.min(0.05, Math.max(0, dt)));
    }
  }

  const api = {ModelState, InputController, KEY_CODES};
  if (isNode) {
    module.exports = api;
  } else {
    (global.DolphinModules = global.DolphinModules || {}).input = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
