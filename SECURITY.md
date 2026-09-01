# Security

Agent Browser is a desktop Electron app. The Chromium session is in-memory, and API keys / agent-bridge tokens are generated or typed at runtime — they must never be committed or pasted into issues.

## Report a vulnerability

Use **GitHub Security Advisories** (Private vulnerability reporting) on this repository. Do not open a public issue for:

- Remote code execution, sandbox escapes, or preload/IPC bypasses
- Session, cookie, or token leaks to disk or to the network
- Agent control-plane or CDP listeners binding beyond loopback
- Secret scanning false negatives in this repo or packaged builds

Include the affected version or commit, steps to reproduce, and impact. We will acknowledge privately and coordinate a fix before any public write-up.

## What is intentional

- The multi-agent bridge and CDP debug port bind **`127.0.0.1` only**. Non-loopback clients are rejected.
- Bridge auth is a per-process token (never written to disk).
- Ghost Network, Media Hunter, and the rest of the session catalog are opt-in and live in RAM.
- Excommunicado (`Ctrl+Shift+E`) wipes the in-memory session and quits. Files already saved to disk may remain.

## What not to send

Do not include live API keys, session tokens, or recordings of other people’s accounts in a report.
