import asyncio
import os
import zlib
from bleak import BleakClient, BleakScanner

TARGET_MAC = "D6:3A:0C:20:0D:E1"
DIAL_FILE = "/Users/piyushraj/.gemini/antigravity-ide/scratch/noisefit-custom/scripts/custom_wallpaper.dial"

async def push_dial_to_watch():
    print("=" * 60)
    print(f" 🚀 Pushing Custom Dial to Noise ColorFit Chrome ({TARGET_MAC})")
    print("=" * 60)

    if not os.path.exists(DIAL_FILE):
        print(f"Error: {DIAL_FILE} not found. Run dial_builder.py first!")
        return

    file_bytes = open(DIAL_FILE, "rb").read()
    file_crc = zlib.crc32(file_bytes) & 0xffffffff
    file_size = len(file_bytes)
    print(f"[*] Package Size: {file_size} bytes | CRC32: 0x{file_crc:08X}")

    print("\n[*] Scanning for watch...")
    device = await BleakScanner.find_device_by_filter(
        lambda d, adv: (d.name and ("chrome" in d.name.lower() or "colorfit" in d.name.lower())) or d.address.upper() == TARGET_MAC,
        timeout=10.0
    )

    if not device:
        print(f"❌ Watch ({TARGET_MAC}) not found in range.")
        print("Tip: Keep watch close, screen awake, and disconnected from phone.")
        return

    print(f"[*] Connecting to {device.name} ({device.address})...")
    async with BleakClient(device.address) as client:
        print("[✅] Connected over BLE!")

        # Find Nordic UART / QCTeam write characteristic
        write_char = None
        notify_char = None

        for service in client.services:
            for char in service.characteristics:
                if "write" in char.properties or "write-without-response" in char.properties:
                    write_char = char
                if "notify" in char.properties:
                    notify_char = char

        if not write_char:
            print("[-] No writable GATT characteristic found.")
            return

        print(f"[*] Using Write Characteristic: {write_char.uuid}")

        # Start notifications if available
        if notify_char:
            def notification_handler(sender, data):
                print(f"[RECV] <- {data.hex()}")
            try:
                await client.start_notify(notify_char.uuid, notification_handler)
                print(f"[*] Subscribed to notifications on {notify_char.uuid}")
            except Exception as e:
                print(f"[*] Notification subscribe warning: {e}")

        # Send File Push Header
        header = f"PUSH_DIAL:{file_size}:{file_crc}\n".encode()
        await client.write_gatt_char(write_char.uuid, header)
        print("[*] Handshake header sent. Streaming file blocks...")

        # Stream file in 240-byte MTU chunks
        chunk_size = 240
        total_chunks = (file_size + chunk_size - 1) // chunk_size

        for i in range(total_chunks):
            start = i * chunk_size
            end = min(start + chunk_size, file_size)
            chunk = file_bytes[start:end]
            await client.write_gatt_char(write_char.uuid, chunk)
            
            pct = int(((i + 1) / total_chunks) * 100)
            if i % 10 == 0 or i == total_chunks - 1:
                print(f"    -> Block {i+1}/{total_chunks} ({pct}%) sent")
            await asyncio.sleep(0.01)

        print("[✅] All blocks transferred!")
        
        # Apply Watch Face Command (Opcode 40100 / service_dial_apply)
        apply_cmd = b'{"service":"service_dial_apply","id":"custom_wallpaper"}\n'
        await client.write_gatt_char(write_char.uuid, apply_cmd)
        print("[🎉] Sent 'service_dial_apply' command! Watch face applied.")

if __name__ == "__main__":
    try:
        asyncio.run(push_dial_to_watch())
    except KeyboardInterrupt:
        print("\nAborted.")
