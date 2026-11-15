#!/bin/sh
# Runs inside the verify image: loads the files in sway and i3 and dumps
# what they made of them into /out for verify.ts.
#   /themes, /examples  this repository's files (read-only)
set -u
export LANG=C.UTF-8
# i3 4.23 wants a font; the status line stays up so i3bar does not complain.
cat > /tmp/wm.conf <<CFG
include /themes/mistpine.conf
font pango:monospace 10
$(sed '/^bar {/a\
    status_command sh -c "echo mistpine; exec sleep 600"' /examples/bar.conf)
CFG

# 1. The config checkers. Both exit 0 on errors, so verify.ts reads stderr.
sway --version > /out/sway.version
WLR_BACKENDS=headless WLR_RENDERER=pixman sway --unsupported-gpu -C -c /tmp/wm.conf > /out/sway-check.err 2>&1
i3 --version > /out/i3.version
i3 -C -c /tmp/wm.conf > /out/i3-check.err 2>&1

# 2. sway itself: the bar's colors over IPC, and swaynag with each type.
export XDG_RUNTIME_DIR=/tmp/xdg && mkdir -p -m 700 $XDG_RUNTIME_DIR
{ cat /tmp/wm.conf; echo 'xwayland disable'; echo 'output * bg #0b1f27 solid_color'; } > /tmp/sway.conf
WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 \
  sway --unsupported-gpu -c /tmp/sway.conf > /out/sway.log 2>&1 &
for _ in $(seq 100); do [ -e $XDG_RUNTIME_DIR/wayland-1 ] && break; sleep 0.1; done
export WAYLAND_DISPLAY=wayland-1 SWAYSOCK=$(ls $XDG_RUNTIME_DIR/sway-ipc.*.sock)
for _ in $(seq 50); do swaymsg -t get_bar_config 2>/dev/null | grep -q bar- && break; sleep 0.1; done
swaymsg -r -t get_bar_config "$(swaymsg -r -t get_bar_config | grep -o 'bar-[0-9]*' | head -1)" > /out/sway-bar.json
for type in error warning; do
  # Still up after 2 s: swaynag took the config (it exits 255 on a bad one).
  timeout 2 swaynag -c /themes/swaynag.conf -t $type -m mistpine > /out/swaynag-$type.err 2>&1
  echo $? > /out/swaynag-$type.exit
done

# 3. i3 on Xvfb: the bar's colors over IPC.
Xvfb :9 -screen 0 1280x800x24 -nolisten tcp >/dev/null 2>&1 &
for _ in $(seq 50); do [ -e /tmp/.X11-unix/X9 ] && break; sleep 0.1; done
export DISPLAY=:9
i3 -c /tmp/wm.conf > /out/i3.log 2>&1 &
for _ in $(seq 100); do i3-msg -t get_bar_config 2>/dev/null | grep -q bar- && break; sleep 0.1; done
i3-msg -t get_bar_config "$(i3-msg -t get_bar_config | grep -o 'bar-[0-9]*' | head -1)" > /out/i3-bar.json
sleep 1 # let i3bar start and parse the colors (it logs to i3.log)
exit 0
