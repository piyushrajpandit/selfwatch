#import <Foundation/Foundation.h>
#import <IOBluetooth/IOBluetooth.h>

@interface RFCOMMHandler : NSObject <IOBluetoothRFCOMMChannelDelegate>
@property (nonatomic, strong) IOBluetoothRFCOMMChannel *channel;
@property (nonatomic, assign) BOOL connected;
@end

@implementation RFCOMMHandler
- (void)rfcommChannelOpenComplete:(IOBluetoothRFCOMMChannel *)rfcommChannel status:(IOReturn)error {
    NSLog(@"[OBJC CALLBACK] rfcommChannelOpenComplete with status: 0x%x (%d)", error, error);
    if (error == kIOReturnSuccess) {
        NSLog(@"[OBJC] SUCCESS! Connected to Watch RFCOMM Channel 1!");
        self.connected = YES;
        self.channel = rfcommChannel;
        NSLog(@"[OBJC] Channel MTU: %u, isOpen: %d", [rfcommChannel getMTU], [rfcommChannel isOpen]);
    } else {
        NSLog(@"[OBJC] Failed to open RFCOMM channel: 0x%x", error);
    }
}

- (void)rfcommChannelData:(IOBluetoothRFCOMMChannel *)rfcommChannel data:(void *)dataPointer length:(size_t)dataLength {
    NSData *data = [NSData dataWithBytes:dataPointer length:dataLength];
    NSLog(@"[OBJC RX] (%zu bytes): %@", dataLength, data);
}

- (void)rfcommChannelClosed:(IOBluetoothRFCOMMChannel *)rfcommChannel {
    NSLog(@"[OBJC] Channel closed.");
}
@end

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        NSLog(@"Starting native macOS Bluetooth RFCOMM bridge...");
        NSString *mac = @"d6-3a-0c-20-0d-e1";
        IOBluetoothDevice *device = [IOBluetoothDevice deviceWithAddressString:mac];
        if (!device) {
            NSLog(@"Device %@ not found in paired list!", mac);
            return 1;
        }

        NSLog(@"Device found: %@ (%@)", [device name], [device addressString]);
        NSLog(@"Device isConnected: %d", [device isConnected]);

        RFCOMMHandler *handler = [[RFCOMMHandler alloc] init];
        IOBluetoothRFCOMMChannel *channel = nil;

        NSLog(@"Attempting openRFCOMMChannelSync on channel 1...");
        IOReturn syncRet = [device openRFCOMMChannelSync:&channel withChannelID:1 delegate:handler];
        NSLog(@"openRFCOMMChannelSync returned: 0x%x (%d), channel: %@", syncRet, syncRet, channel);

        if (syncRet == kIOReturnSuccess && channel) {
            NSLog(@"[OBJC] Channel is OPEN: %d, MTU: %u", [channel isOpen], [channel getMTU]);
        } else {
            NSLog(@"Sync open did not return success, trying async...");
            IOReturn ret = [device openRFCOMMChannelAsync:&channel withChannelID:1 delegate:handler];
            NSLog(@"openRFCOMMChannelAsync returned: 0x%x (%d), channel: %@", ret, ret, channel);
        }

        // Pump the runloop for 5 seconds to process any incoming packets
        for (int i = 0; i < 10; i++) {
            [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.5]];
            if ([channel isOpen]) {
                NSLog(@"[LOOP] Channel is active and open! MTU: %u", [channel getMTU]);
                break;
            }
        }
        NSLog(@"Done.");
    }
    return 0;
}
