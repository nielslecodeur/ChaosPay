#!/usr/bin/env sh
set -eu

repository="https://github.com/nielslecodeur/Lumaid.git"
install_dir="${1:-}"
check_only=false

if [ "${1:-}" = "--check-only" ]; then
  check_only=true
elif [ "$#" -gt 1 ]; then
  printf '%s\n' "Usage: ./install.sh [install-directory|--check-only]" >&2
  exit 2
fi

case "$(uname -s)" in
  Linux|Darwin) ;;
  *)
    printf '%s\n' "Use install.ps1 on Windows. This script supports macOS and Linux." >&2
    exit 1
    ;;
esac

for command_name in git node npm; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf '%s\n' "Required command '$command_name' was not found. Install Git and Node.js 24+ (which includes npm), then rerun this installer." >&2
    exit 1
  fi
done

node_version=$(node -p 'process.versions.node')
node_major=${node_version%%.*}
case "$node_major" in
  ''|*[!0-9]*)
    printf '%s\n' "Could not determine Node.js version from '$node_version'." >&2
    exit 1
    ;;
esac
if [ "$node_major" -lt 24 ]; then
  printf '%s\n' "Node.js 24 or newer is required; found v$node_version. Install a current LTS release from https://nodejs.org/ and retry." >&2
  exit 1
fi

if [ "$check_only" = true ]; then
  printf '%s\n' "Prerequisites OK: Node.js v$node_version, npm and Git are available. No files were changed."
  exit 0
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_dir=""
if [ -f "$script_dir/package.json" ]; then
  package_name=$(node -p "require('$script_dir/package.json').name")
  if [ "$package_name" != "chaospay" ]; then
    printf '%s\n' "The installer is next to a package.json, but it is not the ChaosPay repository." >&2
    exit 1
  fi
  project_dir=$script_dir
else
  if [ -z "$install_dir" ]; then
    install_dir="$HOME/chaospay"
  fi
  case "$install_dir" in
    /*) project_dir=$install_dir ;;
    *) project_dir=$(pwd)/$install_dir ;;
  esac
  if [ -e "$project_dir" ]; then
    if [ ! -f "$project_dir/package.json" ] ||
       [ "$(node -p "require('$project_dir/package.json').name" 2>/dev/null || true)" != "chaospay" ]; then
      printf '%s\n' "Install directory already exists and is not a ChaosPay checkout: $project_dir" >&2
      exit 1
    fi
    printf '%s\n' "Using existing ChaosPay checkout: $project_dir"
  else
    parent_dir=$(dirname "$project_dir")
    if [ ! -d "$parent_dir" ]; then
      printf '%s\n' "Parent directory does not exist: $parent_dir" >&2
      exit 1
    fi
    git clone --depth 1 "$repository" "$project_dir"
  fi
fi

(cd "$project_dir" && npm ci)

printf '\n%s\n' "ChaosPay dependencies installed in $project_dir"
printf '%s\n' "Start the local dashboard with: npm run dev:dashboard"
printf '%s\n' "Then open: http://127.0.0.1:3002"
printf '%s\n' "This does not create Stellar keys or submit payments."
