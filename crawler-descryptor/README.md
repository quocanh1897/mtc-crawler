# crawler-descryptor

Decrypt chapter content from the metruyencv mobile API without needing the Android emulator.

## Status

**Phase 1 — Key extraction not yet complete.** The Frida hook scripts are ready; the decryption library is scaffolded and will work once the AES key and IV extraction method are determined.

## How It Works

The mobile API (`android.lonoapp.net/api/chapters/{id}`) returns chapter content encrypted with AES-CBC in a Laravel envelope. This project:

1. Uses **Frida** to hook the app's cryptographic functions at runtime and extract the AES key + IV derivation method
2. Implements the decryption in Python so chapters can be fetched and decrypted via pure HTTP — no emulator needed for ongoing crawling

## Emulator Isolation

**CRITICAL**: The production crawler runs on emulators `5554` and `5556`. All work in this project uses a **separate third emulator on port `5558`**. Never target `5554` or `5556`.

## Setup

```bash
cd crawler-descryptor
pip install -r requirements.txt
```

### Frida Gadget (one-time APK patching)

Since the emulator isn't rooted, embed Frida gadget into the APK:

1. Download `frida-gadget` for arm64:
   ```bash
   # Check your Frida version first
   frida --version
   # Download matching gadget (replace VERSION)
   curl -LO https://github.com/frida/frida/releases/download/VERSION/frida-gadget-VERSION-android-arm64.so.xz
   unxz frida-gadget-VERSION-android-arm64.so.xz
   ```

2. Inject into the APK:
   ```bash
   cd ../apk/mtc1.4.4
   apktool d aligned_emu.apk -o decoded_frida
   cp frida-gadget-VERSION-android-arm64.so decoded_frida/lib/arm64-v8a/libfrida-gadget.so
   cp ../../crawler-descryptor/frida/gadget-config.json decoded_frida/lib/arm64-v8a/libfrida-gadget.config.so
   ```

3. Add gadget load to the main activity's `smali` (load library in `onCreate`), or
   use the simpler approach: inject via `libflutter.so` dependency.

4. Rebuild + sign:
   ```bash
   apktool b decoded_frida/ -o patched_frida.apk
   ~/Library/Android/sdk/build-tools/34.0.0/zipalign -p 4 patched_frida.apk aligned_frida.apk
   ~/Library/Android/sdk/build-tools/34.0.0/apksigner sign --ks ../debug.keystore --ks-pass pass:android aligned_frida.apk
   ```

5. Install on the **third emulator only**:
   ```bash
   adb -s emulator-5558 install aligned_frida.apk
   ```

### Launch Third Emulator

```bash
# Use the spare AVD (not the ones running the crawler)
~/Library/Android/sdk/emulator/emulator -avd Medium_Phone_2 -port 5558 &
```

## Usage

### Phase 1: Extract the Key

```bash
# Start mitmproxy for the third emulator (different port from crawler's 8083)
mitmdump --listen-port 8085 &

# Launch the app on the third emulator
adb -s emulator-5558 shell am start -n com.novelfever.app.android.debug/com.example.novelfeverx.MainActivity

# Run the BoringSSL hook (captures AES key, IV, plaintext)
frida -D emulator-5558 -n com.novelfever.app.android.debug -l frida/hook_boringssl.js

# In the app: open any chapter → the hook will dump the key and IV
```

Also available:
```bash
# Intercept /api/init to check for dynamic key delivery
frida -D emulator-5558 -n com.novelfever.app.android.debug -l frida/hook_api_init.js

# Explore Dart symbols in libapp.so
frida -D emulator-5558 -n com.novelfever.app.android.debug -l frida/hook_dart_decrypt.js
```

### Collect Sample Pairs (for validation)

```bash
# Needs a book already crawled in crawler/output/
python3 collect_samples.py 102205 --count 5
```

### Phase 2: Decrypt (after key is found)

```bash
# Analyze a chapter's encryption envelope
python3 main.py analyze 23671918

# Decrypt a single chapter
python3 main.py --key <hex_key> fetch-chapter 23671918

# Decrypt an entire book
python3 main.py --key <hex_key> fetch-book 144812

# Test a key against collected samples
python3 main.py test-key <hex_key>

# Or set the key via environment variable
export DECRYPT_KEY=<hex_key>
python3 main.py fetch-book 144812
```

### Output

Chapters are saved to `crawler/output/{book_id}/` in the same format as the existing crawler:
```
crawler/output/{book_id}/
├── 0001_chapter-slug.txt
├── 0002_chapter-slug.txt
├── ...
└── metadata.json
```

This is compatible with `binslib/scripts/import.ts` — no changes needed downstream.

## Project Structure

```
crawler-descryptor/
├── PLAN.md                     # Detailed project plan
├── README.md                   # This file
├── requirements.txt
├── main.py                     # CLI: fetch-chapter, fetch-book, analyze, test-key
├── collect_samples.py          # Collect encrypted/decrypted pairs for testing
├── src/
│   ├── decrypt.py              # AES-CBC decryption + Laravel envelope parsing
│   ├── iv_extract.py           # IV de-obfuscation strategies
│   ├── client.py               # API client (chapter fetching, book lookup)
│   └── utils.py                # Output formatting, file helpers
├── frida/
│   ├── hook_boringssl.js       # Hook EVP_Decrypt* in libflutter.so
│   ├── hook_dart_decrypt.js    # Explore Dart decrypt functions in libapp.so
│   ├── hook_api_init.js        # Intercept /api/init for dynamic key
│   └── gadget-config.json      # Frida gadget embedding config
└── tests/
    ├── test_decrypt.py         # Validation against sample pairs
    └── samples/                # Encrypted + decrypted chapter pairs
```
