# Testing Bidirectional Communication

This guide explains how to test the bidirectional communication features.

---

## 🚀 Quick Test (Automated)

### Prerequisites

1. **Start the server:**
   ```bash
   npm start
   ```

2. **Run the test script:**
   ```bash
   npm run test:bidirectional
   ```

The test script will automatically:
- ✅ Connect KIOSK and MONITOR
- ✅ Start monitoring session
- ✅ Test call-request from MONITOR
- ✅ Test call-accept from KIOSK
- ✅ Test toggle-video
- ✅ Test toggle-audio
- ✅ Test call-end
- ✅ Test call-reject
- ✅ Test KIOSK initiating call

---

## 📋 What the Test Covers

### 1. Registration
- KIOSK connects and registers
- MONITOR connects and registers

### 2. Session Management
- MONITOR starts monitoring session
- Session validation

### 3. Call Control
- **Call Request:** MONITOR initiates call
- **Call Accept:** KIOSK accepts call
- **Call End:** MONITOR ends call
- **Call Reject:** KIOSK rejects call
- **KIOSK Initiates:** KIOSK starts call

### 4. Media Control
- **Toggle Video:** Both parties toggle video
- **Toggle Audio:** Both parties toggle audio

---

## 🧪 Manual Testing

### Step 1: Generate Tokens

```bash
# Generate kiosk token
node scripts/generate-token.js KIOSK_01 KIOSK

# Generate monitor token
node scripts/generate-token.js MONITOR_01 MONITOR
```

### Step 2: Test with Browser Console

**Tab 1 - Monitor:**
```javascript
import('https://cdn.socket.io/4.7.2/socket.io.esm.min.js').then(({ io }) => {
  const socket = io('http://localhost:3000', {
    auth: { token: 'YOUR_MONITOR_TOKEN_HERE' }
  });

  socket.on('connect', () => {
    console.log('Monitor connected');
    socket.emit('register-monitor');
  });

  socket.on('monitor-registered', (data) => {
    console.log('Monitor registered:', data);
    // Start monitoring
    socket.emit('start-monitoring', { kioskId: 'KIOSK_01' });
  });

  socket.on('monitoring-started', (data) => {
    console.log('Monitoring started:', data);
    // Initiate call
    socket.emit('call-request', { kioskId: 'KIOSK_01' });
  });

  socket.on('call-request-sent', (data) => {
    console.log('Call request sent:', data);
  });

  socket.on('call-request', (data) => {
    console.log('Incoming call request:', data);
    // Accept call
    socket.emit('call-accept', { kioskId: 'KIOSK_01' });
  });

  socket.on('call-accepted', (data) => {
    console.log('Call accepted:', data);
  });

  socket.on('call-accept-confirmed', (data) => {
    console.log('Call accept confirmed:', data);
  });

  socket.on('call-rejected', (data) => {
    console.log('Call rejected:', data);
  });

  socket.on('call-ended', (data) => {
    console.log('Call ended:', data);
  });

  socket.on('call-end-confirmed', (data) => {
    console.log('Call end confirmed:', data);
  });

  socket.on('video-toggled', (data) => {
    console.log('Video toggled:', data);
  });

  socket.on('audio-toggled', (data) => {
    console.log('Audio toggled:', data);
  });

  // Test functions
  window.testCall = () => {
    socket.emit('call-request', { kioskId: 'KIOSK_01' });
  };

  window.acceptCall = () => {
    socket.emit('call-accept', { kioskId: 'KIOSK_01' });
  };

  window.rejectCall = () => {
    socket.emit('call-reject', { kioskId: 'KIOSK_01' });
  };

  window.endCall = () => {
    socket.emit('call-end', { kioskId: 'KIOSK_01' });
  };

  window.toggleVideo = (enabled) => {
    socket.emit('toggle-video', { kioskId: 'KIOSK_01', enabled });
  };

  window.toggleAudio = (enabled) => {
    socket.emit('toggle-audio', { kioskId: 'KIOSK_01', enabled });
  };
});
```

**Tab 2 - Kiosk:**
```javascript
import('https://cdn.socket.io/4.7.2/socket.io.esm.min.js').then(({ io }) => {
  const socket = io('http://localhost:3000', {
    auth: { token: 'YOUR_KIOSK_TOKEN_HERE' }
  });

  socket.on('connect', () => {
    console.log('Kiosk connected');
    socket.emit('register-kiosk');
  });

  socket.on('kiosk-registered', (data) => {
    console.log('Kiosk registered:', data);
  });

  socket.on('call-request', (data) => {
    console.log('Incoming call request:', data);
    // Accept call
    socket.emit('call-accept', { kioskId: 'KIOSK_01' });
  });

  socket.on('call-accepted', (data) => {
    console.log('Call accepted:', data);
  });

  socket.on('call-rejected', (data) => {
    console.log('Call rejected:', data);
  });

  socket.on('call-ended', (data) => {
    console.log('Call ended:', data);
  });

  socket.on('video-toggled', (data) => {
    console.log('Video toggled:', data);
  });

  socket.on('audio-toggled', (data) => {
    console.log('Audio toggled:', data);
  });

  // Test functions
  window.acceptCall = () => {
    socket.emit('call-accept', { kioskId: 'KIOSK_01' });
  };

  window.rejectCall = () => {
    socket.emit('call-reject', { kioskId: 'KIOSK_01' });
  };

  window.endCall = () => {
    socket.emit('call-end', { kioskId: 'KIOSK_01' });
  };

  window.toggleVideo = (enabled) => {
    socket.emit('toggle-video', { kioskId: 'KIOSK_01', enabled });
  };

  window.toggleAudio = (enabled) => {
    socket.emit('toggle-audio', { kioskId: 'KIOSK_01', enabled });
  };

  window.initiateCall = () => {
    socket.emit('call-request', { kioskId: 'KIOSK_01' });
  };
});
```

### Step 3: Test Scenarios

#### Scenario 1: Monitor Initiates Call
1. In Monitor tab: `testCall()`
2. KIOSK receives `call-request`
3. In Kiosk tab: `acceptCall()`
4. Both receive `call-accepted`

#### Scenario 2: Call Rejection
1. In Monitor tab: `testCall()`
2. In Kiosk tab: `rejectCall()`
3. Monitor receives `call-rejected`

#### Scenario 3: End Call
1. After call is accepted
2. In Monitor tab: `endCall()`
3. Both receive `call-ended`

#### Scenario 4: Media Controls
1. After call is accepted
2. In Monitor tab: `toggleVideo(false)` - Turn off video
3. KIOSK receives `video-toggled`
4. In Kiosk tab: `toggleAudio(false)` - Mute audio
5. MONITOR receives `audio-toggled`

#### Scenario 5: KIOSK Initiates Call
1. In Kiosk tab: `initiateCall()`
2. MONITOR receives `call-request`
3. In Monitor tab: `acceptCall()`
4. Both receive `call-accepted`

---

## 📊 Expected Test Results

### Successful Test Output

```
==============================================================
  Testing Bidirectional Communication Features
==============================================================

[SERVER] Server is running at http://localhost:3000
[STEP 1] Connecting clients...
[KIOSK] KIOSK_01 connected
[KIOSK] Registered successfully
[MONITOR] MONITOR_01 connected
[MONITOR] Registered successfully
[STEP 2] Starting monitoring session...
[MONITOR] Monitoring started for KIOSK_01
[STEP 3] Monitor initiating call...
[MONITOR] Call request sent to KIOSK_01
[KIOSK] Received call request from MONITOR_01
[STEP 4] KIOSK accepting call...
[MONITOR] Call accepted by KIOSK_01
[KIOSK] Call accepted by MONITOR_01
[STEP 5] Testing video toggle...
[MONITOR] Video toggle confirmed: OFF
[KIOSK] Video toggled by MONITOR_01: OFF
[MONITOR] Video toggle confirmed: ON
[KIOSK] Video toggled by MONITOR_01: ON
[STEP 6] Testing audio toggle...
[KIOSK] Audio toggle confirmed: MUTED
[MONITOR] Audio toggled by KIOSK_01: MUTED
[KIOSK] Audio toggle confirmed: UNMUTED
[MONITOR] Audio toggled by KIOSK_01: UNMUTED
[STEP 7] Ending call...
[MONITOR] Call end confirmed for KIOSK_01
[KIOSK] Call ended by MONITOR_01
[STEP 8] Testing call rejection...
[MONITOR] Call request sent to KIOSK_01
[KIOSK] Received call request from MONITOR_01
[MONITOR] Call rejected by KIOSK_01
[STEP 9] KIOSK initiating call...
[KIOSK] Call request sent to KIOSK_01
[MONITOR] Received call request from KIOSK_01
[MONITOR] Call accepted by KIOSK_01
[KIOSK] Call accepted by MONITOR_01
[KIOSK] Call end confirmed for KIOSK_01
[MONITOR] Call ended by KIOSK_01

==============================================================
  Test Results
==============================================================

Kiosk Registered: ✓
Monitor Registered: ✓
Session Started: ✓
Call Request Sent: ✓
Call Request Received: ✓
Call Accepted: ✓
Call Rejected: ✓
Call Ended: ✓
Video Toggled: ✓
Audio Toggled: ✓

✓ All tests passed!
```

---

## 🔍 Troubleshooting

### Server Not Running
```bash
npm start
```

### Connection Errors
- Check server is running on port 3000
- Verify tokens are valid
- Check firewall settings

### Events Not Received
- Check browser console for errors
- Verify both clients are connected
- Check server logs for errors

### Call State Issues
- Ensure session exists before call-request
- Verify call is in correct state (connecting/connected)
- Check session ownership

---

## 📝 Test Checklist

- [ ] KIOSK can register
- [ ] MONITOR can register
- [ ] MONITOR can start monitoring session
- [ ] MONITOR can initiate call
- [ ] KIOSK can receive call request
- [ ] KIOSK can accept call
- [ ] KIOSK can reject call
- [ ] Either party can end call
- [ ] KIOSK can initiate call
- [ ] Video toggle works both ways
- [ ] Audio toggle works both ways
- [ ] Events are received by both parties
- [ ] State transitions work correctly

---

## 🎯 Next Steps

After successful testing:
1. Integrate into Flutter apps
2. Add UI for call controls
3. Add UI for media controls
4. Test with actual WebRTC media streams
5. Test on mobile devices

---

**Happy Testing!** 🚀

