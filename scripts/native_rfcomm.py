import sys
import time
import objc
from Foundation import NSObject

objc.loadBundle('IOBluetooth', globals(), bundle_path='/System/Library/Frameworks/IOBluetooth.framework')
IOBluetoothDevice = objc.lookUpClass('IOBluetoothDevice')

TARGET_ADDR = 'd6-3a-0c-20-0d-e1'

class RFCOMMDelegate(NSObject):
    def rfcommChannelOpenComplete_status_(self, channel, status):
        print(f"[RFCOMM] Open Complete! Status: {status}")
        if status == 0:
            print("[RFCOMM] Successfully connected to watch RFCOMM Channel 1!")
            self.channel = channel
        else:
            print(f"[RFCOMM] Failed to open channel: {status}")

    def rfcommChannelData_data_length_(self, channel, dataPointer, length):
        data = bytes(dataPointer[:length])
        print(f"[RFCOMM RX] <- ({length} bytes): {data.hex()}")

    def rfcommChannelClosed_(self, channel):
        print("[RFCOMM] Channel closed.")

def test_rfcomm():
    print(f"Connecting to {TARGET_ADDR} via macOS native IOBluetooth...")
    dev = IOBluetoothDevice.deviceWithAddressString_(TARGET_ADDR)
    if not dev:
        print("Device not found!")
        return

    print("Opening baseband connection...")
    ret = dev.openConnection()
    print(f"Baseband connection result: {ret} (isConnected: {dev.isConnected()})")

    delegate = RFCOMMDelegate.alloc().init()
    channel = objc.nil
    status, channel = dev.openRFCOMMChannelAsync_withChannelID_delegate_(channel, 1, delegate)
    print(f"openRFCOMMChannelAsync returned status: {status}")

    # Wait up to 5 seconds for callback
    for _ in range(10):
        objc.lookUpClass('NSRunLoop').currentRunLoop().runUntilDate_(objc.lookUpClass('NSDate').dateWithTimeIntervalSinceNow_(0.5))

if __name__ == '__main__':
    test_rfcomm()
