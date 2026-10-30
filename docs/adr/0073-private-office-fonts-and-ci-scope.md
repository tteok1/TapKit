# ADR 0073：Office进程私有字体与CI能力报告作用域

2026-10-30。P07 CI66缺当前runner能力报告；CI67真实探测通过后，8项文档/PPT中文核验仍失败。中文字符未丢失但绘制/提取顺序错乱；结合本机已安装中文字体、CI差异及缺失加载路径，证据指向字体回退。项目指定的Noto Sans CJK SC虽已打包，Office转换进程此前未加载它；通过锁定字体实测复验确认，不降低字符串断言，也不声称通用PDF阅读顺序已经解决。

OfficeWorker读取现有export-font-lock.json锁定的NotoSansCJKsc-Regular.otf，验证普通文件、路径、20MB上限与SHA256后以wx写入新转换workspace。开发/standard-user kit使用resources/fonts，目录包使用已有packages/core/dist/fonts；发现损坏不回退其他候选。固定LOK Python在加载文档前再次核验固定SHA256，用GDI AddFontResourceExW(FR_PRIVATE)注册此进程私有字体，完成后用相同flags释放。加载失败即拒绝转换；不安装系统字体，不修改注册表，不给模型文件路径/字体参数，不扩展AppContainer读写范围。

Windows官方说明FR_PRIVATE仅影响调用进程、同名字体优先使用私有资源，进程退出自动移除；显式释放使用相同flags。[AddFontResourceExW](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-addfontresourceexw)、[RemoveFontResourceExW](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-removefontresourceexw)。PDF.js文本项遵循PDF内部绘制顺序，并非通用阅读顺序；本次保持解析契约，先修复本产品生成时未提供锁定字体的问题，不声称重建任意复杂PDF的阅读顺序。[上游讨论](https://github.com/mozilla/pdf.js/issues/17191)。

字体锁纳入执行指纹，独立标准用户kit复制该manifest。原生P00正常转换代表集要求实际font_loaded事件；缺失/损坏字体在派发前拒绝。helper/OfficeWorker变化使旧能力报告失效，必须重建并真实验收，不注入available。

CI67还暴露有效能力报告使50次桌面启动逐次核对完整运行时，桌面50项实际全部通过但22分钟，最终60分钟上限在后续Office重复诊断时取消job。将9文件17项P07原生验收和真实probe放入独立office-native job；主集成仅排除这组文件，保留全部其他测试、独立标准用户和50项桌面检查。所有排除项逐文件在新job运行并上传实际成果，覆盖不减少；保持生产完整指纹校验。主job恢复45分钟，新原生job30分钟，避免将机器绑定报告跨runner复用。

真实结果待progress/evidence记录；ADR和新增步骤不代替通过。不合main、不扩P08、不增加模型请求。
