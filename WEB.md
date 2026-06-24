# PsychoPy Studio Web 模式

在浏览器中使用官方 PsychoPy Studio Builder:编辑实验 → 官方编译器转 PsychoJS → 新标签页预览运行。
文件保存在**浏览器本地存储**(IndexedDB,挂载为 `/webfs`),不上传服务器。

## 架构(尽量复用官方代码)

| 层 | 实现 |
| --- | --- |
| 前端 | 官方 psychopy-studio Svelte 界面(本仓库) |
| 编译 | 官方 `psychopy.experiment` + `psychopy.scripts.psyexpCompile`,**在浏览器内由 Pyodide Web Worker 运行**(`src/lib/official/pyodideWorker.js` + 传输无关的 `web_backend/official_core.py`),无服务器进程 |
| 运行库 | 官方 PsychoJS(从 `https://lib.pavlovia.org` 按官方 `getPsychoJS` 的规则获取,缓存进浏览器存储) |
| 文件系统 | 浏览器 IndexedDB(WebFS),Service Worker 把 `/webfs/*` 映射成可访问的 URL;支持上传/下载与本机交换文件 |

## 启动

### 1. 构建浏览器内后端资产(无需启动服务器)

编译器跑在浏览器里,所以**没有服务器要启动**。两个生成物(均 gitignore)首次需构建一次:

```bash
bash web_backend/pyodide/build_archive.sh   # 精简 psychopy + vendored 依赖 → static/pyodide/psychopy-core.zip
bash web_backend/pyodide/fetch_runtime.sh   # 自托管 pyodide 运行时 + numpy → static/pyodide/runtime/
```

`build_archive.sh` 会在需要时把官方 PsychoPy `dev` 分支克隆到 `../psychopy-core-src`
(可用 `PSYCHOPY_CORE_SRC` 覆盖)。后端原理见 [web_backend/pyodide/README.md](web_backend/pyodide/README.md)。

### 2. 前端

```bash
npm install
npm run svelte:dev      # http://localhost:5173
```

Pyodide Worker 在首次编译时懒加载(数秒),之后保持热。

生产部署:三步——`build_archive.sh` + `fetch_runtime.sh` + `npm run svelte:build`,然后把 `dist/`
托管到**任意静态服务器/CDN**即可,**无后端可反代**;运行时与 psychopy 包都同源自托管,可完全离线。

> 旧的 WebSocket Python 服务器(`official_backend.py`)仍保留,作本地开发 / 对比浏览器输出之用。

## 浏览器内工作流

1. 打开 `http://localhost:5173` → **Builder**;
2. 编辑实验;File → Save/Open 走**浏览器存储文件选择器**(支持上传单文件或**整个文件夹**,目录结构保留);
3. 实验素材(图片、声音、条件表格等):在组件参数点"浏览"上传,文件会自动放进当前实验的文件夹,参数里记录相对路径;也可以直接整个实验文件夹一起上传;
4. Ribbon 的 **Browser** 区:
   - **Compile to JS and preview**:官方编译器转 JS(素材随请求送官方编译器登记),写入 `/webfs`,新标签页直接运行(PsychoJS);
   - **Export official browser files**:按官方资源清单(`exp.getResourceFiles`)导出 JS + index.html + 素材 + 官方 PsychoJS 库;缺失的必需文件会红字列出;ZIP 解压即可静态托管;
   - **Manage browser files**:文件管理器——多选、上传(文件/文件夹)、下载、打包下载 ZIP(全部或勾选项)、删除、清空。

## 数据流(资源映射)

- 编译时:实验文件夹下的素材以 base64 随编译请求发给 Worker,落在 Pyodide 虚拟文件系统临时目录的 `.psyexp` 旁,官方编译器据此读取条件表、登记资源清单,然后临时目录即弃;
- 运行时:PsychoJS 按 `psychoJS.start({resources})` 清单从 `/webfs/<实验目录>/` 相对路径取素材(Service Worker 从 IndexedDB 提供);
- 注意:不要给实验设置 "HTML path"(在线导出目录)——官方编译器在设了 HTML 目录时不写运行时资源清单,Web 模式依赖该清单。

## 已知边界

- 浏览器模式只支持 PsychoJS 目标(Python 运行仍需桌面版);
- 素材应放在实验同一文件夹(子文件夹也可以);放在别处时导出会按文件名兜底匹配,并对找不到的文件给出提示;
- 首次预览需联网下载官方 PsychoJS 库(之后缓存于浏览器存储)。
