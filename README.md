# Audio QR

**Audio QR** is an offline, bilingual web application that encodes short text messages into sound and decodes them again through an audio file or microphone recording. It can be used as a secondary channel when a camera, printed QR code, NFC, Bluetooth, or network connection is unavailable.

The interface supports **English and Persian (فارسی)** and can be packaged as a Windows application or Android application.

> Audio QR is an experimental acoustic data transport, not a replacement for conventional QR codes in every environment.

## Features

- Fully local processing; message and audio stay on the device
- English and Persian interface with automatic language detection
- UTF-8 text support, including Persian and emoji
- Two transmission profiles:
  - **Fast & audible:** short and robust 16-FSK signal
  - **Low-audibility over voice:** high-frequency signal mixed into speech or music
- Record a cover voice for exactly the required duration
- Select an existing voice or music file as cover audio
- Automatic mixing and downloadable mixed WAV output
- Play and download standalone signal WAV files
- Decode from WAV, MP3, M4A, WebM, or a live microphone recording
- Automatic profile detection
- Optional AES-GCM message encryption
- PBKDF2-SHA-256 password-based key derivation with a random salt
- Deflate compression when it makes the payload smaller
- CRC-16 integrity checking
- Responsive desktop and mobile UI
- GitHub Actions for Windows EXE and Android APK artifacts

## How it works

Audio QR serializes a packet containing a protocol header, profile identifier, flags, payload length, payload, and CRC-16 checksum. Each byte is split into two 4-bit symbols and transmitted using 16-FSK.

### Fast profile

The audible profile uses frequencies between approximately 1 kHz and 7 kHz. It is intended for reliable playback through ordinary speakers and capture through ordinary microphones.

### Low-audibility profile

The low-audibility profile uses frequencies near the upper end of the audible range. The signal can be mixed into a normal voice or music recording at one of three strength levels:

- **Subtle:** least noticeable, more sensitive to devices and compression
- **Balanced:** recommended default
- **Robust:** more reliable but potentially more noticeable

The decoder searches for both profiles automatically.

## Security model

Low-audibility audio is **not encryption**. A person or device that records the audio may preserve, analyze, or replay the embedded signal.

For sensitive messages, set a password. The application then:

1. Compresses the message when compression reduces its size.
2. Generates a random salt and IV.
3. Derives a 256-bit key with PBKDF2-SHA-256 and 100,000 iterations.
4. Encrypts the payload with AES-GCM.
5. Adds CRC-16 to detect transmission damage.

Current limitations:

- No sender authentication
- No replay protection
- No key exchange protocol
- Password strength depends on the user
- Generated EXE and debug APK files are unsigned by default

## Browser usage

The simplest method is to serve the project locally:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

Microphone access generally requires `localhost`, HTTPS, or an installed application. Opening `index.html` directly may restrict microphone permissions in some browsers.

## Development

Requirements:

- Node.js 24 or newer
- npm

Install dependencies:

```bash
npm install
```

Prepare the web assets:

```bash
npm run web
```

Run the Electron desktop application:

```bash
npm start
```

## Build Windows EXE locally

On Windows:

```bash
npm install
npm run dist:win
```

The installer is written to `dist/`.

The default build is not code-signed. Windows SmartScreen may display a warning until a trusted code-signing certificate is configured.

## Build Android APK locally

Requirements:

- Android Studio or Android SDK
- Java 21
- Android build tools

Create and synchronize the Capacitor Android project:

```bash
npm install
npm run web
npx cap add android
npx cap sync android
```

Build a debug APK:

```bash
cd android
./gradlew assembleDebug
```

Output:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

On Windows, run `gradlew.bat assembleDebug` instead.

## GitHub Actions

The workflow is located at:

```text
.github/workflows/build.yml
```

It starts when:

- A tag matching `v*` is pushed, for example `v1.0.0`
- It is started manually from the **Actions** tab with `workflow_dispatch`

It creates two downloadable workflow artifacts:

- `audio-qr-windows` containing the Windows installer EXE
- `audio-qr-android` containing the Android debug APK

Example release build:

```bash
git tag v1.0.0
git push origin v1.0.0
```

After the workflow finishes, open the workflow run and download the artifacts from the **Artifacts** section.

### Production signing

The included workflow creates unsigned/development artifacts. For public releases:

- Configure Windows code signing in electron-builder using encrypted GitHub secrets.
- Configure an Android release keystore and build a signed release APK or AAB.
- Never commit certificates, keystores, or passwords to the repository.

## Recommended audio practices

- Prefer WAV for maximum reliability.
- Avoid repeated MP3 conversion.
- Messaging applications may remove high frequencies or apply aggressive noise reduction.
- Use moderate speaker volume and keep the microphone reasonably close.
- For the low-audibility profile, test on the exact target devices.
- Select **Robust** strength when reliability is more important than subtlety.
- Use the original mixed WAV when possible.

## Project structure

```text
.
├── index.html                  # Bilingual Audio QR application
├── main.cjs                    # Electron desktop entry point
├── capacitor.config.json       # Android/Capacitor configuration
├── package.json                # Scripts and build configuration
├── scripts/
│   └── build-web.cjs           # Prepares the www directory
├── .github/workflows/
│   └── build.yml               # EXE and APK builds
├── SECURITY.md
├── LICENSE
└── README.md
```

## Privacy

The application performs encoding, decoding, recording, encryption, and audio mixing locally. It does not include analytics, advertising, or a network API.

## Compatibility

Recommended:

- Recent Chromium, Chrome, Edge, or Android WebView
- Electron build provided by this repository
- A device capable of 48 kHz audio playback and recording

High-frequency performance varies significantly between speakers and microphones.

## License

MIT License. See `LICENSE`.

---

# راهنمای فارسی

**Audio QR یا QR صوتی** یک برنامه آفلاین و دوزبانه برای تبدیل پیام‌های متنی کوتاه به صدا و استخراج دوباره آن‌ها از فایل صوتی یا میکروفون است. این روش می‌تواند وقتی دوربین، QR چاپی، NFC، بلوتوث یا اینترنت در دسترس نیست، به‌عنوان یک کانال ثانویه استفاده شود.

## امکانات

- پردازش کاملاً محلی و بدون ارسال پیام یا صدا به سرور
- رابط فارسی و انگلیسی
- پشتیبانی از متن UTF-8، فارسی و ایموجی
- حالت سریع و شنیداری با سیگنال کوتاه 16-FSK
- حالت کم‌شنیدار با امکان قرار دادن پیام روی وویس یا آهنگ
- ضبط خودکار صدای پوششی به‌اندازه زمان موردنیاز
- انتخاب فایل صوتی موجود به‌عنوان صدای پوششی
- ترکیب خودکار و دانلود فایل WAV نهایی
- پخش و دانلود سیگنال مستقل
- رمزگشایی از فایل صوتی یا ضبط مستقیم میکروفون
- تشخیص خودکار نوع سیگنال
- رمزنگاری اختیاری AES-GCM
- استخراج کلید با PBKDF2-SHA-256 و salt تصادفی
- فشرده‌سازی پیام در صورت کوتاه‌ترشدن خروجی
- کنترل سلامت پیام با CRC-16
- رابط واکنش‌گرا برای موبایل و دسکتاپ
- اکشن گیت‌هاب برای ساخت EXE ویندوز و APK اندروید

## حالت‌های انتقال

### سریع و شنیداری

این حالت از فرکانس‌های حدود ۱ تا ۷ کیلوهرتز استفاده می‌کند و برای انتقال مقاوم‌تر از طریق بلندگو و میکروفون معمولی طراحی شده است.

### کم‌شنیدار روی وویس

در این حالت پیام در فرکانس‌های بالاتر قرار می‌گیرد و با یک وویس یا آهنگ ترکیب می‌شود. سه سطح قدرت وجود دارد:

- **ظریف:** کمتر قابل‌شنیدن ولی حساس‌تر به فشرده‌سازی و کیفیت دستگاه
- **متعادل:** حالت پیشنهادی
- **قوی:** رمزگشایی مطمئن‌تر ولی احتمال شنیده‌شدن بیشتر

## نکته امنیتی مهم

کم‌شنیدار یا پنهان‌بودن سیگنال به معنی رمزنگاری نیست. هر دستگاهی که صدا را ضبط کند ممکن است آن را ذخیره، تحلیل یا دوباره پخش کند.

برای اطلاعات حساس حتماً رمز تعیین کنید. در این حالت payload با AES-GCM رمز می‌شود. این نسخه هنوز احراز هویت فرستنده و جلوگیری از Replay Attack ندارد.

## اجرای نسخه مرورگر

```bash
python3 -m http.server 8080
```

سپس آدرس زیر را باز کنید:

```text
http://localhost:8080
```

برای دسترسی میکروفون بهتر است برنامه از localhost، HTTPS یا نسخه نصب‌شده اجرا شود.

## ساخت EXE و APK با GitHub Actions

فایل workflow در مسیر زیر قرار دارد:

```text
.github/workflows/build.yml
```

برای اجرای دستی، وارد تب **Actions** مخزن شوید و workflow را اجرا کنید. همچنین با ساخت tag نیز بیلد شروع می‌شود:

```bash
git tag v1.0.0
git push origin v1.0.0
```

پس از پایان workflow دو Artifact در دسترس خواهد بود:

- `audio-qr-windows`: نصب‌کننده EXE ویندوز
- `audio-qr-android`: فایل APK آزمایشی اندروید

این خروجی‌ها به‌صورت پیش‌فرض امضای انتشار ندارند. برای انتشار عمومی باید Windows Code Signing و Android Release Keystore را جداگانه تنظیم کنید.

## توصیه‌های صوتی

- برای دقت بیشتر از WAV استفاده کنید.
- تبدیل چندباره به MP3 ممکن است اطلاعات فرکانس بالا را حذف کند.
- بعضی پیام‌رسان‌ها، حذف نویز یا فشرده‌سازی شدیدی اعمال می‌کنند.
- حالت کم‌شنیدار را حتماً روی دستگاه‌های مقصد آزمایش کنید.
- اگر رمزگشایی سخت است، قدرت سیگنال را روی «قوی» قرار دهید.

## مجوز

این پروژه با مجوز MIT منتشر شده است.
