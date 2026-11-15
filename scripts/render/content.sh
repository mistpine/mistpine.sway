#!/bin/sh
# What each sample window shows: a few lines of a shell session in the
# mistpine terminal colors (ANSI), then nothing, forever.
#   content.sh <editor|log|status|build|notes> [bell]
e=$(printf '\033')
r="$e[0m"; dim="$e[90m"; red="$e[31m"; green="$e[32m"; yellow="$e[33m"; blue="$e[34m"; cyan="$e[36m"
prompt() { printf '%s~/src/mistpine.sway%s %s❯%s %s\n' "$blue" "$r" "$green" "$r" "$1"; }
printf '\033[?25l' # no cursor: the screenshot is about the window chrome
case $1 in
  editor)
    prompt "cat ~/.config/sway/config"
    printf '%s# Colors first, then everything else.%s\n' "$dim" "$r"
    printf '%sinclude%s ~/.config/sway/mistpine.conf\n\n' "$red" "$r"
    printf '%sset%s %s$mod%s Mod4\n' "$red" "$r" "$blue" "$r"
    printf '%sfont%s pango:JetBrains Mono %s10%s\n' "$red" "$r" "$yellow" "$r"
    printf '%sgaps%s inner %s10%s\n' "$red" "$r" "$yellow" "$r"
    printf '%sdefault_border%s normal %s2%s\n\n' "$red" "$r" "$yellow" "$r"
    printf '%sbindsym%s %s$mod%s+Return %sexec%s foot\n' "$red" "$r" "$blue" "$r" "$red" "$r"
    printf '%sbindsym%s %s$mod%s+d %sexec%s rofi -show drun\n' "$red" "$r" "$blue" "$r" "$red" "$r"
    ;;
  log)
    prompt "git log --oneline"
    printf '%s3f9c2a1%s %s(HEAD -> main)%s feat: add the swaynag colors\n' "$yellow" "$r" "$cyan" "$r"
    printf '%s8b01d4e%s fix: keep the indicator orange\n' "$yellow" "$r"
    printf '%s51e7a90%s docs: show the bar colors\n' "$yellow" "$r"
    printf '%sc42f6b3%s feat: generate from the spec\n' "$yellow" "$r"
    printf '%s07ad115%s chore: scaffold the port\n' "$yellow" "$r"
    ;;
  status)
    prompt "git status --short"
    printf ' %sM%s themes/mistpine.conf\n' "$red" "$r"
    printf ' %sM%s themes/swaynag.conf\n' "$red" "$r"
    printf '%s??%s examples/bar.conf\n' "$green" "$r"
    ;;
  build)
    prompt "pnpm verify"
    printf 'sway 1.11 %s✓%s mistpine.conf, swaynag.conf, bar.conf\n' "$green" "$r"
    printf 'i3 4.25   %s✓%s mistpine.conf, bar.conf\n' "$green" "$r"
    printf 'sway 1.9  %s✓%s mistpine.conf, swaynag.conf, bar.conf\n' "$green" "$r"
    printf 'i3 4.23   %s✓%s mistpine.conf, bar.conf\n' "$green" "$r"
    ;;
  notes)
    prompt "tail -3 TODO"
    printf '%s-%s ask for attention from here\n' "$yellow" "$r"
    printf '%s-%s the title turns red until focused\n' "$yellow" "$r"
    ;;
esac
[ "${2:-}" = bell ] && { sleep 1; printf '\a'; }
exec sleep infinity
