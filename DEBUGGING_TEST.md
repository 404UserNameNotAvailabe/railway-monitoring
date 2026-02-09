# Debugging the Bidirectional Communication Test

## Current Issue

The test shows:
- ✅ Clients connect and register successfully
- ✅ Session starts successfully  
- ❌ Call/media events are not being received

## How to Debug

### Step 1: Check Server Logs

When you run `npm start`, you should see server logs. Look for:

**When test emits `call-request`:**
```
[Call] Call request received | {"fromId":"MONITOR_01","role":"MONITOR","kioskId":"KIOSK_01",...}
```

**If validation fails, you'll see:**
```
[Error] Socket error emitted | {"code":"SIGNALING_NO_SESSION",...}
```

**If successful, you'll see:**
```
[Call] Call request forwarded | {"fromId":"MONITOR_01","toId":"KIOSK_01",...}
```

### Step 2: Common Issues

#### Issue 1: Session Not Found
**Error:** `SIGNALING_NO_SESSION`
**Cause:** Session might not be fully created when call-request is sent
**Fix:** Add delay after `start-monitoring` (already done in test)

#### Issue 2: Target Socket Not Found
**Error:** `SIGNALING_INVALID_TARGET`
**Cause:** Kiosk socket ID not found in state
**Check:** Verify kiosk is registered and socket ID is stored

#### Issue 3: Validation Errors
**Error:** Various error codes
**Cause:** Session ownership validation failing
**Check:** Verify session.monitorSocketId matches monitor's socket.id

### Step 3: Manual Verification

1. **Start server with verbose logging:**
   ```bash
   DEBUG=true npm start
   ```

2. **Run test in another terminal:**
   ```bash
   npm run test:bidirectional
   ```

3. **Watch server terminal for:**
   - `[Call]` log entries
   - `[Error]` log entries  
   - `[Media]` log entries

### Step 4: Check Server State

The server should have:
- Kiosk registered: `kiosksState.getKiosk('KIOSK_01')` should return kiosk with socketId
- Session created: `sessionsState.getSession('KIOSK_01')` should return session
- Monitor socket ID matches: `session.monitorSocketId === monitorSocket.id`

## Quick Fixes to Try

### Fix 1: Increase Delays
The test already has delays, but you can increase them in the test script if needed.

### Fix 2: Check Server is Running
Make sure the server is actually running and accessible on port 3000.

### Fix 3: Verify Event Names
Make sure event names match exactly:
- Client emits: `call-request`
- Server listens: `socket.on('call-request', ...)`
- Server emits: `call-request-sent`
- Client listens: `socket.on('call-request-sent', ...)`

## Expected Server Logs (Success)

```
[Call] Call request received | {"fromId":"MONITOR_01",...}
[Call] Call request forwarded | {"fromId":"MONITOR_01","toId":"KIOSK_01",...}
[Call] Call accept received | {"fromId":"KIOSK_01",...}
[Call] Call accepted | {"kioskId":"KIOSK_01",...}
[Media] Toggle video received | {"fromId":"MONITOR_01",...}
[Media] Video toggled | {"kioskId":"KIOSK_01",...}
[Media] Toggle audio received | {"fromId":"KIOSK_01",...}
[Media] Audio toggled | {"kioskId":"KIOSK_01",...}
[Call] Call end received | {"fromId":"MONITOR_01",...}
[Call] Call ended | {"kioskId":"KIOSK_01",...}
```

## Next Steps

1. **Check server terminal** when running the test
2. **Look for error logs** - they'll tell you what's failing
3. **Verify session exists** - check if session is created properly
4. **Check socket IDs** - verify kiosk socket ID is stored correctly

The test script is working correctly - the issue is likely on the server side validation or event processing.

