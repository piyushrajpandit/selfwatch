# NoiseFit / ColorFit Chrome Reverse-Engineered Protocol Specification

## Target Device
* **Product:** Noise ColorFit Chrome
* **Firmware Version:** V1.2.6
* **Companion App:** NoiseFit v5.4.5 (Build 872)
* **Architecture:** Bluetooth 5.3 Low Energy (Single-Chip BLE + BT Classic Audio)
* **Core Protocol Provider:** QCTeam Wear Protocol (`com.qcteam.protocol`) + Noise Wear Protocol (`com.noise.wear`)

---

## 1. Architecture Overview

Communication between the smartphone and the ColorFit Chrome happens over BLE GATT:
* **MTU Size:** Negotiated up to `247` bytes.
* **Payload Max Size:** `16384` bytes (`pbPayload`).
* **Framing & Serialization:** Two layers:
  1. High-level structured commands and time-series data use **Google Protobuf** (`com.noise.wear.protocol.protobuf.entity.*`).
  2. Runtime events and message dispatches use **QCTeam RTT Message Intents** (`MsgIntentEnum`).

---

## 2. Message Intent Opcode Map (`MsgIntentEnum`)

| Command / Event | Opcode | Description |
| :--- | :--- | :--- |
| **`SPORT_STATE_CHANGE_SET`** | `10100` | Start / pause / stop sport mode on watch |
| **`SPORT_REAL_TIME_DATA`** | `10104` | Live sport streaming metrics |
| **`SPORT_DATA_SYNC`** | `10107` | Sync historical sport activity logs |
| **`SETTING_FIND_WEAR`** | `20100` | Ring / vibrate watch from phone |
| **`SETTING_FIND_PHONE`** | `20200` | Watch triggers phone alert |
| **`SETTING_BATTERY`** | `20300` | Query watch battery level and charging status |
| **`SETTING_RESET_FACTORY`** | `20400` | Factory reset command |
| **`WEATHER_REQUEST`** | `20800` | Push current weather forecast to watch |
| **`SETTING_INCOMING_CALL_OPERATION`**| `20901` | Answer / mute / reject incoming phone call |
| **`SETTING_CAMERA_TAKE`** | `21001` | Remote shutter trigger from watch |
| **`MUSIC_PHONE_CONTROL`** | `21201` | Play / Pause / Next / Prev track from watch |
| **`MUSIC_DEVICE_CONTROL`** | `21202` | Push track title / artist metadata to watch |
| **`FITNESS_SLEEP_REFRESH`** | `30100` | Sync sleep stage logs (Deep, Light, REM, Awake) |
| **`FITNESS_DATA_SYNC`** | `30300` | Daily step count, calories, distance sync |
| **`HEART_RATE_REALTIME_HEART`** | `30500` | Live heart rate monitor stream |
| **`FITNESS_MEASURE_BLOOD_OXYGEN`**| `30701` | SpO2 (Blood oxygen) real-time reading |
| **`WATCH_FACE_CHANGE`** | `40100` | Set active watch face ID |
| **`WATCH_FACE_IMAGE_TRANSFER`** | `40101` | Upload custom watch face image binary |

---

## 3. Protobuf Entities (`com.noise.wear.protocol.protobuf.entity`)

* **`NPBCommand.java`**: High-level command envelope and sequence numbering.
* **`NPBDevice.java`**: Hardware features, firmware version queries, battery state, display settings.
* **`NPBFitness.java`**: Health telemetry: Steps, Calories, Distance, Sleep intervals, Heart Rate, SpO2, Stress.
* **`NPBProperty.java`**: Device configuration (vibration intensity, DND schedules, wrist raise wake, alarms).
* **`NPBTime.java`**: Epoch synchronization and timezone configuration.

---

## 4. Next Step: Live BLE Script

We can now write a direct Node.js or Python BLE script to:
1. Scan for `ColorFit Chrome` advertising packets.
2. Connect and authenticate with the watch.
3. Send `SETTING_BATTERY (20300)` and `FITNESS_DATA_SYNC (30300)` to read live stats directly on your laptop!
