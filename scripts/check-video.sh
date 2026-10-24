#!/usr/bin/env bash
# Quick checks for the explainer workflow. Needs ffmpeg and ffprobe.
#
#   check-video.sh sheet <out.png> <frame.png> [frame.png ...]
#       Puts the frames in one image, four to a row (each a 360x640 tile), so you can review them at a glance.
#
#   check-video.sh spec <video.mp4>
#       Prints the size, frame rate, duration and audio codec, and fails unless it's 1080x1920 with an audio track.
set -euo pipefail

cmd="${1:-}"
case "$cmd" in
  sheet)
    out="${2:?usage: check-video.sh sheet <out.png> <frame.png> [frame.png ...]}"
    shift 2
    [ "$#" -ge 1 ] || { echo "no frames given" >&2; exit 1; }
    # Each frame becomes a 360x640 tile; tiles go 4 to a row.
    tile="scale=360:640:force_original_aspect_ratio=decrease,pad=360:640:(ow-iw)/2:(oh-ih)/2"
    if [ "$#" -eq 1 ]; then
      ffmpeg -loglevel error -y -i "$1" -vf "$tile" "$out"
    else
      args=()
      filter=""
      inputs=""
      layout=""
      n=0
      for f in "$@"; do
        args+=(-i "$f")
        filter+="[$n:v]$tile[t$n];"
        inputs+="[t$n]"
        layout+="$(( (n % 4) * 360 ))_$(( (n / 4) * 640 ))|"
        n=$((n + 1))
      done
      ffmpeg -loglevel error -y "${args[@]}" \
        -filter_complex "${filter}${inputs}xstack=inputs=$n:layout=${layout%|}:fill=black" "$out"
    fi
    echo "contact sheet with $# frame(s): $out"
    ;;
  spec)
    video="${2:?usage: check-video.sh spec <video.mp4>}"
    size=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$video")
    rate=$(ffprobe -v error -select_streams v:0 -show_entries stream=avg_frame_rate -of csv=p=0 "$video")
    dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$video")
    [[ "$dur" =~ ^[0-9.]+$ ]] || dur=0
    audio=$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "$video")
    fps=$(awk -v r="$rate" 'BEGIN { split(r, a, "/"); printf "%.2f", (a[2] > 0) ? a[1] / a[2] : a[1] }')
    printf '%s: %s, %s fps, %.2f s, audio: %s\n' "$(basename "$video")" "$size" "$fps" "$dur" "${audio:-none}"
    [ "$size" = "1080x1920" ] || { echo "FAIL: expected 1080x1920" >&2; exit 1; }
    [ -n "$audio" ] || { echo "FAIL: no audio track" >&2; exit 1; }
    echo "OK"
    ;;
  *)
    echo "usage: check-video.sh sheet <out.png> <frame.png>... | check-video.sh spec <video.mp4>" >&2
    exit 1
    ;;
esac
