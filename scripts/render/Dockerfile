# The sway and i3 environment for pnpm verify and pnpm render.
#   ubuntu:24.04 ships sway 1.9 and i3 4.23, ubuntu:26.04 sway 1.11 and i3 4.25.
ARG BASE=ubuntu:26.04
FROM ${BASE}
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      sway grim foot \
      i3-wm xvfb xterm hsetroot \
      imagemagick fonts-jetbrains-mono ca-certificates \
 && rm -rf /var/lib/apt/lists/*
