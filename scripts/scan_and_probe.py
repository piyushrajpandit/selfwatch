import asyncio
import sys
from bleak import BleakScanner, BleakClient

TARGET_NAMES = ["chrome", "colorfit", "noise"]

async def scan_and_probe():
    print("=" * 60)
    print(" 📡 Scanning for Noise ColorFit Chrome via Bluetooth LE...")
    print(" Make sure your watch is nearby, awake, and not connected to phone app.")
    print("=" * 60)

    devices = await BleakScanner.discover(timeout=10.0, return_adv=True)
    
    found_target = None
    target_adv = None

    print(f"\nDiscovered {len(devices)} Bluetooth devices:")
    for d, adv in devices.values():
        name = d.name or adv.local_name or "Unknown"
        print(f" • [{d.address}] {name} (RSSI: {adv.rssi} dBm)")
        
        # Check if matches target name
        if any(keyword in name.lower() for keyword in TARGET_NAMES):
            found_target = d
            target_adv = adv

    if not found_target:
        print("\n❌ Could not automatically detect a device with 'Chrome' or 'Noise' in the name.")
        print("Tip: If your watch is currently connected to the NoiseFit app on your phone,")
        print("Bluetooth LE won't allow a second connection. Please turn off Bluetooth on your phone temporarily!")
        return

    name = found_target.name or target_adv.local_name
    print(f"\n🎯 Found Target Watch: {name} ({found_target.address})")
    print("Connecting to inspect GATT Services and Characteristics...")

    async with BleakClient(found_target.address) as client:
        connected = client.is_connected
        print(f" Connected: {connected}")
        print("\n" + "=" * 60)
        print(" 📋 GATT Services & Characteristics Map")
        print("=" * 60)

        for service in client.services:
            print(f"\n[Service] {service.uuid} ({service.description})")
            for char in service.characteristics:
                props = ", ".join(char.properties)
                print(f"  └── [Char] {char.uuid} ({props})")
                
                # If readable, attempt a safe read
                if "read" in char.properties:
                    try:
                        val = await client.read_gatt_char(char.uuid)
                        print(f"       Value (hex): {val.hex()} | (raw): {val[:20]}")
                    except Exception as e:
                        print(f"       Read error: {e}")

        print("\n" + "=" * 60)
        print("✅ Scan and GATT probe complete!")
        print("=" * 60)

if __name__ == "__main__":
    try:
        asyncio.run(scan_and_probe())
    except KeyboardInterrupt:
        print("\nScan stopped.")
