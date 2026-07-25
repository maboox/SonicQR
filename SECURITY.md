# Security Policy

Audio QR can optionally encrypt message payloads with AES-GCM. A key is derived from the user password with PBKDF2-SHA-256 and a random salt.

## Important limitations

- Low-audibility audio is steganographic transport, not encryption.
- Anyone who records the signal can retain or replay it.
- Use a strong password for sensitive payloads.
- The current application does not authenticate the sender or prevent replay attacks.
- EXE and debug APK artifacts produced by the default workflow are unsigned development builds.

Please report security issues privately to the repository owner rather than opening a public issue.
