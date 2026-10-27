/* 实验二：原生WebGL三维模型入口。普通脚本，无构建步骤，可直接双击index.html。
   本文件只负责启动：Node测试导出、模块检查和创建DolphinApp；
   页面控制逻辑位于js/dolphin-app.js。 */
(function (global) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  if (isNode) {
    const math = require('./js/math.js');
    const camera = require('./js/camera.js');
    const input = require('./js/input.js');
    const stl = require('./js/stl.js');
    // Node测试直接复用浏览器同一套核心函数；Renderer/UI/DolphinApp依赖WebGL/DOM，不导出。
    module.exports = Object.assign({}, math, camera, input, stl);
    return;
  }

  const modules = global.DolphinModules;
  /** document.getElementById 的简写。 */
  const $ = id => document.getElementById(id);

  try {
    const required = ['math', 'renderer', 'camera', 'input', 'stl', 'ui', 'loader', 'app'];
    if (!modules || required.some(name => !modules[name])) {
      throw new Error('核心模块未加载，请确认js目录与index.html在同一文件夹。');
    }
    global.dolphinLab = new modules.app.DolphinApp(modules, $('canvas'));
  } catch (error) {
    $('status').textContent = '初始化失败';
    $('error').hidden = false;
    $('error').textContent = error.message || '初始化失败，请使用Edge或Chrome打开。';
    console.error(error);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
