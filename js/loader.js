/* 7. STL导入流程：文件大小检查、异步读取、加载编号与结果回调。 */
(function (global) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const stl = isNode ? require('./stl.js') : (global.DolphinModules || {}).stl;
  const {parseSTL, fitMesh, MAX_BYTES} = stl;

  /** STL加载器：只负责读取与解析，成功或失败交给页面回调。 */
  class StlLoader {
    /** 绑定成功/失败回调并初始化加载编号。 */
    constructor({onLoad, onError}) {
      this.onLoad = onLoad;
      this.onError = onError;
      this.token = 0;
    }

    /** 解析缓冲区并回调；加载编号过期时忽略结果。 */
    importBuffer(buffer, name = 'STL模型', token = ++this.token) {
      if (token !== this.token) return false;
      try {
        this.onLoad(fitMesh(parseSTL(buffer)), name);
        return true;
      } catch (error) {
        this.onError(error.message || 'STL解析失败');
        return false;
      }
    }

    /** 读取用户选择的文件；超限或已被后续导入取代时放弃。 */
    async importFile(file) {
      const token = ++this.token;
      if (file.size > MAX_BYTES) {
        this.onError('文件超过20 MiB限制。');
        return false;
      }
      try {
        return this.importBuffer(await file.arrayBuffer(), file.name, token);
      } catch {
        if (token === this.token) this.onError('文件读取失败，请重新选择。');
        return false;
      }
    }
  }

  const api = {StlLoader};
  if (isNode) {
    module.exports = api;
  } else {
    (global.DolphinModules = global.DolphinModules || {}).loader = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
