# Quick Test Instructions

## To Test Bidirectional Communication:

### Step 1: Start the Server
```bash
npm start
```

Keep this terminal open - you'll see server logs here.

### Step 2: Run the Test (in another terminal)
```bash
npm run test:bidirectional
```

### Step 3: Check Results

**Expected Server Logs:**
You should see in the server terminal:
- `[Call] Call request received`
- `[Call] Call request forwarded`
- `[Call] Call accept received`
- `[Call] Call accepted`
- `[Media] Toggle video received`
- `[Media] Toggle audio received`
- `[Call] Call end received`

**Expected Test Output:**
- All checkmarks (✓) for successful tests
- Colored output showing events

### Troubleshooting

If events aren't received:
1. **Check server is running** - You should see server startup message
2. **Check server logs** - Look for error messages
3. **Verify session exists** - Session must be created before call-request
4. **Check timing** - Events might need more time to propagate

### Manual Verification

You can also test manually using browser console (see TESTING_BIDIRECTIONAL.md for details).

