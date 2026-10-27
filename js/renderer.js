/* 2. WebGL渲染器：一个Shader程序绘制三角形与参考线；辅助线通过u_unlit跳过光照。 */
(function (global) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const math = isNode ? require('./math.js') : (global.DolphinModules || {}).math;
  const {mIdentity, mMul, mPoint, mNormal, AXES, add, sub, mul, normalize, cross} = math;

  /** 把线段数组转换为 GPU 顶点/颜色数组。 */
  function buildLines(segments) {
    const positions = [];
    const colors = [];
    for (const [a, b, color] of segments) {
      positions.push(...a, ...b);
      colors.push(...color, ...color);
    }
    return {
      positions: new Float32Array(positions),
      colors: new Float32Array(colors),
    };
  }

  /** 生成带箭头翼的坐标轴线段。 */
  function axisSegments(origin, basis, length = 1.6) {
    const colors = [[0.83, 0.23, 0.23], [0.19, 0.61, 0.33], [0.19, 0.38, 0.83]];
    const lines = [];
    basis.forEach((axis, i) => {
      const tip = add(origin, mul(axis, length));
      const side = normalize(cross(axis, Math.abs(axis[1]) < 0.8 ? [0, 1, 0] : [1, 0, 0]));
      lines.push(
        [origin, tip, colors[i]],
        [tip, add(add(tip, mul(axis, -0.16)), mul(side, 0.07)), colors[i]],
        [tip, add(add(tip, mul(axis, -0.16)), mul(side, -0.07)), colors[i]]
      );
    });
    return lines;
  }

  /** WebGL 渲染器：管理 Shader、缓冲和绘制流程。 */
  class Renderer {
    /** 初始化 WebGL 上下文、Shader、缓冲和网格。 */
    constructor(canvas) {
      this.canvas = canvas;
      const gl = this.gl = canvas.getContext('webgl', {
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
      });
      if (!gl) throw new Error('无法启动WebGL，请开启浏览器硬件加速后刷新。');

      const vertex = `attribute vec3 a_position,a_normal,a_color;uniform mat4 u_mvp;uniform mat3 u_normal;varying vec3 n,c;void main(){gl_Position=u_mvp*vec4(a_position,1.0);n=u_normal*a_normal;c=a_color;}`;
      const fragment = `precision mediump float;varying vec3 n,c;uniform float u_unlit;void main(){float light=.52+.48*max(dot(normalize(n),normalize(vec3(-.4,.85,.65))),0.0);gl_FragColor=vec4(c*mix(light,1.0,u_unlit),1.0);}`;

      /** 编译并检查一个 Shader。 */
      const shader = (type, source) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
          throw new Error(gl.getShaderInfoLog(s));
        }
        return s;
      };

      const vs = shader(gl.VERTEX_SHADER, vertex);
      const fs = shader(gl.FRAGMENT_SHADER, fragment);
      const program = this.program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program));
      }

      this.loc = {};
      for (const n of ['position', 'normal', 'color']) {
        this.loc[n] = gl.getAttribLocation(program, 'a_' + n);
      }
      for (const n of ['mvp', 'normal', 'unlit']) {
        this.loc['u_' + n] = gl.getUniformLocation(program, 'u_' + n);
      }

      this.modelMesh = null;
      this.dynamic = {
        position: gl.createBuffer(),
        color: gl.createBuffer(),
      };

      const lines = [];
      for (let i = -12; i <= 12; i++) {
        const c = [0.84, 0.87, 0.89];
        lines.push(
          [[i, -1, -12], [i, -1, 12], c],
          [[-12, -1, i], [12, -1, i], c]
        );
      }
      this.grid = this.upload(buildLines(lines));
      gl.enable(gl.DEPTH_TEST);
      gl.clearColor(0.975, 0.984, 0.99, 1);
    }

    /** 上传网格的位置/法线/颜色并返回缓冲信息。 */
    upload(mesh) {
      const gl = this.gl;
      const out = {count: mesh.positions.length / 3};
      for (const n of ['position', 'normal', 'color']) {
        const data = mesh[n + 's'];
        if (data) {
          out[n] = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, out[n]);
          gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        }
      }
      return out;
    }

    /** 替换当前模型并释放旧 GPU 缓冲。 */
    setModel(mesh) {
      const next = this.upload(mesh);
      if (this.modelMesh) {
        for (const n of ['position', 'normal', 'color']) {
          if (this.modelMesh[n]) this.gl.deleteBuffer(this.modelMesh[n]);
        }
      }
      this.modelMesh = next;
    }

    /** 用指定矩阵绘制模型或线段。 */
    draw(mesh, matrix, vp, lines = false, mode = this.gl.LINES) {
      const gl = this.gl;
      const loc = this.loc;
      gl.useProgram(this.program);

      for (const n of ['position', 'color']) {
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh[n]);
        gl.enableVertexAttribArray(loc[n]);
        gl.vertexAttribPointer(loc[n], 3, gl.FLOAT, false, 0, 0);
      }

      if (lines) {
        gl.disableVertexAttribArray(loc.normal);
        gl.vertexAttrib3f(loc.normal, 0, 1, 0);
      } else {
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normal);
        gl.enableVertexAttribArray(loc.normal);
        gl.vertexAttribPointer(loc.normal, 3, gl.FLOAT, false, 0, 0);
      }

      gl.uniformMatrix4fv(loc.u_mvp, false, new Float32Array(mMul(vp, matrix)));
      gl.uniformMatrix3fv(loc.u_normal, false, new Float32Array(mNormal(matrix)));
      gl.uniform1f(loc.u_unlit, lines ? 1 : 0);
      gl.drawArrays(lines ? mode : gl.TRIANGLES, 0, mesh.count);
    }

    /** 用动态缓冲绘制线段。 */
    lines(data, vp, mode) {
      const gl = this.gl;
      for (const n of ['position', 'color']) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamic[n]);
        gl.bufferData(gl.ARRAY_BUFFER, data[n + 's'], gl.DYNAMIC_DRAW);
      }
      this.dynamic.count = data.positions.length / 3;
      this.draw(this.dynamic, mIdentity(), vp, true, mode);
    }

    /** 绘制网格、模型、辅助轴和轨迹。 */
    scene(matrix, model, camera, options, aspect) {
      const gl = this.gl;
      const {view, projection} = camera.matrices(aspect);
      const vp = mMul(projection, view);
      const center = mPoint(matrix, [0, 0, 0]);

      if (options.grid) this.draw(this.grid, mIdentity(), vp, true);
      if (this.modelMesh) this.draw(this.modelMesh, matrix, vp);

      const lines = [];
      if (options.world) lines.push(...axisSegments([0, -0.98, 0], AXES, 2.5));
      if (this.modelMesh) {
        if (options.local) {
          const localAxes = AXES.map(a => sub(mPoint(matrix, a), center));
          lines.push(...axisSegments(center, localAxes, 1.65));
        }
      }

      if (lines.length) {
        gl.disable(gl.DEPTH_TEST);
        this.lines(buildLines(lines), vp);
        gl.enable(gl.DEPTH_TEST);
      }

      if (this.modelMesh && options.trail && model.trail.length > 1) {
        const positions = new Float32Array(model.trail.flat());
        const colors = Float32Array.from(positions, (_, i) => [0.87, 0.47, 0.12][i % 3]);
        this.lines({positions, colors}, vp, gl.LINE_STRIP);
      }
    }

    /** 调整画布视口并渲染一帧。 */
    render(model, camera, options) {
      const gl = this.gl;
      const c = this.canvas;
      const d = Math.min(devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(c.clientWidth * d));
      const h = Math.max(1, Math.round(c.clientHeight * d));
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      this.scene(model.matrix(), model, camera, options, w / h);
    }
  }

  const api = {Renderer};
  if (isNode) {
    module.exports = api;
  } else {
    (global.DolphinModules = global.DolphinModules || {}).renderer = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
