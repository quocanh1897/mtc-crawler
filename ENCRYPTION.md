# MTC Chapter Content Encryption

## Status: SOLVED

The mobile API encryption has been fully reverse-engineered. See `crawler-descryptor/README.md` for the complete decryption algorithm and usage.

**TL;DR**: The AES-128 key is embedded in every API response at character positions [17:33]. No external key or runtime extraction is needed.

---

## Mobile API — Encryption Scheme (Solved)

The `/api/chapters/{id}` endpoint returns a `content` field that is a **modified base64 string** with the encryption key injected inline.

### Decryption steps

1. **Extract key**: `key = content[17:33]` — 16 ASCII characters, used as AES-128 key bytes
2. **Clean content**: `clean = content.replace(key, "", 1)` — remove key chars to get valid base64
3. **Decode envelope**: `base64 → UTF-8 → JSON` gives `{"iv": "<b64>", "value": "<b64>", "mac": "<hex>"}`
4. **Decode fields**: `iv = base64_decode(envelope.iv)`, `ciphertext = base64_decode(envelope.value)`
5. **Decrypt**: AES-128-CBC with PKCS7 unpadding → UTF-8 plaintext

### Key properties

- Key changes with every API request (server generates a new random key each time)
- Key is transported inside the content itself — no shared secret
- IV in the clean envelope is standard base64 (no obfuscation)
- The "corrupted IV" seen earlier was an artifact of decoding the content without removing the key chars first

### Discovery method

Reverse-engineered via **blutter** (Dart AOT decompiler) analysis of `_getChapterDetailsEncrypt` in `novelfever/utils/api_client.dart`. The ARM64 assembly showed:

```
content.substring(17, 33)           → extract key chars
content.replaceAll(keyChars, "")    → clean base64
base64.decode → utf8.decode → json  → envelope
Uint8List.fromList(keyChars.codeUnits) → key bytes
AesCrypt.aesSetKeys(key, iv)        → AES-128-CBC
AesCrypt.aesDecrypt(ciphertext)     → plaintext
```

The `aes_crypt_null_safe` Dart package is used for the cryptographic operations.

---

## Web Frontend Encryption (Historical)

### Key: `aa4uCch7CR8KiBdQ`

- 16 bytes = AES-128-CBC
- Used as BOTH key and IV: `CryptoJS.AES.decrypt(cipherParams, Utf8.parse(key), {iv: Utf8.parse(key), mode: CBC, padding: Pkcs7})`
- Web content format: plain base64(ciphertext) — NO JSON envelope
- Web API (`api.lonoapp.net`) returned 404 for chapters since ~2026-02-10 (site shut down)
- The web key does NOT decrypt mobile API content

---

## Previous Investigation (Historical)

### Key candidates from libapp.so (all failed)

- `5eeefca380d02919dc2c6558bb6d8a5d`
- `D1514C98ABD0E809A47D6E13F2321E26`
- `d6031998d1b3bbfebf59cc9bbff9aee1`
- `e87579c11079f43dd824993c2cee5ed3`
- Also tried: DEX strings, SharedPreferences, API responses, SHA/MD5 derivations

These all failed because the key is **not static** — it is generated per-request by the server and embedded in the content string.

### App binary details

- Dart 3.5.0 (stable), arm64, Flutter AOT
- Package: `package:novelfever/`
- Crypto library: `aes_crypt_null_safe` (not `crypto_x` as initially assumed)
- Key functions: `_getChapterDetailsEncrypt`, `encryptData` in `utils/api_client.dart`
