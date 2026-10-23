# selfwatch

Open-source, independent companion web client for smartwatches (Noise ColorFit Chrome / Apricot BLE protocol).

## Features
- **Web Bluetooth Connectivity:** Connects directly to the watch from Google Chrome via Web Bluetooth API without any third-party app or cloud dependencies.
- **Custom Wallpaper & Watchface Flashing:** Real-time transfer using the reverse-engineered `ThemeManager` protocol on GATT characteristic `16186f04-0000-1000-8000-00807f9b34fb`.
- **Telemetry & Health Monitoring:** Real-time battery, pedometer steps, and heart-rate telemetry tracking.
- **Watch Controls:** Vibration alerts, find my watch, and time sync commands.

## Architecture & Protocol
- **GATT Service:** `16186f00-0000-1000-8000-00807f9b34fb` (ZHApp / Apricot Protobuf Service)
- **Characteristics:**
  - `16186f01-0000-1000-8000-00807f9b34fb`: Command / Config Channel
  - `16186f02-0000-1000-8000-00807f9b34fb`: Telemetry & Status Channel
  - `16186f03-0000-1000-8000-00807f9b34fb`: Progress / Ack Channel
  - `16186f04-0000-1000-8000-00807f9b34fb`: Theme / Dial Upload Channel
  - `16186f05-0000-1000-8000-00807f9b34fb`: Voice / Audio Channel

## Quick Start
1. Start the local server:
   ```bash
   python3 -m http.server 3000 --directory client
   ```
2. Open `http://localhost:3000` in Google Chrome.
3. Click **Connect via Bluetooth** and select your watch (`Chrome_0DE1`).
4. Click **Flash Wallpaper to Watch** to upload your custom dial.
