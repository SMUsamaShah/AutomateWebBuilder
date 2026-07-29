# Block reference

All 410 block types Automate supports, generated from the app itself by
`tools/blocks.ts` (`npm run blocks -- --index`). Do not edit by hand.

The **id** is what `createBlock(model, id, x, y)` takes. For a block's ports and
argument names — which you need before setting anything — run:

```bash
npm run blocks -- --id 1046
```

See [LLM-GUIDE.md](LLM-GUIDE.md) for how to use these in an edit.

## Apps (51)

| id | name | title | what it does |
| --- | --- | --- | --- |
| 1334 | `AccessibilityButton` | Accessibility button | Await accessibility button click. |
| 1380 | `AdbProtocolSet` | ADB protocol set | Set protocol used by ADB to listen for client connections. |
| 1342 | `AdbShellCommand` | ADB shell command | Execute a shell command through ADB. |
| 1336 | `AlternativeLaunch` | Alternative launch | Await alternative Automate launch. |
| 1235 | `AppClearCache` | App clear cache | Clear an app’s cache. |
| 1002 | `ActivityStartResult` | App decision? | Start an app activity and await result. |
| 1006 | `AppForeground` | App in foreground? | App displayed in the foreground. |
| 1007 | `AppInstalled` | App installed? | Check if app is installed, and get information about it. |
| 1221 | `AppKill` | App kill | Terminate an app. |
| 1008 | `AppKillBackground` | App kill background | Terminate an apps background processes. |
| 1305 | `AppList` | App list | List installed app packages. |
| 1242 | `AppNotificationsEnabled` | App notification enabled? | Check if an app is allowed to show notifications, or not. |
| 1306 | `AppNotificationsPriorityGet` | App notification priority get | Get maximum notification priority for an app. |
| 1307 | `AppNotificationsPrioritySet` | App notification priority set | Set maximum notification priority for an app. |
| 1243 | `AppNotificationsSetState` | App notification set state | Enable or disable notification for an app. |
| 1308 | `AppNotificationsVisibilityGet` | App notification visibility get | Get notification visibility override for an app. |
| 1309 | `AppNotificationsVisibilitySet` | App notification visibility set | Override notification visibility for an app. |
| 1237 | `AppPick` | App pick? | Let user pick an app package. |
| 1350 | `ShortcutPin` | App shortcut install | Install/pin an app shortcut on the launcher home screen. |
| 1164 | `ShortcutStart` | App shortcut start | Start an app from a shortcut. |
| 1373 | `ShortcutUpdate` | App shortcut update | Update a previously installed/pinned an app shortcut. |
| 1001 | `ActivityStart` | App start | Start an app activity. |
| 1346 | `ActivityStartVoice` | App start voice | Start an app voice activity. |
| 1310 | `AppUsage` | App usage | Get app usage statistics. |
| 1251 | `AppOpModeSet` | AppOp mode set | Set the mode for an “application operation” (run-time permission) for an app. |
| 1250 | `AppOpMode` | AppOp mode? | Check the mode of an “application operation” (run-time permission) for an app. |
| 1013 | `AssistRequest` | Assist request | Await a user assist request. |
| 1326 | `BroadcastSendOrdered` | Broadcast decision? | Send an “ordered” app broadcast and await result. |
| 1022 | `BroadcastReceive` | Broadcast receive | Await a system or app broadcast. |
| 1023 | `BroadcastSend` | Broadcast send | Send an app broadcast. |
| 1388 | `FeatureUsage` | Feature usage | Get system feature usage statistics, e.g. screen on/off, locked/unlocked. |
| 1413 | `FloatingButtonShow` | Floating button show | Show a button in a floating toolbar. |
| 1327 | `Fullscreen` | Fullscreen? | Await low profile, hidden navigation or fullscreen. |
| 1181 | `GoogleAssistantAction` | Google Assistant action | Await a voice action from Google Assistant. |
| 1354 | `InspectLayout` | Inspect layout | Inspect the layout of the user interface shown on screen. |
| 1404 | `InspectTextEdit` | Inspect text edit | Await changes in a text field. |
| 1229 | `Interact` | Interact | Interact with the user interface shown on screen. |
| 1325 | `InteractTouch` | Interact touch | Simulate user interface gesture. |
| 1324 | `KeyPressed` | Key pressed | Await key/button press or release. |
| 1338 | `KeySend` | Key send | Simulate a key/button press or release. |
| 1379 | `KeySendCharacters` | Key send characters | Simulate keyboard text input. |
| 1094 | `MediaButton` | Media button | Wait for a media/headset button to be pressed. |
| 1328 | `PreferredActivity` | Preferred activity? | Get default app activity for a particular task. |
| 1314 | `ProcessText` | Process text selection | Await text selected within another app. |
| 1315 | `ProcessTextResult` | Process text set | Replace selected text within another app. |
| 1196 | `ResolveActivity` | Resolve activity? | Resolve an app activity. |
| 1197 | `ResolveReceiver` | Resolve receiver? | Resolve an app receiver. |
| 1198 | `ResolveService` | Resolve service? | Resolve an app service. |
| 1227 | `Screenshot` | Screenshot | Take an image of the current screen. |
| 1158 | `ServiceStart` | Service start | Start an app service. |
| 1357 | `SplitScreenModeEnabled` | Split-screen mode enabled? | Check if UI is in split-screen mode. |

## Battery & power (25)

| id | name | title | what it does |
| --- | --- | --- | --- |
| 1205 | `AttentionLight` | Attention light | Turn the attention LED light on or off. |
| 1369 | `BatteryCharging` | Battery charging? | Check if battery is charging. |
| 1021 | `BatteryLevel` | Battery level? | Check battery charge level. |
| 1370 | `BatteryProperties` | Battery properties | Get battery properties. |
| 1212 | `CpuSpeedGet` | CPU speed get | Get processor governor and speed. |
| 1213 | `CpuSpeedSet` | CPU speed set | Set processor governor and speed. |
| 1291 | `DeviceIdleModeActive` | Device doze mode active? | Check if device is in idle “doze” mode. |
| 1299 | `DeviceIdleModeSetState` | Device doze mode set state | Active or deactivate device idle “doze” mode. |
| 1118 | `DeviceInteractive` | Device interactive? | Check if device is in an “interactive” state. |
| 1115 | `DeviceKeepAwake` | Device keep awake | Keep the CPU (optionally illuminating screen and keyboard) and/or Wi-Fi hardware awake. |
| 1218 | `DeviceReboot` | Device reboot | Reboot the device. |
| 1281 | `DeviceRestart` | Device restart | Soft reboot the device. |
| 1219 | `DeviceShutdown` | Device shutdown | Shutdown (power off) the device. |
| 1330 | `DisplayOn` | Display on? | Check if a display is turned on. |
| 1384 | `DisplayPowerModeSet` | Display power mode set | Set power mode for a display, e.g. turn it off. |
| 1394 | `DisplayPowerMode` | Display power mode? | Check power mode for a display. |
| 1395 | `FlashlightEnabled` | Flashlight enabled? | Check if camera flash LED light is enabled. |
| 1071 | `FlashlightSetState` | Flashlight set state | Turn on or off the camera flash LED light. |
| 1232 | `PowerSaveModeEnabled` | Power save mode enabled? | Check if power save mode is enabled. |
| 1233 | `PowerSaveModeSetState` | Power save mode set state | Enable or disable power save mode. |
| 1108 | `PowerSourcePlugged` | Power source plugged? | Check if power source plugged in. |
| 1114 | `ScreenBrightnessSet` | Screen brightness set | Set screen brightness level or automatic adjustment. |
| 1113 | `ScreenBrightness` | Screen brightness? | Check screen brightness level or automatically adjusted. |
| 1117 | `ScreenOffTimeoutSet` | Screen off timeout set | Set the screen off timeout. |
| 1116 | `ScreenOffTimeout` | Screen off timeout? | Check screen off timeout. |

## Camera & sound (56)

| id | name | title | what it does |
| --- | --- | --- | --- |
| 1329 | `AudioDeviceConnected` | Audio device connected? | Check if an audio device is connected. |
| 1349 | `AudioDeviceRecording` | Audio device recording? | Check if an audio device is recording. |
| 1152 | `AudioPlayerControl` | Audio player control | Control an audio player. |
| 1015 | `AudioRecordStart` | Audio record | Start recording audio. |
| 1016 | `AudioRecordStop` | Audio record stop | Stop ongoing audio recording. |
| 1317 | `AudioStreamMuted` | Audio stream muted? | Check if an audio stream is muted. |
| 1318 | `AudioStreamSetMute` | Audio stream set mute | Mute or unmute an audio stream. |
| 1018 | `AudioVolumeSet` | Audio volume set | Set audio volume. |
| 1017 | `AudioVolume` | Audio volume? | Check audio volume. |
| 1411 | `BarcodeScan` | Barcode scan | Scan an image for barcodes. |
| 1378 | `CameraAvailable` | Camera available? | Check if a camera is available. |
| 1031 | `CaptureImage` | Capture image | Start a Camera app and wait for the user to take a picture. |
| 1345 | `CaptureVideo` | Capture video | Start a Camera app and wait for the user to record a video. |
| 1400 | `DtmfTonePlay` | DTMF tone play | Play a DTMF tone in an ongoing call. |
| 1401 | `DtmfToneStop` | DTMF tone stop | Stop any DTMF tone playback. |
| 1364 | `ImageCrop` | Image crop | Crop an image. |
| 1365 | `ImageFlip` | Image flip | Flip an image. |
| 1361 | `ImageLoad` | Image load | Decode an image into an memory bitmap. |
| 1366 | `ImageRescale` | Image rescale | Rescale an image. |
| 1367 | `ImageRotate` | Image rotate | Rotate an image. |
| 1368 | `ImageSampleColor` | Image sample color | Sample color of pixels in an image. |
| 1362 | `ImageUnload` | Image unload | Free bitmap held in memory. |
| 1363 | `ImageWrite` | Image write | Encode a memory bitmap to an image file. |
| 1282 | `InfraredTransmit` | Infrared transmit | Transmit an IR signal. |
| 1238 | `MediaPlaying` | Media playing? | Check audio or video playback. |
| 1078 | `MediaStoreAdd` | Media store add | Add files to the media store, Gallery and Music app. |
| 1262 | `MediaStoreRemove` | Media store remove | Remove files from the media store, Gallery and Music app. |
| 1239 | `MediaTagsRead` | Media tags read | Read metadata tags from media content. |
| 1095 | `MicrophoneMuted` | Microphone muted? | Check if microphone is muted. |
| 1096 | `MicrophoneSetMute` | Microphone set mute | Mute or unmute the microphone. |
| 1392 | `QrCodeGenerate` | QR code generate | Generate an QR code image. |
| 1112 | `RingerModeSet` | Ringer mode set | Set ringer mode. |
| 1111 | `RingerMode` | Ringer mode? | Check ringer mode used. |
| 1176 | `RingerSilence` | Ringer silence | Silence the ringer and stop vibrate if a call is ringing. |
| 1044 | `RingtoneGet` | Ringtone get | Get default ringtone sound. |
| 1175 | `RingtonePick` | Ringtone pick? | Let user pick a ringtone sound. |
| 1045 | `RingtoneSet` | Ringtone set | Set default ringtone sound. |
| 1284 | `SoundLevel` | Sound level? | Check sound level. |
| 1124 | `SoundPlay` | Sound play | Play a sound. |
| 1125 | `SoundStop` | Sound stop | Stop any sound playback. |
| 1127 | `SpeakPlay` | Speak | Speak a message using text to speech. |
| 1128 | `SpeakStop` | Speak stop | Stop any text to speech playback. |
| 1129 | `SpeakToFile` | Speak to file | Save a text to speech message to file. |
| 1130 | `SpeakerphoneOn` | Speakerphone on? | Check if speakerphone on. |
| 1131 | `SpeakerphoneSetState` | Speakerphone set state | Turn on or off speakerphone. |
| 1136 | `TakePicture` | Take picture | Take picture without user interaction. |
| 1389 | `TextRecognition` | Text recognition | Recognize text in an image, OCR. |
| 1224 | `TonePlay` | Tone play | Play a tone. |
| 1331 | `ToneStop` | Tone stop | Stop any tone playback. |
| 1139 | `VibrateStart` | Vibrate | Use the vibrator on the device. |
| 1140 | `VibrateStop` | Vibrate stop | Stop ongoing vibrate. |
| 1272 | `VideoRecordStart` | Video record | Start recording video. |
| 1273 | `VideoRecordStop` | Video record stop | Stop ongoing video recording. |
| 1399 | `WallpaperColorsGet` | Wallpaper colors get | Get the wallpaper colors, as used for theming. |
| 1141 | `WallpaperImageSet` | Wallpaper image set | Set home screen wallpaper to an image. |
| 1260 | `WallpaperLiveSet` | Wallpaper live set | Set a live home screen wallpaper. |

## Concurrency (10)

| id | name | title | what it does |
| --- | --- | --- | --- |
| 1253 | `AtomicAdd` | Atomic add &amp; load | Adds the delta to the stored value and assign the sum to the variable. |
| 1254 | `AtomicClearAll` | Atomic clear all | Clear all stored values. |
| 1255 | `AtomicCompareAndStore` | Atomic compare &amp; store? | Compare the stored value and replace it with the variable value. |
| 1256 | `AtomicLoad` | Atomic load | Assign the stored value to the variable. |
| 1257 | `AtomicStore` | Atomic store | Store the current variable value. |
| 1061 | `FiberStop` | Fiber stop | Stop a running fiber. |
| 1195 | `FiberStopped` | Fiber stopped? | Check if a fiber has stopped. |
| 1060 | `Fork` | Fork | Clone the running fiber from this point. |
| 1214 | `VariablesGive` | Variables give | Give variable values to a taker in another fiber. |
| 1215 | `VariablesTake` | Variables take? | Take variable values given from other fibers. |

## Connectivity (70)

| id | name | title | what it does |
| --- | --- | --- | --- |
| 1003 | `AirplaneModeEnabled` | Airplane mode enabled? | Check if airplane mode is enabled. |
| 1165 | `AirplaneModeSetState` | Airplane mode set state | Enable or disable airplane mode. |
| 1383 | `BluetoothDeviceActiveSet` | Bluetooth device active set | Set active Bluetooth device, e.g. for audio routing. |
| 1211 | `BluetoothDeviceConnect` | Bluetooth device connect | Connect to a Bluetooth device. |
| 1153 | `BluetoothDeviceConnected` | Bluetooth device connected? | Check if a Bluetooth is connected. |
| 1270 | `BluetoothDeviceDisconnect` | Bluetooth device disconnect | Disconnect a Bluetooth device. |
| 1371 | `BluetoothDeviceBondCreate` | Bluetooth device pair | Pair with another Bluetooth device. |
| 1154 | `BluetoothDevicePick` | Bluetooth device pick? | Let user pick a nearby Bluetooth device. |
| 1277 | `BluetoothDeviceScan` | Bluetooth device scan | Scan for nearby Bluetooth devices. |
| 1393 | `BluetoothDeviceBondRemove` | Bluetooth device unpair | Forget a paired Bluetooth device. |
| 1155 | `BluetoothEnabled` | Bluetooth enabled? | Check if Bluetooth is enabled. |
| 1372 | `BluetoothGattRead` | Bluetooth GATT read | Read characteristic value from a Bluetooth GATT service. |
| 1222 | `BluetoothScoSetState` | Bluetooth SCO set state | Enable or disable Bluetooth SCO audio routing. |
| 1223 | `BluetoothScoTask` | Bluetooth SCO set state | Enable or disable Bluetooth SCO audio routing. |
| 1156 | `BluetoothSetState` | Bluetooth set state | Enable or disable Bluetooth. |
| 1193 | `BluetoothTetherEnabled` | Bluetooth tethering enabled? | Check if Bluetooth tethering is enabled. |
| 1194 | `BluetoothTetherSetState` | Bluetooth tethering set state | Enable or disable Bluetooth tethering. |
| 1030 | `CellSignalLevel` | Cell signal strength? | Check cellular signal strength. |
| 1184 | `CellSiteNear` | Cell tower near? | Check nearby cell towers. |
| 1185 | `CellSitePick` | Cell tower pick? | Let user pick nearby cell towers. |
| 1377 | `DataNetworkDefault` | Data network default? | Check default data network capabilities. |
| 1207 | `DataUsage` | Data usage | Get network data usage statistics. |
| 1387 | `EthernetTetherSetState` | Ethernet tether set state | Enable or disable Ethernet tethering. |
| 1074 | `FtpDelete` | FTP delete | Delete content on a FTP server. |
| 1075 | `FtpDownload` | FTP download | Download content from a FTP server. |
| 1076 | `FtpList` | FTP list | List content on a FTP server. |
| 1247 | `FtpMakeDirectory` | FTP make directory | Create a directory on a FTP server. |
| 1077 | `FtpUpload` | FTP upload | Upload content to a FTP server. |
| 1415 | `HttpAcceptTcp` | HTTP accept | Listen for incoming HTTP requests. |
| 1087 | `HttpRequest` | HTTP request | Download content from the internet. |
| 1416 | `HttpResponse` | HTTP response | Send a response to incoming HTTP request. |
| 1162 | `MobileDataEnabled` | Mobile data enabled? | Check if mobile data is enabled. |
| 1290 | `MobileDataNetworkType` | Mobile data network type? | Check the current mobile data network type. |
| 1163 | `MobileDataSetState` | Mobile data set state | Enable or disable mobile data. |
| 1234 | `MobileNetworkPreferredSet` | Mobile network preferred set | Set preferred mobile network type (G2/G3/G4/G5). |
| 1252 | `MobileNetworkPreferred` | Mobile network preferred? | Check the preferred mobile network type (G2/G3/G4/G5). |
| 1209 | `MobileOperator` | Mobile operator? | Check the mobile operator. |
| 1311 | `MobileServiceState` | Mobile service state? | Check the mobile service state. |
| 1190 | `NetworkConnected` | Network connected? | Check if a network (internet) is connected. |
| 1344 | `NsdDiscover` | Network service discover | Discover network application services. |
| 1208 | `NetworkThroughput` | Network throughput? | Check network throughput. |
| 1098 | `NetworkType` | Network type? | Check active network type. |
| 1099 | `NfcEnabled` | NFC enabled? | Check if NFC is enabled. |
| 1167 | `NfcSetState` | NFC set state | Enable or disable NFC. |
| 1100 | `NfcTagScanned` | NFC tag scanned | Wait for an NFC tag to be scanned. |
| 1101 | `NfcTagWrite` | NFC tag write | Write content to an NFC tag. |
| 1228 | `Ping` | Ping | Check if a host is reachable. |
| 1292 | `RestrictBackgroundDataEnabled` | Restrict background data enabled? | Check if restrict background data is enabled. |
| 1293 | `RestrictBackgroundDataSetState` | Restrict background data set state | Enable or disable restrict background data. |
| 1110 | `Roaming` | Roaming? | Check roaming status. |
| 1374 | `SubscriptionDefaultGet` | Subscription default get | Get default SIM card/subscription for a particular usage. |
| 1375 | `SubscriptionDefaultSet` | Subscription default set | Set default SIM card/subscription for a particular usage. |
| 1267 | `SubscriptionPick` | Subscription pick? | Let user pick a SIM card/subscription. |
| 1359 | `SubscriptionSetState` | Subscription set state | Enable or disable a SIM/carrier subscription. |
| 1391 | `UsbFunctionSet` | USB configuration set | Set current USB configuration, e.g. to use MTP or PTP. |
| 1390 | `UsbConfigured` | USB configured? | Check if and how USB is currently configured, e.g. for MTP or PTP. |
| 1402 | `UsbDeviceAttached` | USB device attached? | Check if a USB device is attached. |
| 1225 | `UsbTetherEnabled` | USB tethering enabled? | Check if USB tethering is enabled. |
| 1226 | `UsbTetherSetState` | USB tethering set state | Enable or disable USB tethering. |
| 1231 | `WakeOnLanSend` | Wake-on-LAN send | Send a Wake-on-LAN packet. |
| 1147 | `WifiEnabled` | Wi-Fi enabled? | Check if Wi-Fi is enabled. |
| 1386 | `WifiApClientsConnected` | Wi-Fi hotspot clients connected | Get information about clients connected to Wi-Fi hotspot. |
| 1143 | `WifiApEnabled` | Wi-Fi hotspot enabled? | Check if Wi-Fi hotspot is enabled. |
| 1144 | `WifiApSetState` | Wi-Fi hotspot set state | Enable or disable Wi-Fi hotspot. |
| 1145 | `WifiNetworkConnect` | Wi-Fi network connect | Connect to a Wi-Fi network. |
| 1146 | `WifiNetworkConnected` | Wi-Fi network connected? | Check if Wi-Fi is connected to an access point. |
| 1097 | `WifiNetworkPick` | Wi-Fi network pick? | Let user pick a nearby Wi-Fi network. |
| 1148 | `WifiNetworkScan` | Wi-Fi network scan | Scan for nearby Wi-Fi networks. |
| 1149 | `WifiSetState` | Wi-Fi set state | Enable or disable Wi-Fi. |
| 1241 | `WifiSignalLevel` | Wi-Fi signal strength? | Check Wi-Fi signal strength. |

## Content (29)

| id | name | title | what it does |
| --- | --- | --- | --- |
| 1236 | `AccountGenericAdd` | Account generic add | Add or replace a “Generic credentials” account. |
| 1000 | `AccountPick` | Account pick? | Let user pick an account. |
| 1019 | `AccountSyncEnabled` | Account sync enabled? | Check if automatic account data sync is enabled. |
| 1230 | `AccountSyncRequest` | Account sync request | Perform a manual account data sync. |
| 1020 | `AccountSyncSetState` | Account sync set state | Enable or disable the automatic account data sync. |
| 1170 | `CalendarEventAdd` | Calendar event add | Add an event to a calendar. |
| 1186 | `CalendarEventGet` | Calendar event get | Get a calendar event from a calendar. |
| 1187 | `CalendarEventQuery` | Calendar event query? | Search for, or await calendar events. |
| 1171 | `CalendarPick` | Calendar pick? | Let user pick a calendar. |
| 1032 | `ClipboardGet` | Clipboard get | Get clipboard content as text. |
| 1033 | `ClipboardSet` | Clipboard set | Set clipboard content. |
| 1038 | `ContactPick` | Contact pick? | Let user pick a contact. |
| 1037 | `ContactQuery` | Contact query? | Search for a contact. |
| 1294 | `ContentChanged` | Content changed | Await content change. |
| 1295 | `ContentDelete` | Content delete | Delete from a content provider. |
| 1296 | `ContentInsert` | Content insert | Insert into a content provider. |
| 1347 | `ContentOffer` | Content offer | Offer content to other apps. |
| 1348 | `ContentOfferResult` | Content offer result | Give content offered to an app. |
| 1040 | `ContentPick` | Content pick? | Let user pick content provided by other apps. |
| 1418 | `ContentProviderCall` | Content provider call | Call a method on a content provider. |
| 1297 | `ContentQuery` | Content query | Query a content provider. |
| 1039 | `ContentRead` | Content read | Copy content to external storage. |
| 1041 | `ContentShared` | Content shared | Await content shared from within another app. |
| 1298 | `ContentUpdate` | Content update | Update a content provider. |
| 1042 | `ContentView` | Content view | View a file, web page, contact or any other content. |
| 1420 | `ContentWrite` | Content write | Copy content from external storage. |
| 1319 | `DatabaseModify` | Database modify | Execute a statement that modifies an SQLite database. |
| 1320 | `DatabaseQuery` | Database query | Query an SQLite database. |
| 1343 | `KeyChainAliasPick` | Keychain credentials pick | Let user pick cryptographic credentials. |

## Date & time (11)

| id | name | title | what it does |
| --- | --- | --- | --- |
| 1182 | `AlarmAdd` | Alarm add | Set an alarm in the Clock app. |
| 1210 | `Alarm` | Alarm? | Get or await an alarm set in the Clock app. |
| 1043 | `DatePick` | Date pick? | Let user pick a date. |
| 1046 | `Delay` | Delay | Wait for an amount of time. |
| 1057 | `DurationPick` | Duration pick? | Let user pick a duration. |
| 1169 | `TimeAwait` | Time await | Await a specific or recurring time. |
| 1138 | `TimePick` | Time pick? | Let user pick a time of day. |
| 1137 | `TimeWindow` | Time window? | Check or await a specific or recurring window of time. |
| 1189 | `TimeZoneGet` | Time zone get | Get the current time zone. |
| 1271 | `TimeZoneSet` | Time zone set | Set the current time zone. |
| 1240 | `TimerAdd` | Timer add | Set a timer in the Clock app. |

## File & storage (31)

| id | name | title | what it does |
| --- | --- | --- | --- |
| 1417 | `FileApkExtract` | File APK extract | Extract content an Android Package file. |
| 1063 | `FileCopy` | File copy | Copy content on external storage. |
| 1062 | `FileDelete` | File delete | Delete content on external storage. |
| 1174 | `FileExists` | File exists? | Check if a file or directory exists on external storage, and get information about it. |
| 1064 | `FileList` | File list | List content on external storage. |
| 1066 | `FileMakeDirectory` | File make directory | Create a directory on external storage. |
| 1065 | `FileMonitor` | File monitor | Await file system alterations. |
| 1067 | `FileMove` | File move | Move file or directory on external storage. |
| 1414 | `FileMultipartExtract` | File multipart extract | Extract a single part of an multipart encoded file. |
| 1068 | `FilePick` | File pick? | Let user pick a file or directory on external storage. |
| 1069 | `FileRead` | File read text | Read content of text file. |
| 1070 | `FileWrite` | File write | Write content to file. |
| 1079 | `GDriveDelete` | Google Drive delete | Delete content on Google Drive. |
| 1080 | `GDriveDownload` | Google Drive download | Download content from Google Drive. |
| 1385 | `GDriveFileExists` | Google Drive file exists? | Check if a file or directory exists on Google Drive, and get information about it. |
| 1081 | `GDriveList` | Google Drive list | List content on Google Drive. |
| 1248 | `GDriveMakeDirectory` | Google Drive make directory | Create a directory on Google Drive. |
| 1279 | `GDriveShare` | Google Drive share | Share content on Google Drive. |
| 1082 | `GDriveUpload` | Google Drive upload | Upload content to Google Drive. |
| 1405 | `OneDriveDelete` | OneDrive delete | Delete content on Microsoft OneDrive. |
| 1406 | `OneDriveDownload` | OneDrive download | Download content from Microsoft OneDrive. |
| 1407 | `OneDriveFileExists` | OneDrive file exists? | Check if a file or directory exists on Microsoft OneDrive, and get information about it. |
| 1408 | `OneDriveList` | OneDrive list | List content on Microsoft OneDrive. |
| 1409 | `OneDriveMakeDirectory` | OneDrive make directory | Create a directory on Microsoft OneDrive. |
| 1410 | `OneDriveUpload` | OneDrive upload | Upload content to Microsoft OneDrive. |
| 1376 | `StorageVolumeList` | Storage media list | List mounted storage media. |
| 1132 | `StorageMediaMounted` | Storage media mounted? | Check if external storage media is mounted or unmounted. |
| 1133 | `StorageSpace` | Storage space? | Device storage space okay or low. |
| 1151 | `ZipCompress` | Zip compress | Create or update a zip file. |
| 1150 | `ZipExtract` | Zip extract | Extract content from a zip file. |
| 1358 | `ZipList` | Zip list | List content of a zip file. |

## Flow (12)

| id | name | title | what it does |
| --- | --- | --- | --- |
| 1263 | `FailureCatch` | Failure catch | Catch failure in subsequent blocks. |
| 1072 | `FlowBeginning` | Flow beginning | The starting point of a flow. |
| 1172 | `FlowBeginningPick` | Flow beginning pick? | Let user pick a flow beginning. |
| 1261 | `FlowPick` | Flow pick? | Let user pick a flow. |
| 1173 | `FlowStart` | Flow start | Start another flow. |
| 1161 | `FlowStop` | Flow stop | Stop a flow and all its running fibers. |
| 1073 | `ForEach` | For each | Iterate over each element in an array, entry in a dictionary or a number of times. |
| 1287 | `Goto` | Go to | Transfer control to a Label block. |
| 1288 | `Label` | Label | A destination for Go to blocks. |
| 1093 | `LogAppend` | Log append | Append a message to the flow log file. |
| 1337 | `LogAwait` | Log await | Await a message logged by an app or system component. |
| 1278 | `Subroutine` | Subroutine | Execute a subroutine. |

## General (8)

| id | name | title | what it does |
| --- | --- | --- | --- |
| 1009 | `ArrayAdd` | Array add | Insert or append a value to an array. |
| 1010 | `ArrayRemove` | Array remove | Remove a value from an array. |
| 1011 | `ArraySet` | Array set | Replace a value in an array. |
| 1412 | `DestructuringAssign` | Destructuring assign | Assign multiple variables from array elements. |
| 1055 | `DictionaryPut` | Dictionary put | Associate a value with the specified key in a dictionary. |
| 1056 | `DictionaryRemove` | Dictionary remove | Remove the mapping for a key from a dictionary. |
| 1058 | `ExpressionDecision` | Expression true? | Check if an expression result is true. |
| 1012 | `VariableAssign` | Variable set | Assign a value to a variable. |

## Interface (38)

| id | name | title | what it does |
| --- | --- | --- | --- |
| 1201 | `CarModeEnabled` | Car mode enabled? | Check if car UI mode is enabled. |
| 1202 | `CarModeSetState` | Car mode set state | Enable or disable car UI mode. |
| 1206 | `ColorPick` | Color pick? | Let user pick a color. |
| 1052 | `DialogChoice` | Dialog choice? | Show a dialog with a list of choices and await user decision. |
| 1053 | `DialogConfirm` | Dialog confirm? | Show a confirmation dialog and await user decision. |
| 1054 | `DialogInput` | Dialog input? | Show a text input dialog and await user decision. |
| 1335 | `DialogMessage` | Dialog message | Show a message dialog. |
| 1302 | `DialogNumber` | Dialog number? | Show a number selection dialog and await user decision. |
| 1280 | `DialogWeb` | Dialog web? | Show web page dialog and await user decision. |
| 1381 | `DisplayMetricsGet` | Display metrics get? | Get display metrics such as size, rotation and density. |
| 1353 | `DisplayQuery` | Display query | Query connected displays. |
| 1289 | `HardwareKeyboardVisible` | Hardware keyboard visible? | Check if the physical keyboard is visible/extended. |
| 1333 | `HotwordDetected` | Hotword detected | Await a spoken hotword. |
| 1351 | `IconPick` | Icon pick? | Let user pick an icon. |
| 1177 | `InputMethodPick` | Input method pick? | Let user pick an input method (soft keyboard). |
| 1178 | `InputMethodSet` | Input method set | Set input method (soft keyboard). |
| 1246 | `InterruptionFilterSet` | Interruptions set | Set interruptions (Do Not Disturb) setting. |
| 1245 | `InterruptionFilter` | Interruptions? | Check interruptions (Do Not Disturb) setting. |
| 1203 | `NightModeEnabled` | Night mode enabled? | Check if night UI mode is enabled. |
| 1204 | `NightModeSetState` | Night mode set state | Enable or disable night UI mode. |
| 1276 | `NotificationAction` | Notification action | Present and await expanded notification action buttons. |
| 1102 | `NotificationCancel` | Notification cancel | Cancel a status bar notification. |
| 1332 | `NotificationChannelPick` | Notification channel pick? | Let user pick a notification channel. |
| 1191 | `NotificationInteract` | Notification interact | Interact with a status bar notification. |
| 1312 | `NotificationPolicyGet` | Notification policy get | Get (Do Not Disturb) policy for “priority” notifications. |
| 1313 | `NotificationPolicySet` | Notification policy set | Set (Do Not Disturb) policy for “priority” notifications. |
| 1192 | `NotificationPosted` | Notification posted? | Check if a status bar notification is posted. |
| 1103 | `NotificationShow` | Notification show | Show a status bar notification. |
| 1321 | `NotificationSnooze` | Notification snooze | Snooze a status bar notification. |
| 1109 | `Proximity` | Proximity distance? | Check distance to device. |
| 1303 | `QuickSettingsTileShow` | Quick Settings tile show | Show a Quick Settings tile. |
| 1183 | `ScreenLockSetState` | Screen lock set state | Temporarily disable or reenable the screen lock (keyguard). |
| 1168 | `ScreenOrientationSet` | Screen orientation set | Force screen orientation. |
| 1119 | `ScreenOrientation` | Screen orientation? | Check screen orientation. |
| 1398 | `SoftwareKeyboardVisible` | Software keyboard visible? | Check if the software keyboard is visible on screen. |
| 1269 | `ToastPosted` | Toast posted | Await posted “toast” message. |
| 1120 | `ToastShow` | Toast show | Briefly show a “toast” message on screen. |
| 1352 | `UserAsleep` | User asleep? | Await user falling asleep or waking up. |

## Location (10)

| id | name | title | what it does |
| --- | --- | --- | --- |
| 1085 | `GeocodingReverse` | Geocoding reverse? | Find location name from coordinates. |
| 1084 | `Geocoding` | Geocoding? | Find coordinates from a location name. |
| 1088 | `LocationAt` | Location at? | Check location. |
| 1089 | `LocationGet` | Location get | Get location. |
| 1316 | `LocationMock` | Location mock | Mock a location fix update. |
| 1090 | `LocationPick` | Location pick? | Let user pick a location on a map. |
| 1092 | `LocationProviderEnabled` | Location provider enabled? | Check if location provider (GPS) is enabled. |
| 1166 | `LocationProviderSetState` | Location provider set state | Enable or disable a location provider (GPS). |
| 1091 | `LocationShow` | Location show | Show a location in the default map app. |
| 1142 | `Weather` | Weather | Get current or forecasted weather. |

## Messaging (12)

| id | name | title | what it does |
| --- | --- | --- | --- |
| 1265 | `CloudMessageReceive` | Cloud message receive | Await an incoming cloud message. |
| 1266 | `CloudMessageSend` | Cloud message send | Send a cloud message. |
| 1034 | `ComposeEmail` | Compose e-mail | Compose an e-mail in the default mail app. |
| 1035 | `ComposeMms` | Compose MMS | Compose an MMS in the default messaging app. |
| 1036 | `ComposeSms` | Compose SMS | Compose an SMS in the default messaging app. |
| 1059 | `EmailSend` | E-mail send | Send an e-mail without user interaction. |
| 1083 | `GmailSend` | Gmail send | Send a Gmail without user interaction. |
| 1157 | `GmailUnreadCount` | Gmail unread count | Get Gmail unread conversation count. |
| 1249 | `MmsSend` | MMS send | Send an MMS without user interaction. |
| 1121 | `SmsReceived` | SMS received | Await an incoming SMS. |
| 1122 | `SmsSend` | SMS send | Send an SMS without user interaction. |
| 1123 | `SmsSent` | SMS sent | Await an outgoing SMS. |

## Sensor (14)

| id | name | title | what it does |
| --- | --- | --- | --- |
| 1004 | `AmbientLight` | Ambient light? | Check ambient light. |
| 1005 | `AmbientTemperature` | Ambient temperature? | Check ambient temperature. |
| 1014 | `AtmosphericPressure` | Atmospheric pressure? | Check atmospheric pressure. |
| 1258 | `DeviceAcceleration` | Device acceleration? | Check device acceleration. |
| 1340 | `HingeAngle` | Device hinge angle? | Check hinge angle of foldable device. |
| 1049 | `DeviceOrientation` | Device orientation? | Check device orientation. |
| 1322 | `FingerprintGesture` | Fingerprint gesture | Await a fingerprint scanner gesture. |
| 1339 | `HeartRate` | Heart rate? | Check heart rate. |
| 1259 | `MagneticFieldStrength` | Magnetic field strength? | Check magnetic field strength. |
| 1220 | `MotionGesture` | Motion gesture | Await a device motion gesture, like a shake. |
| 1300 | `Pedometer` | Pedometer | Await footsteps. |
| 1179 | `PhysicalActivity` | Physical activity | Detect physical activity, e.g. walking, running, biking, driving. |
| 1341 | `RelativeHumidity` | Relative humidity? | Check relative humidity. |
| 1283 | `SignificantDeviceMotion` | Significant device motion | Await significant device motion. |

## Settings (9)

| id | name | title | what it does |
| --- | --- | --- | --- |
| 1286 | `CyanogenModProfileSet` | CyanogenMod profile set | Set active CyanogenMode profile. |
| 1285 | `CyanogenModProfile` | CyanogenMod profile? | Check active CyanogenMode profile. |
| 1396 | `ProfileQuietModeEnabled` | Profile quiet mode enabled? | Check if a work profile is in quiet mode |
| 1397 | `ProfileQuietModeRequest` | Profile quiet mode request | Request to enable or disable quiet mode in a work profile. |
| 1188 | `SystemLanguageGet` | System language get | Get the current system language. |
| 1301 | `SystemLanguageSet` | System language set | Set the current system language. |
| 1268 | `SystemPropertyGet` | System property get | Get the current value of a system property. |
| 1134 | `SystemSettingGet` | System setting get | Get the current value of a system setting. |
| 1135 | `SystemSettingSet` | System setting set | Change the value of a system setting. |

## Telephony (14)

| id | name | title | what it does |
| --- | --- | --- | --- |
| 1024 | `CallAnswer` | Call answer | Answer an incoming (ringing) call. |
| 1025 | `CallEnd` | Call end | End an ongoing or ringing call. |
| 1026 | `CallIncoming` | Call incoming | Await an incoming call. |
| 1027 | `CallNumber` | Call number | Make a phone call without user interaction. |
| 1028 | `CallOutgoing` | Call outgoing | Await an outgoing call. |
| 1355 | `CallScreening` | Call screening | Screen incoming call. |
| 1356 | `CallScreeningResponse` | Call screening response | Accept or block a screened call. |
| 1029 | `CallState` | Call state? | Check cellular call state. |
| 1051 | `DialNumber` | Dial number | Dial a phone number, user must initiate call. |
| 1106 | `PlugInSetting` | Plug-in action | Perform a Tasker/Locale plug-in “setting” action. |
| 1104 | `PlugInCondition` | Plug-in decision? | State of a Tasker/Locale plug-in “condition”. |
| 1105 | `PlugInEvent` | Plug-in event | Await a Tasker plug-in “event”. |
| 1323 | `UssdRequest` | USSD request | Send a USSD request and await response. |
| 1160 | `WiredHeadset` | Wired headset plugged? | Check if a wired headset plugged in. |

## Other (10)

| id | name | title | what it does |
| --- | --- | --- | --- |
| 1244 | `AndroidVersion` | Android version? | Check Android version. |
| 1047 | `DeviceDocked` | Device docked? | Check if device is docked. |
| 1048 | `DeviceLock` | Device lock | Make the device lock, as if the screen lock timeout had expired. |
| 1403 | `DeviceSecure` | Device secure? | Check if the device has configured a secure lock screen. |
| 1050 | `DeviceUnlocked` | Device unlocked? | Check if device is locked. |
| 1107 | `PasswordFailed` | Login failed? | Awaits a failed or successful password unlock. |
| 1159 | `ShellCommand` | Shell command | Execute a shell command. |
| 1382 | `ShellCommandPrivileged` | Shell command privileged | Execute a shell command as privileged user. |
| 1180 | `ShellCommandSuperuser` | Shell command superuser | Execute a shell command as superuser (root). |
| 1126 | `SpeechRecognition` | Speech recognition | Record your speech and transcribe the spoken words into text. |
