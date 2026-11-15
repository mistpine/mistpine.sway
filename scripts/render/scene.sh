#!/bin/sh
# Runs inside the render image: builds one scene in real sway or i3 and
# screenshots it.
#   scene.sh <desktop|swaynag|i3>
#     desktop  headless sway: tabs, a split, an urgent window, swaybar
#     swaynag  headless sway: the exit prompt over two windows
#     i3       i3 on Xvfb: the desktop scene again, with xterm and i3bar
#   /themes    this repository's themes/ (read-only)
#   /examples  this repository's examples/ (read-only)
#   /scene     this directory (read-only)
#   /out       where <scene>.png goes; render.ts leaves foot.ini and
#              xterm.ad there, the terminal colors from the spec
set -eu
scene=$1
export LANG=C.UTF-8
CANVAS='#0b1f27' # bg1, the spec's canvas
mkdir -p "$HOME/.config/foot" "$HOME/.config/swaynag"
cp /out/foot.ini "$HOME/.config/foot/foot.ini"
cp /themes/swaynag.conf "$HOME/.config/swaynag/config"

# The bar from examples/bar.conf, with a position, a font and a status line.
bar() {
  sed "/^bar {/a\\
    position top\\
    font pango:JetBrains Mono 10\\
    tray_output none\\
    status_command while :; do echo 'mistpine · 21:30'; sleep 60; done" /examples/bar.conf
}
cat > /tmp/wm.conf <<CFG
include /themes/mistpine.conf
font pango:JetBrains Mono 10
default_border normal 2
gaps inner 10
focus_follows_mouse no
$(bar)
CFG

# ---------------------------------------------------------------- the WM
if [ "$scene" = i3 ]; then
  Xvfb :9 -screen 0 2000x1400x24 -dpi 192 -nolisten tcp >/dev/null 2>&1 &
  for _ in $(seq 50); do [ -e /tmp/.X11-unix/X9 ] && break; sleep 0.1; done
  export DISPLAY=:9
  hsetroot -solid "$CANVAS" >/dev/null
  i3 -c /tmp/wm.conf >/tmp/wm.log 2>&1 &
  msg() { i3-msg -q "$@"; }
  term() { # term <title> <content> [bell]
    title=$1 content=$2 bell=${3:-}
    set -- -xrm 'XTerm*bellIsUrgent: true'
    while IFS= read -r line; do set -- "$@" -xrm "$line"; done </out/xterm.ad
    xterm "$@" -fa 'JetBrains Mono' -fs 10 -T "$title" -e sh /scene/content.sh "$content" "$bell" &
  }
  count() { i3-msg -t get_tree | grep -o '"window":[0-9]' | wc -l; }
  for _ in $(seq 100); do i3-msg -t get_version >/dev/null 2>&1 && break; sleep 0.1; done
else
  export XDG_RUNTIME_DIR=/tmp/xdg && mkdir -p -m 700 $XDG_RUNTIME_DIR
  printf 'output * resolution 2000x1400 scale 2 bg %s solid_color\nxwayland disable\n' "$CANVAS" >> /tmp/wm.conf
  WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 \
    sway --unsupported-gpu -c /tmp/wm.conf >/tmp/wm.log 2>&1 &
  for _ in $(seq 100); do [ -e $XDG_RUNTIME_DIR/wayland-1 ] && break; sleep 0.1; done
  export WAYLAND_DISPLAY=wayland-1
  export SWAYSOCK=$(ls $XDG_RUNTIME_DIR/sway-ipc.*.sock)
  unset DISPLAY
  msg() { swaymsg -q "$@"; }
  term() { foot -T "$1" sh /scene/content.sh "$2" "${3:-}" >/dev/null 2>&1 & }
  count() { swaymsg -t get_tree | grep -c '"pid"' || true; }
fi

# Opens a window and waits until the WM manages it.
open() {
  n=$(count)
  term "$@"
  for _ in $(seq 100); do [ "$(count)" -gt "$n" ] && break; sleep 0.1; done
  sleep 0.3
}

# ---------------------------------------------------------------- the scene
case $scene in
  desktop | i3)
    # Workspace 3 asks for attention: its number turns red in the bar.
    msg workspace number 3
    open "notes" notes bell
    msg workspace number 2
    open "pnpm verify" build
    msg workspace number 1
    # Left: a tabbed container. Right: git status, focused and just split
    # (the orange edge is where the next window opens), over the notes.
    open "nvim ~/.config/sway/config" editor
    open "git status" status
    msg focus left
    msg split v
    msg layout tabbed
    open "git log" log
    open "pnpm verify" build
    msg focus right
    msg split v
    open "notes" notes
    msg focus up
    msg split v
    [ "$scene" = desktop ] && msg '[workspace=3] urgent enable'
    ;;
  swaynag)
    # The exit prompt, over a focused window and one asking for attention.
    open "nvim ~/.config/sway/config" editor
    open "notes" notes
    msg focus left
    msg '[title="^notes$"] urgent enable'
    swaynag -t warning --font 'JetBrains Mono 10' \
      -m 'You pressed the exit shortcut. Do you really want to exit sway? This will end your Wayland session.' \
      -B 'Yes, exit sway' 'true' >/tmp/swaynag.log 2>&1 &
    ;;
  *) echo "unknown scene $scene" >&2; exit 2 ;;
esac
sleep 2

png="/out/$scene.png"
if [ "$scene" = i3 ]; then
  import -window root "$png"
else
  grim "$png"
fi
# Raw pixels and size for the checks in render.ts.
convert "$png" -depth 8 "rgb:${png%.png}.rgb"
identify -format '%w %h\n' "$png" > "${png%.png}.size"
# For pnpm render: what the WM and swaynag said.
cp /tmp/wm.log "/out/$scene.log"
[ -e /tmp/swaynag.log ] && cp /tmp/swaynag.log "/out/$scene.swaynag.log"
exit 0
