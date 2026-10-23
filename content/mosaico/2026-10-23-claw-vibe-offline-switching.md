---
title: 把官方 Claw 放回 Ideas：一次 Mosaico 固件切换实录
description: 刷了别人的作品，怎样回到官方界面？从 Claw 0.5.0 恢复，到保存本地 Idea、修复上传限制，再从设备列表启动，全程留下验证依据。
category: 固件与恢复
draft: false
---

我最初想做的事情很简单：在 Mosaico 上保留官方界面，同时玩别人做的作品。最好还能让自己的应用像 Works、Camera、Interaction 一样，直接出现在首页。

实际动手后，问题变成了：用 Vibe Mode 刷进一个第三方固件，官方界面就不见了；回到 Vibe Mode，又找不到 ESP-Claw 的安装码。难道每次想回来，都要接电脑重刷一遍出厂固件？

这次我让 Codex 接着排查，最终把官方 **ESP-Claw 0.5.0 保存成了设备上的本地 Idea**。原有的 TickPlay 和另一个作品保留，新条目可以从 Vibe Mode 打开。完成这一步后，返回官方界面有了一个设备本地的入口。

![Vibe Mode 列表中的 TickPlay、Idea 200040 和 ESP-Claw 0.5.0](/mosaico/assets/claw-saved.png)

<p class="caption">实机截图：三个条目同时保存在设备中。截图拍摄时，列表正在更新存储统计。</p>

> 实验日期：2026-10-23。设备为 ESP32-S31、16 MiB Flash；主固件为 Claw 0.5.0，维护固件为 Vibe Mode 0.2.0。本文描述这个版本组合的实测结果，后续版本应重新核对格式与接口。

## 先把三种“应用”分清楚

这里最容易混淆的，是三个看起来都像“装 App”的需求。

| 目标 | 所在层次 | 这次是否完成 |
|---|---|---|
| 把内容放进 Works | 官方固件中的内容或应用运行入口 | 本文未展开 |
| 在 Claw 首页增加一个原生图标 | 官方固件的原生应用与界面集成 | 尚未实现，需要对应源码开发 |
| 在官方 Claw 与第三方固件之间切换 | Vibe Mode 的 Ideas 固件管理 | 已保存 Claw，并从该条目启动 |

因此，这次解决的是第三个问题。它不会把一个完整的第三方固件自动变成 Claw 首页的原生 App。

## 为什么能保留多个 Idea，却一次只运行一个

查看官方源码后，关键关系就清楚了：**NOR 放当前运行的主固件，NAND 放可以再次安装的 Idea 副本，Vibe Mode 负责管理和切换。**

切换时，设备读取保存的描述文件和组件，验证完整性，并按需要写入主固件区域后重启。因此多个条目可以保存在设备上，但它们不是同时运行的多个进程，也不是点一下就瞬间换过去的手机 App。

此前“想回官方就必须重新连电脑刷整机”的理解过于简单。真正缺少的是一个保存在 NAND 里的 Claw 条目。对应行为可以在官方的 [Ideas 库与启动逻辑](https://github.com/esp-mosaico/esp-mosaico-utils/blob/be151ae047014e79a9c7ae0092dd203844499003/esp-mosaico-vibe-mode/firmware/vibe-mode/components/app_ideas/src/ideas_library.c) 和 [开发固件捕获代码](https://github.com/esp-mosaico/esp-mosaico-utils/blob/be151ae047014e79a9c7ae0092dd203844499003/esp-mosaico-vibe-mode/firmware/vibe-mode/components/app_ideas/src/ideas_development.c) 中找到。

## 第一步：恢复官方 Claw，先让它能正常运行

前面排查时，我们尝试过 ROM 下载模式和完整镜像刷写。它能解决“官方界面回来”，但恢复本身不会自动在 Ideas 列表里留下一个可切回的副本。

后续确认 Vibe Mode 可用后，流程改为通过官方工具的维护接口操作。这里有一个值得单独记下的区别：

- **AI + Power**：进入设备上的 Vibe Mode。
- **BOOT + Power**：进入芯片 ROM 下载模式。

ROM 模式黑屏是正常现象，但黑屏并不能说明已经进入 Vibe Mode。两种模式的 USB 接口和可用工具不同，不应该混着尝试。

使用的源文件来自[官方固件页](https://mosaico.espressif.com/firmware-update/)，文件名为 `ESP-Mosaico-Claw_v0.5.0.bin`。本次下载的完整镜像 SHA-256 是：

```text
bd45c135034d50cd9d0d36cfbe5219c2e760274d27d87a0087ec4bc38206b10e
```

为了通过 Vibe Mode 恢复，Codex 从完整镜像中提取了四个组件，再调用官方的 system-update bundle builder 重打包。应用程序没有重新编译，组件字节也没有改动。

| 组件 | 目标偏移 | 提取大小 |
|---|---:|---:|
| 分区表 | `0x8000` | 4,096 字节 |
| Claw 主程序 | `0x210000` | 6,586,784 字节 |
| UI 资源 | `0x9e0000` | 3,276,800 字节 |
| 系统资源 | `0xd00000` | 3,072,000 字节 |

这次 Vibe Mode 更新包的写入范围只有上面四项；没有把 bootloader、维护固件、设备身份、NVS 或整个 NAND 打进去。这里说的是后半段维护模式的恢复包，不是把前面完整镜像刷写也描述成只写了四个组件。

还有一个容易误判的现象：工具写入完成后，等待运行固件的 Iris 健康确认超时，结果显示 `outcome_unknown`。当时不能仅凭这个状态就再刷一遍。我们核对了提交记录、USB 产品名称，并由我确认屏幕已经进入官方界面。**写入后的确认超时，与写入本身失败，需要分别判断。**

## 第二步：补上本地 Idea，而不是再找一个安装码

恢复后，我重新进入 Vibe Mode。官方 Claw 已经可以运行，但 Ideas 里仍然只有原来的两个作品。

我们先检查了 Develop 和 Manage 页面，没有找到“保存当前固件”的操作入口。再看这一版源码和工作流说明，发现后端仍有保存开发固件的能力，但界面已经移除了相应按钮。

于是改用官方 ESP-Iris 文件接口，把刚才验证过的 Claw 组件按 **`mosaico-ideas/local/2`** 格式保存到 NAND。这个步骤不需要假造一个社区安装码。

目录结构大致是：

```text
/nand/ideas/dxxxxx/
  .roots
  current/
    manifest.json
    firmware/
      manifest.json
      partition_table.bin
      main_app.bin
      ui_apps.bin
      system.bin
```

外层 manifest 告诉 Vibe Mode 这是哪个应用、叫什么、内层清单在哪；内层 manifest 描述每个组件的偏移、大小和 SHA-256。`.roots` 绑定外层描述文件的大小和哈希，是本地提交与完整性记录，不能把它理解为官方签名。

我们先只读检查了设备已有记录，确认 journal 布局与源码一致。然后创建一个新的 Claw 目录，逐个上传文件，不覆盖原有作品，最后才提交 `.roots`。这避免了文件还没传完就把一个半包当成可用条目。格式依据是官方的 [包解析器](https://github.com/esp-mosaico/esp-mosaico-utils/blob/be151ae047014e79a9c7ae0092dd203844499003/esp-mosaico-vibe-mode/firmware/vibe-mode/components/app_ideas/src/ideas_package.c) 与 [存储实现](https://github.com/esp-mosaico/esp-mosaico-utils/blob/be151ae047014e79a9c7ae0092dd203844499003/esp-mosaico-vibe-mode/firmware/vibe-mode/components/app_ideas/src/ideas_store.c)。

## 中途遇到的坑：6 MB 文件被当成 JSON 请求

第一个大文件上传失败，提示：

```text
Maximum request body size 1048576 exceeded.
```

问题发生在电脑端 Gateway，文件尚未写入设备。对应工具版本的请求分类中间件把包含 `/files/` 的路径识别为大请求，但实际上传地址结尾是 **`/file`**。它没有命中大请求规则，因而落入普通 JSON 请求的 1 MiB 限制。

修复是让 `/file` 也走既有的大请求分类，继续保留工具已有的上传大小限制。停止空闲 Gateway、重启加载修改后，6.6 MB 的主程序就能正常上传了。这是对本次使用工具版本的一处本地修正，不代表所有版本都有相同问题。代码位置见 [Gateway 中间件](https://github.com/esp-mosaico/esp-mosaico-utils/blob/be151ae047014e79a9c7ae0092dd203844499003/ESP-Iris/components/esp_iris/tools/iris_gateway/gateway.py) 和 [文件路由](https://github.com/esp-mosaico/esp-mosaico-utils/blob/be151ae047014e79a9c7ae0092dd203844499003/ESP-Iris/components/esp_iris/tools/iris_gateway/file_routes.py)。

另一个小坑是界面缓存。文件已经写入，但正在打开的 Ideas 列表没有立即刷新。源码确认这一版切换显示语言会触发重新扫描，于是临时切换后再恢复原语言，Claw 条目便出现了。平时重新进入 Vibe Mode 也可以让它重新发现本地内容。

## 最后验证：必须从保存的条目打开一次

“上传成功”和“实际能切回”是两件事。最后的验证顺序是：

1. 核对七个新文件的提交结果，确认大小及 SHA-256 与本地记录一致。
2. 在 Manage 中看到 `ESP-Claw 0.5.0`，同时确认原来的两个 Idea 仍在。
3. 进入 Claw 详情，点击 **Open**。
4. 观察设备从本地副本写入主应用，等待验证和重启完成。
5. 电脑重新识别到 USB 产品 `ESP-Mosaico-Claw`。

![本地 ESP-Claw 条目的详情与 Open 按钮](/mosaico/assets/claw-detail.png)

<p class="caption">这个 “On this device” 条目，就是后续离线返回官方界面的入口。</p>

![设备从保存的 Claw 副本写入主应用，进度为 82%](/mosaico/assets/claw-install.png)

<p class="caption">切换会经历校验和写入过程，需要等待设备完成，不能把它当成普通页面跳转。</p>

实测确认的是：**保存的 Claw 条目能够被 Vibe Mode 识别，并从该条目完成本地安装与启动。** 此前官方界面已经由我确认。我们没有测试所有第三方固件之间的往返组合，也没有把这次结果写成对所有版本的保证。

## 现在怎么用

想回到官方界面时：关机，按住顶部 **AI 键**再按 **Power**，进入 Vibe Mode，选择 **ESP-Claw → Open**。

想玩已保存的其他作品时，也从 Vibe Mode 选择对应 Idea。已经在设备本地保存好的包，不需要每次再找安装码或连接电脑下载。一次运行一个主固件，切换时仍要给设备留出校验、写入和重启的时间。

至于我最初想要的“自己的 App 出现在 Claw 首页”，那仍是另一个开发任务：需要研究原生应用注册和界面集成，不能把这次固件切换包装成已经完成了原生 App 开发。

## 把这次经验做成一个 skill

这次流程已经整理成 **`mosaico-claw-recovery`**。它包含版本检查、存储格式依据、异常处理、完成标准，以及一个只在电脑上运行的离线打包脚本。

[下载 skill 包](/mosaico/downloads/mosaico-claw-recovery.zip)

解压后，将 `mosaico-claw-recovery` 文件夹放入 Codex 的 skills 目录。在识别到该 skill 的会话中，可以这样提出任务：

```text
使用 $mosaico-claw-recovery 检查我的 Mosaico，
把官方 Claw 保存为本地 Idea，保留现有作品，并验证启动。
```

附带脚本只接受这次验证过的官方 0.5.0 镜像，拒绝不匹配的哈希，也不会覆盖已有输出目录。它不连接硬件、不自动刷机；设备端步骤仍要求代理读取当前设备状态和相应版本源码。

我曾提出“不行就用 REA 逆向”。最终没有走到那一步：官方源码已经足以解释存储格式和接口。此次的关键工作，是把源码、实际 USB 状态、文件校验和设备界面串起来，补上一个能重复使用的返回入口。
