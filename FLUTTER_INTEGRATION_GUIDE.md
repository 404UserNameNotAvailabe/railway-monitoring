# Flutter Integration Guide: Multiple Kiosks & Monitor Visibility

This guide explains how to integrate the multiple kiosks functionality and monitor visibility into your Flutter application.

---

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Mechanism & Flow](#mechanism--flow)
3. [Integration Approach](#integration-approach)
4. [Detailed Mechanism Flow](#detailed-mechanism-flow)
5. [State Management Patterns](#state-management-patterns)
6. [Key Considerations](#key-considerations)
7. [Implementation Checklist](#implementation-checklist)
8. [Testing Strategy](#testing-strategy)

---

## 🏗️ Architecture Overview

### Backend (Already Done ✅)

Your backend provides:
- **WebRTC Signaling Server** - Handles video streaming setup
- **Socket.IO Server** - Real-time communication
- **State Management** - Tracks kiosks, monitors, and sessions
- **Event Broadcasting** - Sends real-time updates to monitors

### Flutter App Components Needed

1. **Socket.IO Client Connection** - Connect to backend
2. **Authentication Service** - Handle login/token management
3. **State Management** - Manage kiosk list state (Provider/Riverpod/Bloc)
4. **UI Components** - Display kiosk list with real-time updates
5. **Real-time Updates Handler** - Process incoming events

---

## 🔄 Mechanism & Flow

### 1. Authentication Phase

**Monitor App:**
- Call `/api/auth/login` or `/api/auth/device-token` endpoint
- Receive JWT token in response
- Store token securely (SharedPreferences or Flutter Secure Storage)

**Kiosk App:**
- Same authentication flow
- Get token with `role: KIOSK`

### 2. Socket.IO Connection Setup

**Connection Process:**
1. Initialize Socket.IO client with server URL
2. Include JWT token in connection auth
3. Handle connection lifecycle:
   - `connect` → Connection established
   - `disconnect` → Handle reconnection logic
   - `error` → Show error, implement retry mechanism

**Connection Configuration:**
- Server URL: `http://your-server:3000`
- Authentication: Include token in `auth` parameter
- Auto-reconnect: Enable automatic reconnection on disconnect

### 3. Registration Flow

**Monitor App:**
1. Connect to Socket.IO server
2. On successful `connect` event → Emit `register-monitor`
3. Listen for `monitor-registered` event → Receive initial kiosk list
4. Store kiosk list in app state

**Kiosk App:**
1. Connect to Socket.IO server
2. On successful `connect` event → Emit `register-kiosk`
3. Listen for `kiosk-registered` event → Confirmation received

### 4. Real-time Updates Mechanism

**Monitor App Listens For:**
- `kiosk-online` → Add new kiosk to list
- `kiosk-offline` → Remove kiosk from list or mark as offline
- `online-kiosks-list` → Response to manual list request

**State Update Pattern:**
```
Initial State: []
↓
monitor-registered → [KIOSK_01, KIOSK_02]
↓
kiosk-online (KIOSK_03) → [KIOSK_01, KIOSK_02, KIOSK_03]
↓
kiosk-offline (KIOSK_01) → [KIOSK_02, KIOSK_03]
```

### 5. Requesting Kiosk List On Demand

**User Action:**
- User taps refresh button
- User pulls down to refresh
- App needs to sync after reconnection

**Process:**
1. Emit `get-online-kiosks` event
2. Listen for `online-kiosks-list` response
3. Update state with fresh kiosk list

---

## 🛠️ Integration Approach

### Step 1: Add Dependencies

Add to `pubspec.yaml`:

```yaml
dependencies:
  # Socket.IO client
  socket_io_client: ^2.0.3
  
  # State Management (choose one)
  provider: ^6.1.1
  # OR
  flutter_riverpod: ^2.4.9
  # OR
  flutter_bloc: ^8.1.3
  
  # Secure Storage
  shared_preferences: ^2.2.2
  # OR
  flutter_secure_storage: ^9.0.0
  
  # HTTP Client
  http: ^1.1.0
  # OR
  dio: ^5.4.0
```

### Step 2: Create Service Layer

#### 1. Authentication Service

**Responsibilities:**
- Make login/device-token API calls
- Store and retrieve JWT tokens
- Validate token expiration
- Handle token refresh

**Key Methods:**
- `login(username, password)` → Returns token
- `getStoredToken()` → Retrieve saved token
- `isTokenValid()` → Check expiration
- `logout()` → Clear token

#### 2. Socket Service

**Responsibilities:**
- Manage Socket.IO connection lifecycle
- Emit events to server
- Listen for server events
- Handle reconnection logic
- Error handling

**Key Methods:**
- `connect(token)` → Establish connection
- `disconnect()` → Close connection
- `emit(event, data)` → Send event
- `on(event, callback)` → Listen for event
- `isConnected()` → Check connection status

#### 3. Kiosk Service

**Responsibilities:**
- Manage kiosk list state
- CRUD operations on kiosk list
- Filtering and sorting
- Status management

**Key Methods:**
- `getKiosks()` → Get current list
- `addKiosk(kiosk)` → Add to list
- `removeKiosk(kioskId)` → Remove from list
- `updateKioskStatus(kioskId, status)` → Update status

### Step 3: State Management Structure

#### Monitor App State

```dart
// Kiosk Model
class Kiosk {
  final String kioskId;
  final DateTime connectedAt;
  final DateTime? lastSeenAt;
  final String status; // 'online' or 'offline'
}

// State Class
class KioskListState {
  final List<Kiosk> kiosks;
  final bool isLoading;
  final String? error;
  final DateTime lastUpdated;
  
  KioskListState({
    required this.kiosks,
    this.isLoading = false,
    this.error,
    required this.lastUpdated,
  });
}
```

### Step 4: Event Handling Strategy

**Centralized Handler Approach:**
- Single Socket.IO connection managed by service
- Events routed to appropriate handlers
- State updated through state management
- UI automatically rebuilds

**Event Flow:**
```
Socket Event → Handler → State Update → UI Rebuild
```

**Event Mapping:**
- `monitor-registered` → Update initial kiosk list
- `kiosk-online` → Add kiosk to list
- `kiosk-offline` → Remove/update kiosk in list
- `online-kiosks-list` → Replace entire list

### Step 5: UI Components

#### 1. Kiosk List Screen

**Features:**
- ListView or GridView displaying kiosks
- Status indicators (online/offline badges)
- Refresh button
- Pull-to-refresh functionality
- Empty state when no kiosks
- Loading state during fetch

**Layout:**
```
┌─────────────────────────┐
│  Kiosk List      [🔄]   │
├─────────────────────────┤
│  🟢 KIOSK_01            │
│     Connected: 10:30 AM │
├─────────────────────────┤
│  🟢 KIOSK_02            │
│     Connected: 10:25 AM │
├─────────────────────────┤
│  🔴 KIOSK_03            │
│     Offline             │
└─────────────────────────┘
```

#### 2. Kiosk Item Widget

**Displays:**
- Kiosk ID/Name
- Status badge (green = online, red = offline)
- Connection timestamp
- Last seen timestamp
- Tap action → Navigate to monitoring screen

#### 3. Real-time Updates

**Visual Feedback:**
- Auto-refresh when events received
- Smooth animations for add/remove
- Toast notifications for new kiosks
- Badge count for new kiosks

---

## 🔍 Detailed Mechanism Flow

### Scenario 1: Monitor Opens App

**Step-by-Step:**

1. **App Starts**
   - Check for stored authentication token
   - If token exists → Proceed to connection
   - If no token → Show login screen

2. **Login Process**
   - User enters credentials
   - Call `/api/auth/login` endpoint
   - Receive JWT token
   - Store token securely

3. **Socket.IO Connection**
   - Initialize Socket.IO client
   - Include token in connection auth
   - Connect to server

4. **Registration**
   - On `connect` event → Emit `register-monitor`
   - Wait for `monitor-registered` response

5. **Initial Data**
   - Receive `monitor-registered` with `onlineKiosks` array
   - Update app state with kiosk list
   - Display kiosks in UI

### Scenario 2: New Kiosk Comes Online

**Step-by-Step:**

1. **Kiosk Connects**
   - Kiosk app connects and registers
   - Backend adds kiosk to state

2. **Backend Broadcast**
   - Backend emits `kiosk-online` to all monitors
   - Event includes: `{ kioskId, timestamp }`

3. **Monitor Receives Event**
   - Socket.IO client receives `kiosk-online` event
   - Event handler processes the event

4. **State Update**
   - Handler adds new kiosk to state
   - State management notifies listeners

5. **UI Update**
   - UI automatically rebuilds
   - New kiosk appears in list
   - Optional: Show notification/badge

### Scenario 3: Kiosk Goes Offline

**Step-by-Step:**

1. **Kiosk Disconnects**
   - Kiosk loses connection
   - Backend detects disconnect

2. **Backend Broadcast**
   - Backend emits `kiosk-offline` to all monitors
   - Event includes: `{ kioskId, timestamp, reason }`

3. **Monitor Receives Event**
   - Socket.IO client receives `kiosk-offline` event
   - Event handler processes the event

4. **State Update**
   - Handler removes kiosk from list OR marks as offline
   - State management notifies listeners

5. **UI Update**
   - UI automatically rebuilds
   - Kiosk removed or marked offline
   - Optional: Show notification

### Scenario 4: User Refreshes List

**Step-by-Step:**

1. **User Action**
   - User taps refresh button
   - OR pulls down to refresh

2. **Request Sent**
   - App emits `get-online-kiosks` event
   - Show loading indicator

3. **Backend Response**
   - Backend responds with `online-kiosks-list`
   - Event includes: `{ kiosks: [...], count, timestamp }`

4. **State Update**
   - Handler replaces entire kiosk list
   - Update `lastUpdated` timestamp

5. **UI Update**
   - Hide loading indicator
   - Display updated list
   - Show last updated time

---

## 📊 State Management Patterns

### Option 1: Provider Pattern

**Structure:**
```
KioskListProvider (ChangeNotifier)
  - List<Kiosk> kiosks
  - Methods: addKiosk, removeKiosk, refreshList
  
SocketServiceProvider (ChangeNotifier)
  - Socket connection management
  - Event handling
```

**Usage:**
- Wrap app with `MultiProvider`
- Access providers using `Provider.of` or `Consumer`
- UI automatically rebuilds on state changes

### Option 2: Riverpod Pattern

**Structure:**
```
kioskListProvider (StateNotifierProvider)
  - Manages kiosk list state
  
socketServiceProvider (Provider)
  - Manages Socket.IO connection
```

**Usage:**
- Better type safety
- Async state handling
- Dependency injection
- Use `ConsumerWidget` or `Consumer`

### Option 3: BLoC Pattern

**Structure:**
```
KioskListBloc
  - Events: LoadKiosks, KioskOnline, KioskOffline
  - States: KioskListInitial, KioskListLoaded, KioskListError
  
SocketBloc
  - Events: Connect, Disconnect, EmitEvent
  - States: SocketConnected, SocketDisconnected
```

**Usage:**
- Event-driven architecture
- Clear separation of concerns
- Use `BlocBuilder` or `BlocConsumer` in UI

---

## ⚠️ Key Considerations

### 1. Connection Lifecycle Management

**Challenges:**
- App goes to background → Connection may drop
- App comes to foreground → Need to reconnect
- Network changes → Handle reconnection
- Token expiration → Re-authenticate

**Solutions:**
- Use `WidgetsBindingObserver` to detect app lifecycle
- Implement reconnection logic
- Monitor network connectivity
- Handle token refresh

### 2. Error Handling

**Error Types:**
- Network errors (no internet)
- Authentication errors (invalid token)
- Socket.IO errors (connection failed)
- Server errors (500, 503)

**Handling Strategy:**
- Show user-friendly error messages
- Implement retry mechanisms
- Log errors for debugging
- Graceful degradation (show cached data)

### 3. Performance Optimization

**Optimizations:**
- Efficient list updates (don't rebuild entire list)
- Debounce rapid events
- Cache kiosk data locally
- Lazy loading for large lists
- Use `ListView.builder` for long lists

### 4. User Experience

**UX Features:**
- Loading states (show spinners)
- Empty states (no kiosks message)
- Error states (retry button)
- Offline indicators
- Smooth animations
- Pull-to-refresh
- Swipe actions

### 5. Security

**Security Measures:**
- Store tokens securely (use Flutter Secure Storage)
- Implement token refresh mechanism
- Validate server responses
- Handle expired tokens gracefully
- Use HTTPS in production

---

## ✅ Implementation Checklist

### Phase 1: Foundation

- [ ] Add Socket.IO dependency to `pubspec.yaml`
- [ ] Add state management dependency
- [ ] Add secure storage dependency
- [ ] Create authentication service
- [ ] Create Socket.IO service wrapper
- [ ] Implement token storage mechanism

### Phase 2: Core Functionality

- [ ] Implement Socket.IO connection logic
- [ ] Handle `connect` and `disconnect` events
- [ ] Implement registration events (`register-monitor`, `register-kiosk`)
- [ ] Create Kiosk model class
- [ ] Implement state management (Provider/Riverpod/BLoC)
- [ ] Create kiosk list state class

### Phase 3: Real-time Updates

- [ ] Listen for `monitor-registered` event
- [ ] Listen for `kiosk-online` event
- [ ] Listen for `kiosk-offline` event
- [ ] Update state on each event
- [ ] Implement `get-online-kiosks` request
- [ ] Handle `online-kiosks-list` response

### Phase 4: UI Implementation

- [ ] Create kiosk list screen
- [ ] Create kiosk item widget
- [ ] Add status indicators (online/offline badges)
- [ ] Implement refresh functionality
- [ ] Add pull-to-refresh
- [ ] Create empty state widget
- [ ] Create loading state widget
- [ ] Create error state widget

### Phase 5: Polish & Testing

- [ ] Add loading states throughout
- [ ] Implement comprehensive error handling
- [ ] Add smooth animations
- [ ] Add notifications for new kiosks
- [ ] Test with multiple kiosks
- [ ] Test kiosk going offline
- [ ] Test network interruptions
- [ ] Test app backgrounding/foregrounding
- [ ] Test token expiration
- [ ] Performance testing

---

## 🧪 Testing Strategy

### 1. Unit Tests

**Test:**
- State management logic
- Event handlers
- Data transformations
- Model classes

**Example:**
- Test adding kiosk to list
- Test removing kiosk from list
- Test state updates

### 2. Integration Tests

**Test:**
- Socket.IO connection
- Event flow
- State updates
- API calls

**Example:**
- Test connection → registration → receive list
- Test receiving `kiosk-online` event
- Test requesting list on demand

### 3. Manual Testing

**Scenarios:**
- Multiple kiosks connecting simultaneously
- Kiosks going offline
- Network interruptions
- App backgrounding
- Token expiration
- Reconnection after disconnect

**Test Cases:**
1. Open monitor app → Should see all online kiosks
2. Connect new kiosk → Should appear in list
3. Disconnect kiosk → Should disappear from list
4. Pull to refresh → Should update list
5. Lose network → Should show error
6. Regain network → Should reconnect automatically

---

## 📝 Summary

### The Mechanism

**How It Works:**
1. **Socket.IO** provides real-time bidirectional communication
2. **Events** flow from backend to Flutter app
3. **State Management** updates app state on events
4. **UI** automatically rebuilds when state changes

### The Flow

```
Connect → Register → Listen → Update → Display
```

### The Key

**Centralized State Management** that reacts to Socket.IO events and updates UI automatically.

### The Approach

1. **Service Layer** → Handle Socket.IO and API calls
2. **State Management** → Manage kiosk list state
3. **Event Handlers** → Process incoming events
4. **UI Components** → Display data and handle user actions

---

## 🚀 Next Steps

1. **Start with Foundation** → Set up dependencies and services
2. **Implement Core** → Socket.IO connection and state management
3. **Add Real-time** → Event listeners and handlers
4. **Build UI** → Kiosk list screen and components
5. **Polish** → Error handling, animations, testing

---

## 📚 Additional Resources

- [Socket.IO Client Documentation](https://pub.dev/packages/socket_io_client)
- [Provider Documentation](https://pub.dev/packages/provider)
- [Riverpod Documentation](https://riverpod.dev/)
- [BLoC Documentation](https://bloclibrary.dev/)
- [Flutter Secure Storage](https://pub.dev/packages/flutter_secure_storage)

---

## 💡 Tips

1. **Start Simple** → Get basic connection working first
2. **Test Incrementally** → Test each feature as you build
3. **Handle Errors** → Always implement error handling
4. **User Feedback** → Show loading states and errors
5. **Performance** → Optimize list rendering for large datasets
6. **Security** → Never store tokens in plain text

---

**Good luck with your integration!** 🎉

