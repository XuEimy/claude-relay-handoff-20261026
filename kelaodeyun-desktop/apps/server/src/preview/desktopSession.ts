/**
 * The server desktop's session: wallpaper, taskbar, desktop icons and launchers.
 * Everything lives under one T3-owned directory so the host user's own desktop
 * config (~/.config, ~/Desktop) is never read or written.
 */

export interface DesktopSessionLayout {
  readonly configHome: string;
  readonly dataHome: string;
  readonly cacheHome: string;
  readonly desktopDir: string;
  readonly wallpaper: string;
  readonly chromeLauncher: string;
}

export const desktopSessionLayout = (sessionDir: string): DesktopSessionLayout => ({
  configHome: `${sessionDir}/config`,
  dataHome: `${sessionDir}/data`,
  cacheHome: `${sessionDir}/cache`,
  desktopDir: `${sessionDir}/Desktop`,
  wallpaper: `${sessionDir}/wallpaper.svg`,
  chromeLauncher: `${sessionDir}/chrome.sh`,
});

export const desktopSessionEnv = (layout: DesktopSessionLayout, display: string) => ({
  DISPLAY: display,
  XDG_CONFIG_HOME: layout.configHome,
  XDG_DATA_HOME: layout.dataHome,
  XDG_CACHE_HOME: layout.cacheHome,
  XDG_CURRENT_DESKTOP: "LXDE",
  // GTK otherwise waits on an accessibility bus no one runs here.
  NO_AT_BRIDGE: "1",
});

export interface DesktopSessionFile {
  readonly path: string;
  readonly content: string;
  readonly executable?: boolean;
}

const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

const FONT = "Noto Sans CJK SC";

const WALLPAPER = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#14213d"/>
      <stop offset="0.55" stop-color="#1d3557"/>
      <stop offset="1" stop-color="#245b6b"/>
    </linearGradient>
    <radialGradient id="glowA" cx="0.18" cy="0.2" r="0.65">
      <stop offset="0" stop-color="#5fa8d3" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#5fa8d3" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="0.88" cy="0.9" r="0.6">
      <stop offset="0" stop-color="#8e7dbe" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#8e7dbe" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#base)"/>
  <rect width="1600" height="900" fill="url(#glowA)"/>
  <rect width="1600" height="900" fill="url(#glowB)"/>
</svg>
`;

const desktopEntry = (entry: {
  readonly name: string;
  readonly exec: string;
  readonly icon: string;
}) => `[Desktop Entry]
Type=Application
Version=1.0
Name=${entry.name}
Exec=${entry.exec}
Icon=${entry.icon}
Terminal=false
StartupNotify=false
`;

const tint2rc = (
  layout: DesktopSessionLayout,
) => `# Written by T3 Code for its server desktop; rewritten on every start.
# Background 1: transparent
rounded = 0
border_width = 0
background_color = #000000 0
border_color = #000000 0
# Background 2: panel
rounded = 0
border_width = 0
background_color = #0d1520 86
border_color = #000000 0
# Background 3: focused task
rounded = 6
border_width = 0
background_color = #ffffff 22
border_color = #000000 0
# Background 4: task
rounded = 6
border_width = 0
background_color = #ffffff 8
border_color = #000000 0

panel_items = LTSC
panel_size = 100% 42
panel_margin = 0 0
panel_padding = 10 5 10
panel_background_id = 2
panel_position = bottom center horizontal
panel_layer = top
panel_monitor = all
panel_dock = 0
wm_menu = 0
strut_policy = follow_size
autohide = 0

taskbar_mode = single_desktop
taskbar_padding = 6 0 6
taskbar_background_id = 1
taskbar_active_background_id = 1
taskbar_name = 0

task_text = 1
task_icon = 1
task_centered = 0
task_maximum_size = 240 32
task_padding = 8 4 6
task_font = ${FONT} 9
task_font_color = #ffffff 80
task_active_font_color = #ffffff 100
task_background_id = 4
task_active_background_id = 3
task_urgent_background_id = 3
task_iconified_background_id = 1
mouse_left = toggle_iconify
mouse_middle = close
mouse_right = none

launcher_padding = 4 4 8
launcher_background_id = 0
launcher_icon_size = 28
launcher_icon_theme = Adwaita
launcher_item_app = ${layout.desktopDir}/chrome.desktop
launcher_item_app = ${layout.desktopDir}/files.desktop

systray_padding = 0 4 4
systray_background_id = 0
systray_icon_size = 20

time1_format = %H:%M
time1_font = ${FONT} Bold 10
time2_format = %Y-%m-%d
time2_font = ${FONT} 8
clock_font_color = #ffffff 95
clock_padding = 10 0
clock_background_id = 0
`;

export const desktopSessionFiles = (input: {
  readonly layout: DesktopSessionLayout;
  /** Chrome and the flags every window shares, so a second launch joins the running browser. */
  readonly chromeCommand: ReadonlyArray<string>;
  readonly chromeIcon: string;
  /** Where the file manager opens. */
  readonly home: string;
}): ReadonlyArray<DesktopSessionFile> => {
  const { layout } = input;
  return [
    { path: layout.wallpaper, content: WALLPAPER },
    {
      path: layout.chromeLauncher,
      content: `#!/bin/sh\nexec ${input.chromeCommand.map(shellQuote).join(" ")} "$@"\n`,
      executable: true,
    },
    {
      path: `${layout.desktopDir}/chrome.desktop`,
      content: desktopEntry({
        name: "Chrome",
        exec: `${layout.chromeLauncher} %U`,
        icon: input.chromeIcon,
      }),
      executable: true,
    },
    {
      path: `${layout.desktopDir}/files.desktop`,
      content: desktopEntry({
        name: "文件",
        exec: `pcmanfm "${input.home}"`,
        icon: "folder",
      }),
      executable: true,
    },
    {
      path: `${layout.configHome}/user-dirs.dirs`,
      content: `XDG_DESKTOP_DIR="${layout.desktopDir}"\n`,
    },
    {
      path: `${layout.configHome}/gtk-3.0/settings.ini`,
      content: `[Settings]\ngtk-icon-theme-name=Adwaita\ngtk-font-name=${FONT} 10\n`,
    },
    {
      // quick_exec skips libfm's "execute this file?" prompt for the launchers above.
      path: `${layout.configHome}/libfm/libfm.conf`,
      content: "[config]\nquick_exec=1\nsingle_click=0\n\n[ui]\nbig_icon_size=48\n",
    },
    {
      path: `${layout.configHome}/pcmanfm/default/pcmanfm.conf`,
      content:
        "[config]\nbm_open_method=0\n\n[volume]\nmount_on_startup=0\nmount_removable=0\nautorun=0\n\n[ui]\nview_mode=icon\nshow_hidden=0\n",
    },
    {
      path: `${layout.configHome}/pcmanfm/default/desktop-items-0.conf`,
      content: `[*]
wallpaper_mode=crop
wallpaper_common=1
wallpaper=${layout.wallpaper}
desktop_bg=#1d3557
desktop_fg=#ffffff
desktop_shadow=#000000
desktop_font=${FONT} 10
show_wm_menu=0
show_documents=0
show_trash=0
show_mounts=0
`,
    },
    { path: `${layout.configHome}/tint2/tint2rc`, content: tint2rc(layout) },
  ];
};
