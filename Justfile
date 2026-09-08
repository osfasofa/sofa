# the Sofa — the one entry point for every build task.

default:
    @just --list

# The deck's wasm, from the pinned submodule. ALWAYS `cd` into it: cargo reads
# `.cargo/config.toml` (--import-memory, the memory limits, the SIMD features)
# and `rust-toolchain.toml` from the CURRENT DIRECTORY, not from
# --manifest-path. Built from the repo root, the wasm links without imported
# memory and the worklet dies with a LinkError on first boot.
build-wasm:
    npm run --silent build-wasm

# Release wasm + wasm-opt. Needs binaryen (`brew install binaryen`).
build-wasm-release:
    cd vendor/sofakit && cargo build -p sk-dsp-wasm --target wasm32-unknown-unknown --release
    mkdir -p target/wasm-opt
    wasm-opt -O3 --enable-simd --enable-bulk-memory --enable-nontrapping-float-to-int \
        --enable-sign-ext --enable-multivalue --zero-filled-memory \
        vendor/sofakit/target/wasm32-unknown-unknown/release/sk_dsp.wasm -o target/wasm-opt/sk_dsp.wasm

# `vite dev` with the isolation headers. Builds the wasm first so the page never
# boots against a stale or missing artifact.
dev: build-wasm
    npm run dev

# TypeScript checks: tsc + eslint.
check:
    npm run typecheck
    npm run lint

# The node tests, including the charter registry test (needs no wasm).
test:
    npm test

# Everything CI runs, in the order that fails fastest.
check-all: check test

# Full production build.
build: build-wasm-release
    npm run typecheck
    SK_DSP_WASM=target/wasm-opt/sk_dsp.wasm npm run build

# Move the platform pin. Records the reason in VENDOR.md's log by hand — a bump
# is a decision, not a routine.
bump-sofakit sha:
    cd vendor/sofakit && git fetch -q origin && git checkout -q {{sha}}
    git add vendor/sofakit
    @echo "pinned vendor/sofakit at {{sha}} — now write the why into VENDOR.md and commit"

# The needle (S2): the ripper service beside the site, its own package.
needle-dev:
    cd needle && npm run dev

needle-test:
    cd needle && npm test

needle-build:
    docker build -t sofa-needle needle

# Deploys (S0 leaves the Vercel project to be linked: `npx vercel link --project sofa`).
# Vercel's build image has no Rust, so the wasm is built here and the finished
# output uploaded. `stage` pins a preview to one URL; `deploy` is prod, on the
# owner's word only.
stage: build-wasm-release
    npm run typecheck
    SK_DSP_WASM=target/wasm-opt/sk_dsp.wasm npx -y vercel build --yes
    url=$(npx -y vercel deploy --prebuilt --yes 2>&1 | grep -Eo 'https://[a-z0-9.-]+\.vercel\.app' | tail -1) && test -n "$url" && npx -y vercel alias set "$url" sofa-staging.vercel.app

deploy: build-wasm-release
    npm run typecheck
    SK_DSP_WASM=target/wasm-opt/sk_dsp.wasm npx -y vercel build --prod --yes
    npx -y vercel deploy --prebuilt --prod --yes
