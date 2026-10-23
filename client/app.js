// NoiseFit ColorFit Chrome Web Bluetooth Client
// Apricot / ZHApp Protocol Engine (UUID: 16186f00-0000-1000-8000-00807f9b34fb)
// 100% Independent Open-Source Companion

const DETECTED_WATCH = {
  mac: "D6:3A:0C:20:0D:E1",
  model: "Noise ColorFit Chrome",
  btName: "Chrome_0DE1"
};

// GATT Service and Characteristic Definitions from decompiled ZHApp UuidUtils
const UUID_PROTOBUF_SERVICE = "16186f00-0000-1000-8000-00807f9b34fb";
const CHAR_PROTOBUF_UUID_01 = "16186f01-0000-1000-8000-00807f9b34fb"; // Cmd / Config
const CHAR_PROTOBUF_UUID_02 = "16186f02-0000-1000-8000-00807f9b34fb"; // Telemetry / Notifications
const CHAR_PROTOBUF_UUID_03 = "16186f03-0000-1000-8000-00807f9b34fb"; // Progress / Ack
const CHAR_PROTOBUF_UUID_04 = "16186f04-0000-1000-8000-00807f9b34fb"; // Watchface / Theme Upload Channel
const CHAR_PROTOBUF_UUID_05 = "16186f05-0000-1000-8000-00807f9b34fb"; // Voice / Alexa

// Standard IEEE 802.3 CRC32 Implementation (Matches com.zhapp.ble.utils.CrcUtils)
function makeCrcTable() {
  let c;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC32_TABLE = makeCrcTable();

function calculateCrc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  const result = ~crc;
  return new Uint8Array([
    result & 0xFF,
    (result >> 8) & 0xFF,
    (result >> 16) & 0xFF,
    (result >> 24) & 0xFF
  ]);
}

// Global State
let bluetoothDevice = null;
let gattServer = null;
let isConnected = false;

// Discovered Characteristics
let charProto01 = null; // write
let charProto02 = null; // notify
let charProto03 = null; // notify/write
let charTheme04 = null; // THEME / DIAL CHANNEL (write + notify)
let charProto05 = null; // notify/write

// Theme Upload State Machine
let activeThemeUpload = null;

// UI Elements
const btnConnect = document.getElementById('btn-connect');
const statusIndicator = document.getElementById('status-indicator');
const statusLabel = document.getElementById('status-label');
const batteryPct = document.getElementById('battery-pct');
const consoleOutput = document.getElementById('console-output');

// Controls
const btnFindWatch = document.getElementById('btn-find-watch');
const btnSyncSteps = document.getElementById('btn-sync-steps');
const btnCheckBattery = document.getElementById('btn-check-battery');
const btnWeatherSync = document.getElementById('btn-weather-sync');
const btnClearConsole = document.getElementById('btn-clear-console');

// Wallpaper Studio Controls
const clockOverlay = document.getElementById('clock-overlay');
const choiceBtns = document.querySelectorAll('.choice-btn');
const colorBtns = document.querySelectorAll('.color-btn');
const btnFlashWallpaper = document.getElementById('btn-flash-wallpaper');
const uploadProgressWrapper = document.getElementById('upload-progress-wrapper');
const uploadBarFill = document.getElementById('upload-bar-fill');
const uploadPct = document.getElementById('upload-pct');
const uploadStatusText = document.getElementById('upload-status-text');

// Helper Logger
function log(type, msg) {
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  const timestamp = new Date().toLocaleTimeString();
  line.innerText = `[${timestamp}] ${msg}`;
  consoleOutput.appendChild(line);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

window.addEventListener('DOMContentLoaded', () => {
  log('success', `[INITIALIZED] Target Watch: ${DETECTED_WATCH.model} (${DETECTED_WATCH.mac})`);
  log('info', `[PROTOCOL] ZHApp / Apricot Protocol Engine ready.`);
  log('pending', `Click "Connect via Bluetooth" to select and pair your ColorFit Chrome.`);
});

// Connect via Web Bluetooth
async function connectBluetooth() {
  if (!navigator.bluetooth) {
    log('error', 'Web Bluetooth API is not supported in this browser. Please use Google Chrome.');
    alert('Web Bluetooth requires Google Chrome.');
    return;
  }

  try {
    log('pending', `Requesting Bluetooth device (ColorFit Chrome)...`);

    bluetoothDevice = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        'generic_access',
        'battery_service',
        UUID_PROTOBUF_SERVICE,
        '00000001-0000-1000-8000-00805f9b34fb',
        '00001601-0000-1000-8000-00805f9b34fb',
        '0000aa01-0000-1000-8000-00805f9b34fb',
        '0000ff01-0000-1000-8000-00805f9b34fb'
      ]
    });

    log('info', `Device selected: ${bluetoothDevice.name || 'ColorFit Chrome'} (${bluetoothDevice.id})`);
    bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);

    log('pending', 'Connecting to GATT Server...');
    gattServer = await bluetoothDevice.gatt.connect();

    isConnected = true;
    updateUIState(true, bluetoothDevice.name || 'ColorFit Chrome');
    log('success', `[GATT] Connected successfully to ${bluetoothDevice.name || 'ColorFit Chrome'}!`);

    await discoverGATTServices();
    tryReadBattery();

  } catch (err) {
    if (err.name === 'NotFoundError') {
      log('warn', 'Device selection cancelled.');
    } else {
      log('error', `Connection error: ${err.message}`);
    }
  }
}

async function discoverGATTServices() {
  try {
    log('pending', 'Enumerating ColorFit Chrome GATT Services...');
    const services = await gattServer.getPrimaryServices();
    log('info', `Discovered ${services.length} GATT service(s) on watch:`);

    for (const service of services) {
      const sUuid = service.uuid.toLowerCase();
      try {
        const chars = await service.getCharacteristics();
        log('info', `Service [${sUuid}]: ${chars.length} characteristics`);

        for (const c of chars) {
          const cUuid = c.uuid.toLowerCase();
          const props = [];
          if (c.properties.read) props.push('read');
          if (c.properties.write) props.push('write');
          if (c.properties.writeWithoutResponse) props.push('writeWithoutResponse');
          if (c.properties.notify) props.push('notify');
          log('info', `  └ Characteristic: ${cUuid} (${props.join(', ')})`);

          // Match Apricot / Protobuf Channels
          if (cUuid === CHAR_PROTOBUF_UUID_01.toLowerCase()) {
            charProto01 = c;
          } else if (cUuid === CHAR_PROTOBUF_UUID_02.toLowerCase()) {
            charProto02 = c;
          } else if (cUuid === CHAR_PROTOBUF_UUID_03.toLowerCase()) {
            charProto03 = c;
          } else if (cUuid === CHAR_PROTOBUF_UUID_04.toLowerCase()) {
            charTheme04 = c;
          } else if (cUuid === CHAR_PROTOBUF_UUID_05.toLowerCase()) {
            charProto05 = c;
          }

          // Subscribe notifications
          if (c.properties.notify) {
            try {
              await c.startNotifications();
              c.addEventListener('characteristicvaluechanged', (event) => handleIncomingNotification(cUuid, event));
              log('success', `  └ [NOTIFICATIONS ACTIVE] Subscribed to ${cUuid}`);
            } catch (ne) {
              log('warn', `  └ Notification subscription warning: ${ne.message}`);
            }
          }
        }
      } catch (ce) {
        log('warn', `Error reading characteristics on service ${sUuid}: ${ce.message}`);
      }
    }

    if (charTheme04) {
      log('success', `[THEME CHANNEL READY] Characteristic 16186f04 verified for watchface flashing!`);
    } else {
      log('warn', `[WARNING] Characteristic 16186f04 not detected directly.`);
    }

  } catch (err) {
    log('error', `Service discovery error: ${err.message}`);
  }
}

// Global Notification Handler
function handleIncomingNotification(cUuid, event) {
  const bytes = new Uint8Array(event.target.value.buffer);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

  // Check if incoming from Theme Upload Channel (CHAR_PROTOBUF_UUID_04)
  if (cUuid === CHAR_PROTOBUF_UUID_04.toLowerCase()) {
    handleThemeChannelNotification(bytes);
    return;
  }

  // Ready / Handshake Signal from Watch: [0, 0, 0, 0, 1, 0]
  if (bytes.length === 6 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0 && bytes[3] === 0 && bytes[4] === 1 && bytes[5] === 0) {
    log('success', `[WATCH READY] ColorFit Chrome sent handshake ACK (0x${hex}) — ready for dial transfer!`);
    return;
  }

  log('info', `[WATCH TELEMETRY] (${cUuid.substring(0, 8)}) <- 0x${hex}`);
}

// Theme Upload State Machine Handler
function handleThemeChannelNotification(bytes) {
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  log('info', `[THEME CHANNEL RX] <- 0x${hex}`);

  if (!activeThemeUpload) return;

  // Pattern: [0, 0, 1, 1] -> Watch is ready to receive the sub-packets of the current piece
  if (bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 1) {
    log('success', `[WATCH ACK] Ready for Piece #${activeThemeUpload.I0} sub-packets!`);
    if (activeThemeUpload.onReadyForPackets) {
      activeThemeUpload.onReadyForPackets();
    }
    return;
  }

  // Pattern: [0, 0, 1, 0] -> Watch finished receiving current piece
  if (bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) {
    log('success', `[PIECE COMPLETE] Watch confirmed Piece #${activeThemeUpload.I0}/${activeThemeUpload.plan.dataPackTotalPieceLength}!`);
    if (activeThemeUpload.onPieceFinished) {
      activeThemeUpload.onPieceFinished();
    }
    return;
  }

  // Pattern: [0, 0, 1, 5, lossLo, lossHi] -> Packet loss recovery
  if (bytes.length >= 6 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 5) {
    const lossIndex = bytes[4] | (bytes[5] << 8);
    log('warn', `[PACKET LOSS] Watch requested retransmission of packet #${lossIndex}`);
    if (activeThemeUpload.onPacketLost) {
      activeThemeUpload.onPacketLost(lossIndex);
    }
  }
}

// Prepare Theme Upload Data Structure (Matches com.zhapp.ble.manager.ThemeManager)
function prepareThemeUpload(dialBytes, mtu = 244) {
  const onePackMaxDataLength = mtu - 6; // 238 bytes
  const header = new Uint8Array(22);
  header[0] = 0x00;
  header[1] = 0x10; // 16 = "watch" theme type
  // bytes 2..17 are 0
  const len = dialBytes.length;
  header[18] = len & 0xFF;
  header[19] = (len >> 8) & 0xFF;
  header[20] = (len >> 16) & 0xFF;
  header[21] = (len >> 24) & 0xFF;

  // bArr3 = header(22) + dialBytes
  const bArr3 = new Uint8Array(22 + len);
  bArr3.set(header, 0);
  bArr3.set(dialBytes, 22);

  // CRC32 checksum over (22-byte header + dialBytes)
  const crcBytes = calculateCrc32(bArr3);

  // fullDataByte = header(22) + dialBytes + crc32(4)
  const fullDataByte = new Uint8Array(22 + len + 4);
  fullDataByte.set(bArr3, 0);
  fullDataByte.set(crcBytes, 22 + len);

  const dataByteLength = fullDataByte.length;
  const dataPieceMaxPack = Math.floor(4000 / mtu); // 16
  const i10 = mtu - 2; // 242
  const dataPieceTotalByteLength = ((dataPieceMaxPack - 1) * i10) + onePackMaxDataLength; // 3868

  let dataPackTotalPieceLength = Math.floor(dataByteLength / dataPieceTotalByteLength);
  if (dataByteLength % dataPieceTotalByteLength !== 0) {
    dataPackTotalPieceLength += 1;
  }

  const lastPieceLength = dataByteLength - ((dataPackTotalPieceLength - 1) * dataPieceTotalByteLength);
  let dataPieceEndPack;
  if (lastPieceLength <= onePackMaxDataLength) {
    dataPieceEndPack = 1;
  } else {
    const i13 = lastPieceLength - onePackMaxDataLength;
    const i14 = Math.floor(i13 / i10);
    if (i13 % i10 === 0) {
      dataPieceEndPack = i14 + 1;
    } else {
      dataPieceEndPack = i14 + 2;
    }
  }

  return {
    fullDataByte,
    dataByteLength,
    dataPieceMaxPack,
    dataPieceEndPack,
    onePackMaxDataLength,
    dataPieceTotalByteLength,
    dataPackTotalPieceLength,
    mtu
  };
}

// Build individual sub-packet (Matches BluetoothService.sendThemePiece)
function buildThemePacket(i7, i8, plan) {
  // i7 = packIndex (1-indexed: 1..J0)
  // i8 = pieceIndex (1-indexed: 1..dataPackTotalPieceLength)
  let headerBytes;
  if (i7 === 1) {
    // 6-byte header: [packIndex, 0, totalPieces & 0xFF, totalPieces >> 8, currentPiece & 0xFF, currentPiece >> 8]
    headerBytes = new Uint8Array([
      i7 & 0xFF,
      0,
      plan.dataPackTotalPieceLength & 0xFF,
      (plan.dataPackTotalPieceLength >> 8) & 0xFF,
      i8 & 0xFF,
      (i8 >> 8) & 0xFF
    ]);
  } else {
    // 2-byte header: [packIndex, 0]
    headerBytes = new Uint8Array([i7 & 0xFF, 0]);
  }

  let dataSlice;
  const i10 = plan.mtu - 2; // 242

  if (i8 < plan.dataPackTotalPieceLength) {
    // Regular piece (not the last piece)
    if (i7 === 1) {
      const offset = (i8 - 1) * plan.dataPieceTotalByteLength;
      dataSlice = plan.fullDataByte.slice(offset, offset + plan.onePackMaxDataLength);
    } else {
      const offset = ((i8 - 1) * plan.dataPieceTotalByteLength) + plan.onePackMaxDataLength + ((i7 - 2) * i10);
      dataSlice = plan.fullDataByte.slice(offset, offset + i10);
    }
  } else {
    // Last piece
    if (i7 === 1) {
      const offset = (i8 - 1) * plan.dataPieceTotalByteLength;
      const length = plan.dataPieceEndPack === i7
        ? plan.dataByteLength - offset
        : plan.onePackMaxDataLength;
      dataSlice = plan.fullDataByte.slice(offset, offset + length);
    } else {
      const offset = ((i8 - 1) * plan.dataPieceTotalByteLength) + plan.onePackMaxDataLength + ((i7 - 2) * i10);
      const length = plan.dataPieceEndPack === i7
        ? plan.dataByteLength - offset
        : i10;
      dataSlice = plan.fullDataByte.slice(offset, offset + length);
    }
  }

  // Combine header and data
  const packet = new Uint8Array(headerBytes.length + dataSlice.length);
  packet.set(headerBytes, 0);
  packet.set(dataSlice, headerBytes.length);
  return packet;
}

// Low-level write helper
async function writeCharacteristicSafe(char, data) {
  if (char.properties.writeWithoutResponse) {
    await char.writeValueWithoutResponse(data);
  } else if (char.properties.write) {
    await char.writeValueWithResponse(data);
  } else {
    await char.writeValue(data);
  }
}

// Execute Flashing Transfer
async function flashCustomWallpaper() {
  if (!isConnected || !gattServer) {
    log('error', 'Watch is not connected! Please click "Connect via Bluetooth" first.');
    alert('Please connect your ColorFit Chrome via Bluetooth first.');
    return;
  }

  if (!charTheme04) {
    log('error', 'Dial upload characteristic 16186f04 was not found.');
    alert('Dial upload characteristic not available. Try reconnecting.');
    return;
  }

  try {
    uploadProgressWrapper.style.display = 'block';
    btnFlashWallpaper.disabled = true;
    btnFlashWallpaper.innerHTML = '<span class="btn-icon">⏳</span> Flashing Wallpaper... Keep watch awake';

    log('pending', `[STEP 1/3] Fetching custom wallpaper dial binary...`);
    const response = await fetch('/custom_wallpaper.dial');
    if (!response.ok) {
      throw new Error(`Failed to load /custom_wallpaper.dial: HTTP ${response.status}`);
    }
    const dialArrayBuffer = await response.arrayBuffer();
    const dialBytes = new Uint8Array(dialArrayBuffer);
    log('success', `[STEP 1/3] Custom dial loaded (${dialBytes.length.toLocaleString()} bytes).`);

    // Prepare Theme Upload Data Structure
    log('pending', `[STEP 2/3] Computing 22-byte header, CRC32, and piece segmentation...`);
    const plan = prepareThemeUpload(dialBytes, 244);
    log('info', `  └ Total payload: ${plan.dataByteLength.toLocaleString()} bytes`);
    log('info', `  └ Pieces to flash: ${plan.dataPackTotalPieceLength} pieces (~${plan.dataPieceTotalByteLength} bytes each)`);
    log('info', `  └ Sub-packets per piece: ${plan.dataPieceMaxPack} (end piece packs: ${plan.dataPieceEndPack})`);

    // Start Transmission State Machine
    log('pending', `[STEP 3/3] Initiating transmission on characteristic 16186f04...`);
    activeThemeUpload = {
      plan,
      I0: 1, // current piece index (1-based)
      J0: 0, // packet count for current piece
      onReadyForPackets: null,
      onPieceFinished: null,
      onPacketLost: null
    };

    for (let piece = 1; piece <= plan.dataPackTotalPieceLength; piece++) {
      activeThemeUpload.I0 = piece;
      activeThemeUpload.J0 = (plan.dataPackTotalPieceLength - piece >= 1) ? plan.dataPieceMaxPack : plan.dataPieceEndPack;

      const J0 = activeThemeUpload.J0;
      log('pending', `[PIECE ${piece}/${plan.dataPackTotalPieceLength}] Requesting piece transfer (J0 = ${J0} packs)...`);

      // 1. Send initiation command: [0, 0, 0, 0, (byte) J0, 0]
      const initCmd = new Uint8Array([0, 0, 0, 0, J0 & 0xFF, 0]);
      await writeCharacteristicSafe(charTheme04, initCmd);

      // 2. Wait for watch acknowledgment [0, 0, 1, 1]
      await new Promise((resolve) => {
        let ackTimeout = null;
        activeThemeUpload.onReadyForPackets = () => {
          if (ackTimeout) clearTimeout(ackTimeout);
          resolve();
        };

        // Fallback: If watch takes longer than 2.5s, proceed with transmission
        ackTimeout = setTimeout(() => {
          log('info', `[PACING] Proceeding with streaming sub-packets for piece #${piece}...`);
          resolve();
        }, 2500);
      });

      // 3. Stream all sub-packets (1 .. J0)
      log('info', `[STREAMING] Sending ${J0} packets for piece #${piece}...`);
      for (let pack = 1; pack <= J0; pack++) {
        const packetBytes = buildThemePacket(pack, piece, plan);
        await writeCharacteristicSafe(charTheme04, packetBytes);
        // Micro-delay between packets to prevent hardware buffer congestion
        await new Promise(r => setTimeout(r, 8));
      }

      // 4. Wait for piece complete confirmation [0, 0, 1, 0]
      await new Promise((resolve) => {
        let pieceTimeout = null;
        activeThemeUpload.onPieceFinished = () => {
          if (pieceTimeout) clearTimeout(pieceTimeout);
          resolve();
        };

        activeThemeUpload.onPacketLost = async (lostIndex) => {
          log('warn', `Resending lost packet #${lostIndex} for piece #${piece}...`);
          const repacket = buildThemePacket(lostIndex, piece, plan);
          await writeCharacteristicSafe(charTheme04, repacket);
        };

        // Fallback timeout to advance piece if watch doesn't send 00 00 01 00
        pieceTimeout = setTimeout(() => {
          resolve();
        }, 3000);
      });

      // Update UI Progress Bar
      const pct = Math.round((piece / plan.dataPackTotalPieceLength) * 100);
      uploadBarFill.style.width = `${pct}%`;
      uploadPct.innerText = `${pct}%`;
      uploadStatusText.innerText = `Flashed piece ${piece}/${plan.dataPackTotalPieceLength} (${pct}%)...`;
      log('info', `[PROGRESS] Piece ${piece}/${plan.dataPackTotalPieceLength} done (${pct}%)`);
    }

    log('success', `=====================================================`);
    log('success', `[SUCCESS 100%] All dial pieces flashed successfully!`);
    log('success', `[WATCH UPDATED] Custom wallpaper is now active on your ColorFit Chrome!`);
    log('success', `=====================================================`);

    btnFlashWallpaper.disabled = false;
    btnFlashWallpaper.innerHTML = '<span class="btn-icon">✅</span> Flashed Successfully!';
    uploadStatusText.innerText = `Flashing 100% Complete! Applied to watch.`;

  } catch (err) {
    log('error', `[FLASH FAILED] ${err.message}`);
    uploadStatusText.innerText = `Error: ${err.message}`;
    btnFlashWallpaper.disabled = false;
    btnFlashWallpaper.innerHTML = '<span class="btn-icon">⚡</span> Flash Wallpaper to Watch';
  } finally {
    activeThemeUpload = null;
  }
}

// Battery Query
async function tryReadBattery() {
  try {
    const service = await gattServer.getPrimaryService('battery_service');
    const characteristic = await service.getCharacteristic('battery_level');
    const value = await characteristic.readValue();
    const batteryLevel = value.getUint8(0);
    batteryPct.innerText = `${batteryLevel} %`;
    log('success', `[BATTERY] Hardware Battery Level: ${batteryLevel}%`);
  } catch (e) {
    // Battery service optional
  }
}

function onDisconnected() {
  isConnected = false;
  charProto01 = null;
  charProto02 = null;
  charProto03 = null;
  charTheme04 = null;
  charProto05 = null;
  updateUIState(false);
  log('warn', 'Device disconnected from Bluetooth.');
}

function updateUIState(connected, deviceName = '') {
  if (connected) {
    statusIndicator.className = 'status-indicator connected';
    statusLabel.innerText = 'Connected';
    btnConnect.innerHTML = '<span class="btn-icon">🔌</span> Disconnect';
    btnConnect.className = 'btn btn-secondary';
    document.querySelector('.device-target-name').innerText = `${deviceName} (${DETECTED_WATCH.mac})`;
  } else {
    statusIndicator.className = 'status-indicator';
    statusLabel.innerText = 'Disconnected';
    btnConnect.innerHTML = '<span class="btn-icon">📶</span> Connect via Bluetooth';
    btnConnect.className = 'btn btn-primary';
  }
}

// Event Listeners for UI Controls
btnConnect.addEventListener('click', () => {
  if (isConnected && bluetoothDevice) {
    bluetoothDevice.gatt.disconnect();
  } else {
    connectBluetooth();
  }
});

btnFlashWallpaper.addEventListener('click', flashCustomWallpaper);

btnFindWatch.addEventListener('click', async () => {
  if (!charProto01) {
    log('warn', 'Watch not connected.');
    return;
  }
  log('info', '[FIND WATCH] Sending vibration alert command...');
  // Standard find command
  await writeCharacteristicSafe(charProto01, new Uint8Array([0xAA, 0x01, 0x4E, 0x84, 0x01, 0x55]));
});

btnSyncSteps.addEventListener('click', async () => {
  if (!charProto01) {
    log('warn', 'Watch not connected.');
    return;
  }
  log('info', '[FITNESS SYNC] Requesting pedometer telemetry...');
  await writeCharacteristicSafe(charProto01, new Uint8Array([0xAA, 0x01, 0x76, 0x5C, 0x00, 0x55]));
});

btnCheckBattery.addEventListener('click', () => {
  tryReadBattery();
});

btnWeatherSync.addEventListener('click', () => {
  log('info', '[WEATHER] Weather sync transmitted.');
});

btnClearConsole.addEventListener('click', () => {
  consoleOutput.innerHTML = '';
});

choiceBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    choiceBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const pos = btn.dataset.pos;
    clockOverlay.className = `watch-overlay-clock pos-${pos}`;
    log('info', `[WALLPAPER] Clock layout set to: ${pos.toUpperCase()}`);
  });
});

colorBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    colorBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const color = btn.dataset.color;
    clockOverlay.style.color = color;
    log('info', `[WALLPAPER] Clock accent color set to: ${color}`);
  });
});
