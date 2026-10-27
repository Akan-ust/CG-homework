/* 8. 页面控制器：编排模型、相机、输入、渲染与UI，绑定DOM事件并驱动帧循环。 */
(function (global) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;

  /** document.getElementById 的简写。 */
  const $ = id => document.getElementById(id);

  /** 页面控制器：持有各子系统，负责DOM事件、STL替换和帧循环。 */
  class DolphinApp {
    /** 接收已加载的模块与画布，创建各子系统并启动帧循环。 */
    constructor(modules, canvas) {
      const {Camera} = modules.camera;
      const {ModelState, InputController, KEY_CODES} = modules.input;
      const {Renderer} = modules.renderer;
      const {Ui} = modules.ui;
      const {StlLoader} = modules.loader;

      this.canvas = canvas;
      this.keyCodes = KEY_CODES;
      this.model = new ModelState();
      this.camera = new Camera();
      this.input = new InputController(this.model, this.camera);
      this.renderer = new Renderer(canvas);
      this.ui = new Ui(this.input);
      this.loader = new StlLoader({
        onLoad: (mesh, name) => this.replaceMesh(mesh, name),
        onError: message => this.ui.notice(message),
      });
      this.options = {
        world: true,
        local: true,
        trail: true,
        grid: true,
      };
      this.modelName = '未加载模型';
      this.previous = 0;
      this.lastStatus = 0;
      this.raf = 0;
      this.pointer = null;
      this.ready = true;
      this.frame = this.frame.bind(this);
      this.bindDOM();
      this.setMode();
      this.raf = requestAnimationFrame(this.frame);
    }

    /** 绑定工具栏、文件输入、键盘、指针和 WebGL 事件。 */
    bindDOM() {
      const canvas = this.canvas;
      $('mode').onchange = e => this.setMode(e);
      $('reset').onclick = () => this.resetModel();
      $('reset-view').onclick = () => this.resetView();
      $('view').onchange = () => this.setView();
      $('clear-trail').onclick = () => this.model.clearTrail();

      for (const el of document.querySelectorAll('[data-option]')) {
        el.onchange = () => {
          this.options[el.dataset.option] = el.checked;
          if (el.dataset.option === 'trail') this.model.recordTrail = el.checked;
        };
      }

      $('file').onchange = () => {
        const file = $('file').files[0];
        $('file').value = '';
        if (file) {
          this.clearInput();
          this.loader.importFile(file);
        }
      };

      window.addEventListener('keydown', e => this.onKeyDown(e));
      window.addEventListener('keyup', e => this.input.keyUp(e.code));
      window.addEventListener('blur', () => this.clearInput());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.clearInput();
      });

      canvas.onpointerdown = e => this.onPointerDown(e);
      canvas.onpointermove = e => this.onPointerMove(e);
      /** 结束指针拖动。 */
      const release = () => this.releasePointer();
      canvas.onpointerup = release;
      canvas.onpointercancel = release;
      canvas.onlostpointercapture = release;

      canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1;
        this.camera.zoom(e.deltaY * scale);
      }, {passive: false});

      window.addEventListener('resize', () => this.camera.endDrag());
      canvas.addEventListener('webglcontextlost', e => this.onContextLost(e));
    }

    /** 清空输入状态和按钮/画布上的视觉状态。 */
    clearInput() {
      this.input.clear();
      this.ui.clearHeld();
      this.canvas.classList.remove('dragging');
    }

    /** 重置模型变换与轨迹。 */
    resetModel() {
      this.clearInput();
      this.model.reset();
    }

    /** 恢复默认相机视角。 */
    resetView() {
      this.clearInput();
      this.camera.reset();
      this.ui.setView('default');
    }

    /** 应用观察菜单选择的视角。 */
    setView() {
      this.clearInput();
      const value = this.ui.view;
      if (value === 'default') this.camera.reset();
      else if (value === 'focus') this.camera.target = [...this.model.position];
      else this.camera.preset(value);
      this.canvas.focus({preventScroll: true});
    }

    /** 切换控制模式并重建动作按钮。 */
    setMode(event) {
      this.clearInput();
      this.input.setMode(this.ui.mode);
      this.ui.setMode(this.input.mode);
      if (event) this.canvas.focus({preventScroll: true});
    }

    /** 上传新网格，并重置模型、相机和视角。 */
    replaceMesh(mesh, name) {
      this.renderer.setModel(mesh);
      this.modelName = name;
      this.resetModel();
      this.camera.reset();
      this.ui.setView('default');
      this.ui.notice('');
    }

    /** 处理快捷键：R 重置模型。 */
    onKeyDown(e) {
      if (
        e.target.matches('input,select,textarea') ||
        e.target.isContentEditable ||
        e.ctrlKey || e.altKey || e.metaKey
      ) {
        return;
      }
      if (!this.keyCodes.has(e.code)) return;
      e.preventDefault();
      if (e.code === 'KeyR') {
        if (!e.repeat) this.resetModel();
      } else if (!e.repeat) {
        this.input.keyDown(e.code);
      }
    }

    /** 开始 Arcball 拖动并捕获指针。 */
    onPointerDown(e) {
      if (e.button !== 0) return;
      this.clearInput();
      this.canvas.focus({preventScroll: true});
      this.pointer = e.pointerId;
      this.canvas.setPointerCapture(this.pointer);
      const r = this.canvas.getBoundingClientRect();
      this.camera.startDrag(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
      this.canvas.classList.add('dragging');
    }

    /** 拖动相机。 */
    onPointerMove(e) {
      if (e.pointerId !== this.pointer) return;
      const r = this.canvas.getBoundingClientRect();
      this.camera.drag(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    }

    /** 结束拖动并释放指针状态。 */
    releasePointer() {
      this.pointer = null;
      this.camera.endDrag();
      this.canvas.classList.remove('dragging');
    }

    /** 处理 WebGL 上下文丢失，停止渲染。 */
    onContextLost(e) {
      e.preventDefault();
      this.ready = false;
      this.clearInput();
      cancelAnimationFrame(this.raf);
      this.ui.notice('WebGL上下文丢失，请刷新页面。');
      this.ui.setStatus('渲染已停止');
    }

    /** 每帧更新输入、渲染并刷新状态栏。 */
    frame(now) {
      const dt = this.previous ? Math.min(0.05, (now - this.previous) / 1000) : 0;
      this.previous = now;

      if (!document.hidden) {
        this.input.update(dt);
        this.renderer.render(this.model, this.camera, this.options);
        if (now - this.lastStatus > 100) {
          this.ui.updateStatus({
            mode: this.input.mode,
            name: this.modelName,
            model: this.model,
            camera: this.camera,
            mesh: this.renderer.modelMesh,
          });
          this.lastStatus = now;
        }
      }

      this.raf = requestAnimationFrame(this.frame);
    }
  }

  const api = {DolphinApp};
  if (isNode) {
    module.exports = api;
  } else {
    (global.DolphinModules = global.DolphinModules || {}).app = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
