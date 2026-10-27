/* 5. STL：严格读取、保留双精度，居中后输出GPU浮点数据。
   颜色扩展：二进制使用VisCAM/SolidView属性字节（bit15置位，5-5-5 RGB）；
   ASCII在facet内使用color r g b行（本项目扩展，数值0..1）。 */
(function (global) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const math = isNode ? require('./math.js') : (global.DolphinModules || {}).math;
  const {sub, cross} = math;

  const MAX_BYTES = 20 * 1024 * 1024;
  const MAX_TRIANGLES = 200000;
  const DEFAULT_COLOR = [0.25, 0.58, 0.74];
  const number = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?';

  /** 判断颜色分量是否在 0..1 之间。 */
  const validColor = v => Number.isFinite(v) && v >= 0 && v <= 1;

  /** 解析 ASCII/二进制 STL，返回位置、法线、颜色、面数与格式。 */
  function parseSTL(buffer) {
    if (!(buffer instanceof ArrayBuffer) || !buffer.byteLength) {
      throw new Error('文件为空，请选择有效的 STL 文件。');
    }
    if (buffer.byteLength > MAX_BYTES) {
      throw new Error('文件超过 20 MiB 限制，请先简化模型。');
    }

    let format;
    const faces = [];
    const view = new DataView(buffer);
    const count = buffer.byteLength >= 84 ? view.getUint32(80, true) : 0;

    if (buffer.byteLength >= 84 && 84 + count * 50 === buffer.byteLength) {
      format = 'binary';
      if (count > MAX_TRIANGLES) throw new Error('模型面数超过 200000 限制。');
      for (let i = 0; i < count; i++) {
        const offset = 84 + 50 * i;
        /** 读取当前面第 j 个 float32。 */
        const read = j => view.getFloat32(offset + j * 4, true);
        const attr = view.getUint16(offset + 48, true);
        // VisCAM/SolidView：bit15 置位表示颜色有效，其余为 R/G/B 各 5 位。
        const color = attr & 0x8000
          ? [((attr >> 10) & 31) / 31, ((attr >> 5) & 31) / 31, (attr & 31) / 31]
          : null;
        faces.push({
          normal: [read(0), read(1), read(2)],
          vertices: Array.from({length: 3}, (_, k) => [
            read(3 + k * 3),
            read(4 + k * 3),
            read(5 + k * 3),
          ]),
          color,
        });
      }
    } else {
      const text = new TextDecoder().decode(buffer);
      const source = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
      if (!/^\s*solid\b/i.test(source)) {
        if (count > MAX_TRIANGLES) {
          throw new Error('模型面数超过 200000 限制，或文件头已损坏。');
        }
        throw new Error('无法识别 STL，二进制长度可能不完整。');
      }
      format = 'ascii';

      const outer = source.match(/^\s*solid[^\r\n]*[\r\n]+([\s\S]*?)\bendsolid[^\r\n]*\s*$/i);
      if (!outer) throw new Error('ASCII STL 缺少完整 solid / endsolid 结构。');

      const triple = `(${number})\\s+(${number})\\s+(${number})`;
      const pattern = new RegExp(
        `\\s*facet\\s+normal\\s+${triple}` +
        `(?:\\s+color\\s+${triple})?` +
        `\\s+outer\\s+loop\\s+vertex\\s+${triple}` +
        `\\s+vertex\\s+${triple}\\s+vertex\\s+${triple}` +
        `\\s+endloop\\s+endfacet`,
        'iy'
      );

      let offset = 0;
      let match;
      while (offset < outer[1].length) {
        if (!outer[1].slice(offset).trim()) break;
        pattern.lastIndex = offset;
        match = pattern.exec(outer[1]);
        if (!match) throw new Error('ASCII STL 面片不完整或含不合法顶点数据。');

        const values = match.slice(1);
        /** 读取 ASCII 捕获组，缺省时返回 undefined。 */
        const num = i => (values[i] === undefined ? undefined : Number(values[i]));
        const color = values[3] === undefined ? null : [num(3), num(4), num(5)];
        faces.push({
          normal: [num(0), num(1), num(2)],
          color,
          vertices: [
            [num(6), num(7), num(8)],
            [num(9), num(10), num(11)],
            [num(12), num(13), num(14)],
          ],
        });
        if (faces.length > MAX_TRIANGLES) {
          throw new Error('模型面数超过 200000 限制。');
        }
        offset = pattern.lastIndex;
      }
    }

    if (!faces.length) throw new Error('STL 不包含三角面片。');

    // 居中前保留 JS 双精度，避免大偏移、小尺寸的 ASCII 模型提前丢失细节。
    const hasColors = faces.some(face => face.color);
    const positions = new Float64Array(faces.length * 9);
    const normals = new Float32Array(faces.length * 9);
    const colors = hasColors ? new Float32Array(faces.length * 9) : null;

    faces.forEach((face, i) => {
      if (!face.vertices.flat().every(v => Number.isFinite(v) && Math.abs(v) <= 1e12)) {
        throw new Error('模型顶点不是有限数，或超出合理坐标范围。');
      }
      if (!face.normal.every(Number.isFinite)) {
        throw new Error('STL 含不合法法线。');
      }
      if (face.color && !face.color.every(validColor)) {
        throw new Error('STL 含不合法颜色，应为0到1之间的三个数。');
      }

      const e1 = sub(face.vertices[1], face.vertices[0]);
      const e2 = sub(face.vertices[2], face.vertices[0]);
      const normal = cross(e1, e2);
      if (Math.hypot(...normal) <= Number.EPSILON * Math.hypot(...e1) * Math.hypot(...e2)) {
        throw new Error('STL 包含零面积或退化三角形，请修复后导入。');
      }

      // STL 单位没有约定：微米级三角形的叉积可能很小，不能用绝对
      // 长度阈值把合法法线当成零。退化检查已完成，直接按实际长度归一。
      const source = Math.hypot(...face.normal) > 0 ? face.normal : normal;
      const length = Math.hypot(...source);
      const n = source.map(v => v / length);

      positions.set(face.vertices.flat(), i * 9);
      normals.set([...n, ...n, ...n], i * 9);
      if (colors) {
        const c = face.color || DEFAULT_COLOR;
        colors.set([...c, ...c, ...c], i * 9);
      }
    });

    return {positions, normals, colors, triangles: faces.length, format};
  }

  /** 将网格居中并缩放到统一大小，保留原有颜色。 */
  function fitMesh(mesh) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < mesh.positions.length; i++) {
      const k = i % 3;
      min[k] = Math.min(min[k], mesh.positions[i]);
      max[k] = Math.max(max[k], mesh.positions[i]);
    }

    const center = min.map((n, i) => (n + max[i]) / 2);
    const span = Math.max(...max.map((n, i) => n - min[i]));
    if (!Number.isFinite(span) || span <= 0) throw new Error('模型包围盒无效。');

    const scale = 3.2 / span;
    const positions = Float32Array.from(
      mesh.positions,
      (n, i) => (n - center[i % 3]) * scale
    );
    const colors = mesh.colors
      ? Float32Array.from(mesh.colors)
      : Float32Array.from(positions, (_, i) => DEFAULT_COLOR[i % 3]);

    return {
      ...mesh,
      positions,
      colors,
      sourceBounds: {min, max, center, scale},
    };
  }

  const api = {parseSTL, fitMesh, MAX_BYTES, MAX_TRIANGLES};
  if (isNode) {
    module.exports = api;
  } else {
    (global.DolphinModules = global.DolphinModules || {}).stl = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
