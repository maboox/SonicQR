# Security and privacy

All message processing is local. The app has no telemetry, server API, account, cloud storage or persistent message/password history. Only the interface language is saved in local storage. Android share files are cached locally; files older than 24 hours are removed on the next share operation. Files explicitly saved by the user remain at the chosen destination.

The v3 packet format is compatible with previous recordings: optional AES-GCM-256, PBKDF2-SHA-256 with 100,000 iterations, random 8-byte salt, random 12-byte IV, raw Deflate when useful, and CRC-16 for accidental transport damage. A strong password matters. The retained work factor and salt size are compatibility choices rather than a new protocol design.

High-frequency embedding is not encryption. The protocol has no sender authentication, replay prevention or password exchange. A recording can be retained, analyzed and replayed.

The Android build requests RECORD_AUDIO only when recording starts. It does not request camera or blanket storage permissions. Files are selected/saved with system pickers; shares grant temporary access only to the selected WAV in the app cache. Recording stops when the app moves to the background.

The Electron renderer is sandboxed with context isolation, no Node integration, a local secure origin and CSP. Permission checks/requests permit audio only from this app. External navigation and popups are blocked. IPC exposes only a bounded WAV save operation and the fixed Windows microphone-settings link.

Input text is bounded to 500 code points/2,000 UTF-8 bytes, acoustic packet length to 2,036 bytes, imported audio to 25 MiB/120 seconds, decompression output to 2,001 bytes, and worker analysis to 45 seconds. Decoder output is inserted as text, never HTML.

Debug APKs are development-signed. Different CI runners can produce different debug signing keys. Use a stable private release keystore for installable upgrades. Windows outputs are not commercially code-signed by default. Do not commit keystores or passwords.

Report security issues privately to the repository owner.
