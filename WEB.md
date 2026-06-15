# PsychoPy Studio Web 模式

在浏览器中使用官方 PsychoPy Studio Builder:编辑实验 → 官方编译器转 PsychoJS → 新标签页预览运行。
文件保存在**浏览器本地存储**(IndexedDB,挂载为 `/webfs`),不上传服务器。

## 架构(尽量复用官方代码)

| 层 | 实现 |
| --- | --- |
| 前端 | 官方 psychopy-studio Svelte 界面(本仓库) |
| 编译 | 官方 `psychopy.experiment` + `psychopy.scripts.psyexpCompile`,由 `web_backend/official_backend.py` 这个薄 WebSocket 壳暴露 |
| 运行库 | 官方 PsychoJS(从 `https://lib.pavlovia.org` 按官方 `getPsychoJS` 的规则获取,缓存进浏览器存储) |
| 文件系统 | 浏览器 IndexedDB(WebFS),Service Worker 把 `/webfs/*` 映射成可访问的 URL;支持上传/下载与本机交换文件 |

## 启动

### 1. Python 后端(官方编译器)

需要官方 PsychoPy 源码(dev 分支)在本仓库旁边的 `psychopy-core-src/`:

```bash
git clone --depth 1 -b dev https://github.com/psychopy/psychopy.git ../psychopy-core-src

python3 -m venv .venv-backend
.venv-backend/bin/pip install esprima dukpy astunparse numpy scipy pandas \
    openpyxl json-tricks i18next pyyaml pyserial
.venv-backend/bin/pip install javascripthon --no-deps

.venv-backend/bin/python web_backend/official_backend.py
# 监听 http://127.0.0.1:8002(POST 跑命令、GET 健康检查;可用 PSYCHOPY_WEB_BACKEND_HOST/PORT、PSYCHOPY_CORE_SRC 覆盖)
```

### 2. 前端

```bash
npm install
npm run svelte:dev      # http://localhost:5173
```

## 生产部署(EdgeOne Pages)

前端是纯静态(`adapter-static` → `dist/`),后端编译器作为 EdgeOne Pages 的 **Python Serverless 函数**部署。二者同域,无需 CORS。

**目录结构**——自定义构建,走 EdgeOne **Build Output 规范**:构建产出 `.edgeone/`,由 `edgeone.json` 的 `outputDirectory: ".edgeone"` 指定,EdgeOne 直接消费(不做框架探测)。

```
.edgeone/                              # 构建产出、不入库(.gitignore)
├── assets/                            # 静态前端(dist/ 的拷贝)
└── cloud-functions/api-python/        # Python 函数组(handler 模式)
    ├── config.json                    # { version:3, routes:[{src:"^/api/backend$"}] } —— 函数 meta(关键!)
    ├── app.py                         # 固定入口文件名,暴露 handler 类
    ├── requirements.txt               # pip 依赖(EdgeOne 安装;numpy/scipy/dukpy 等,无 GUI 库)
    ├── official_backend.py            # 后端逻辑(从 web_backend/ 拷贝)
    └── psychopy/                      # 官方源码(git dev,剪掉 demos/tests)
```

仓库里只提交 `edgeone.json`、`cloud-functions/requirements.txt`(依赖清单源)、`scripts/build-edgeone-output.mjs`。

**构建**

```bash
npm run build:edgeone   # = svelte:build(出 dist/)+ build:edgeone-output(组装 .edgeone/)
```

`scripts/build-edgeone-output.mjs`:把 `dist/` 拷进 `.edgeone/assets/`;按 `$PSYCHOPY_CORE_SRC` → `../psychopy-core-src` → `git clone -b dev` 取 psychopy 源码、剪枝,连同 `official_backend.py` 与生成的 `app.py`/`config.json`/`requirements.txt` 组装进 `.edgeone/cloud-functions/api-python/`。EdgeOne 控制台:构建命令 `npm run build:edgeone`,**输出目录 `.edgeone`**(`edgeone.json` 已声明),根目录 `.`。

**为什么 vendor 源码而不是 pip 装 psychopy**:PyPI 版本太老,且 `pip install psychopy` 会拉 pyglet/wx/pyqt 等 GUI 依赖(serverless 用不上)。把源码挂 `sys.path`(`ensure_core_path`)绕过 `setup.py`,只补 numpy/scipy/pandas 等轻依赖即可;编译/profile 路径实测不需要 pyglet。

**前端指向后端**:生产构建**默认**就走同域相对路径 `/api/backend`(`src/lib/official/backend.js` 按 `import.meta.env.DEV` 区分:dev 连 `:8002`,生产用 `/api/backend`),无需任何配置。只有当后端不在同域(例如独立域名)时才需覆盖:

```js
localStorage.setItem("psychopy.officialBackendUrl", "https://backend.example.com/api/backend")
// 或在构建产物注入 window.__PSYCHOPY_OFFICIAL_BACKEND_URL__ = "..."
```

> 待验证:`dukpy` 是 C 扩展,需确认 EdgeOne 运行时有对应 wheel;执行超时/包体积上限以 EdgeOne 文档为准,建议先用 GET 健康检查跑通链路,再上编译。
>
> 也可不用 serverless:直接 `npm run svelte:build` 静态托管 `dist/`,另起独立后端 `python web_backend/official_backend.py` 并反代到 `https://<host>:8002`(此时需要 CORS,已内置)。

## 浏览器内工作流

1. 打开 `http://localhost:5173` → **Builder**;
2. 编辑实验;File → Save/Open 走**浏览器存储文件选择器**(支持上传单文件或**整个文件夹**,目录结构保留);
3. 实验素材(图片、声音、条件表格等):在组件参数点"浏览"上传,文件会自动放进当前实验的文件夹,参数里记录相对路径;也可以直接整个实验文件夹一起上传;
4. Ribbon 的 **Browser** 区:
   - **Compile to JS and preview**:官方编译器转 JS(素材随请求送官方编译器登记),写入 `/webfs`,新标签页直接运行(PsychoJS);
   - **Export official browser files**:按官方资源清单(`exp.getResourceFiles`)导出 JS + index.html + 素材 + 官方 PsychoJS 库;缺失的必需文件会红字列出;ZIP 解压即可静态托管;
   - **Manage browser files**:文件管理器——多选、上传(文件/文件夹)、下载、打包下载 ZIP(全部或勾选项)、删除、清空。

## 数据流(资源映射)

- 编译时:实验文件夹下的素材以 base64 随编译请求发给后端,落在服务端临时目录的 `.psyexp` 旁,官方编译器据此读取条件表、登记资源清单,然后临时目录即弃;
- 运行时:PsychoJS 按 `psychoJS.start({resources})` 清单从 `/webfs/<实验目录>/` 相对路径取素材(Service Worker 从 IndexedDB 提供);
- 注意:不要给实验设置 "HTML path"(在线导出目录)——官方编译器在设了 HTML 目录时不写运行时资源清单,Web 模式依赖该清单。

## 已知边界

- 浏览器模式只支持 PsychoJS 目标(Python 运行仍需桌面版);
- 素材应放在实验同一文件夹(子文件夹也可以);放在别处时导出会按文件名兜底匹配,并对找不到的文件给出提示;
- 首次预览需联网下载官方 PsychoJS 库(之后缓存于浏览器存储)。
