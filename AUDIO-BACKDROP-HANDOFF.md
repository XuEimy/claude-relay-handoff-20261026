# 系统声音律动：待重启验证

前端在桌面环境尝试启动系统声音采集，失败时静默保留普通背景，并在首次指针交互时重试。桌面处理器要求用户手势，因此自动启动和交互重试仍需实测；当前没有独立开关。

以下桌面层代码已纳入交接仓，但运行中的开发 App 尚未同步并重启验证：

- apps/desktop/src/electron/SystemAudioBackdrop.ts
- apps/desktop/src/electron/ElectronWindow.ts
- apps/desktop/scripts/electron-launcher.mjs
- scripts/build-desktop-artifact.ts

下一次受控重启后验证 macOS 系统音频权限、实际音频轨道、声音变化、拒绝权限和窗口卸载清理。音频仅在渲染进程分析，不上传、不保存、不回放；卸载释放轨道与 AudioContext。减少动态效果时不驱动背景变化。当前未完成真实系统声音采集验收。
