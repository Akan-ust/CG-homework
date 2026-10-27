/* 6. 页面UI：模式动作按钮、状态栏、错误提示与快捷键说明。 */
(function (global) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;

  /** document.getElementById 的简写。 */
  const $ = id => document.getElementById(id);
  /** 格式化三维向量，保留两位小数。 */
  const vector = a => a.map(v => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2)).join(', ');

  /** 物体坐标系模式的动作按钮。 */
  const LOCAL_ACTIONS = [
    ['forward', '前进 W'],
    ['backward', '后退 S'],
    ['yaw+', '转向＋ A'],
    ['yaw-', '转向− D'],
    ['pitch+', '俯仰＋ I'],
    ['pitch-', '俯仰− K'],
    ['roll+', '翻滚＋ Q'],
    ['roll-', '翻滚− E'],
  ];
  /** 屏幕坐标系模式的动作按钮。 */
  const SCREEN_ACTIONS = [
    ['up', '上 ↑'],
    ['down', '下 ↓'],
    ['left', '左 ←'],
    ['right', '右 →'],
    ['sx+', 'X＋ I'],
    ['sx-', 'X− K'],
    ['sy+', 'Y＋ A'],
    ['sy-', 'Y− D'],
    ['sz+', 'Z＋ Q'],
    ['sz-', 'Z− E'],
  ];

  /** 页面UI控制器：只负责DOM文字与按钮，不持有模型或相机。 */
  class Ui {
    /** 绑定输入控制器，长按按钮直接写入其状态。 */
    constructor(input) {
      this.input = input;
    }

    /** 返回模式下拉框当前值。 */
    get mode() {
      return $('mode').value;
    }

    /** 返回观察下拉框当前值。 */
    get view() {
      return $('view').value;
    }

    /** 设置观察下拉框。 */
    setView(value) {
      $('view').value = value;
    }

    /** 显示或清除错误提示。 */
    notice(message) {
      $('error').hidden = !message;
      $('error').textContent = message;
    }

    /** 设置状态栏原始文字。 */
    setStatus(text) {
      $('status').textContent = text;
    }

    /** 根据当前模型与相机状态刷新状态栏。 */
    updateStatus({mode, name, model, camera, mesh}) {
      const label = mode === 'local' ? '物体坐标' : '屏幕坐标';
      $('status').textContent = mesh
        ? `${label} | ${name} | 位置(${vector(model.position)}) | ` +
          `前向(${vector(model.forward())})\n` +
          `四元数(${vector(model.rotation)}) | 相机距离 ${camera.distance.toFixed(1)} | ` +
          `${mesh.count / 3}个三角形`
        : `未加载模型 | 请在“辅助显示与STL”中导入 assets/海豚_ASCII.stl 或 海豚_Binary.stl\n` +
          `相机距离 ${camera.distance.toFixed(1)}`;
    }

    /** 移除所有按钮上的长按视觉状态。 */
    clearHeld() {
      document.querySelectorAll('.held').forEach(b => b.classList.remove('held'));
    }

    /** 按控制模式重建动作按钮与快捷键说明。 */
    setMode(mode) {
      const container = $('actions');
      container.replaceChildren();
      const actions = mode === 'local' ? LOCAL_ACTIONS : SCREEN_ACTIONS;
      for (const [action, label] of actions) {
        const b = document.createElement('button');
        b.textContent = label;
        b.dataset.action = action;
        b.onpointerdown = e => {
          if (e.button !== 0) return;
          e.preventDefault();
          b.setPointerCapture(e.pointerId);
          b.classList.add('held');
          this.input.held.add(action);
          this.input.action(action, 0.04);
        };
        /** 按钮松开时移除长按状态。 */
        const release = () => {
          this.input.held.delete(action);
          b.classList.remove('held');
        };
        b.onpointerup = release;
        b.onpointercancel = release;
        b.onlostpointercapture = release;
        b.onclick = e => {
          if (e.detail === 0) this.input.action(action, 0.15);
        };
        container.append(b);
      }

      $('keys').textContent = mode === 'local'
        ? '物体：W/S前后，A/D转向，I/K俯仰，Q/E翻滚。鼠标左键拖动观察，滚轮缩放。R重置模型。'
        : '屏幕：方向键移动，I/K绕X，A/D绕Y，Q/E绕Z。轴方向由当前相机确定；拖动相机后可再次验证。';
    }
  }

  const api = {Ui};
  if (isNode) {
    module.exports = api;
  } else {
    (global.DolphinModules = global.DolphinModules || {}).ui = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
