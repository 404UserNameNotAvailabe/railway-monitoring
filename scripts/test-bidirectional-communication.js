#!/usr/bin/env node

/**
 * Test Script: Bidirectional Communication
 * 
 * This script tests the bidirectional communication functionality:
 * 1. Call control events (call-request, call-accept, call-reject, call-end)
 * 2. Media control events (toggle-video, toggle-audio)
 * 3. State management
 * 4. Event flow between monitor and kiosk
 * 
 * Usage:
 *   node scripts/test-bidirectional-communication.js
 * 
 * Make sure the server is running on http://localhost:3000
 */

import {
    io
} from 'socket.io-client';
import {
    generateToken
} from '../src/auth/auth.middleware.js';
import http from 'node:http';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    red: '\x1b[31m'
};

function log(color, label, message) {
    console.log(`${color}${label}${colors.reset} ${message}`);
}

const KIOSK_ID = 'KIOSK_01';
const MONITOR_ID = 'MONITOR_01';

let kioskSocket = null;
let monitorSocket = null;
let testResults = {
    kioskRegistered: false,
    monitorRegistered: false,
    sessionStarted: false,
    callRequestSent: false,
    callRequestReceived: false,
    callAccepted: false,
    callRejected: false,
    callEnded: false,
    videoToggled: false,
    audioToggled: false
};

// Create and register kiosk
async function createKiosk() {
    return new Promise((resolve, reject) => {
        const token = generateToken(KIOSK_ID, 'KIOSK');
        const socket = io(SERVER_URL, {
            auth: {
                token
            }
        });

        socket.on('connect', () => {
            log(colors.green, '[KIOSK]', `${KIOSK_ID} connected`);
            socket.emit('register-kiosk');
        });

        socket.on('kiosk-registered', (data) => {
            log(colors.green, '[KIOSK]', `Registered successfully`);
            testResults.kioskRegistered = true;
            resolve(socket);
        });

        socket.on('call-request', (data) => {
            log(colors.magenta, '[KIOSK]', `Received call request from ${data.fromId}`);
            testResults.callRequestReceived = true;
        });

        socket.on('call-accepted', (data) => {
            log(colors.magenta, '[KIOSK]', `Call accepted by ${data.fromId}`);
            testResults.callAccepted = true;
        });

        socket.on('call-rejected', (data) => {
            log(colors.magenta, '[KIOSK]', `Call rejected by ${data.fromId}`);
            testResults.callRejected = true;
        });

        socket.on('call-ended', (data) => {
            log(colors.magenta, '[KIOSK]', `Call ended by ${data.fromId}`);
            testResults.callEnded = true;
        });

        socket.on('video-toggled', (data) => {
            log(colors.cyan, '[KIOSK]', `Video toggled by ${data.fromId}: ${data.enabled ? 'ON' : 'OFF'}`);
            testResults.videoToggled = true;
        });

        socket.on('audio-toggled', (data) => {
            log(colors.cyan, '[KIOSK]', `Audio toggled by ${data.fromId}: ${data.enabled ? 'UNMUTED' : 'MUTED'}`);
            testResults.audioToggled = true;
        });

        socket.on('error', (error) => {
            log(colors.red, '[ERROR]', `KIOSK Error: ${error.message || JSON.stringify(error)}`);
            if (error.code) {
                log(colors.red, '[ERROR]', `KIOSK Error Code: ${error.code}`);
            }
            // Don't reject on error, just log it
        });

        // Listen for all events for debugging
        socket.onAny((eventName, ...args) => {
            if (eventName !== 'connect' && eventName !== 'disconnect') {
                log(colors.cyan, '[KIOSK EVENT]', `${eventName}: ${JSON.stringify(args[0] || {})}`);
            }
        });

        socket.on('disconnect', () => {
            log(colors.yellow, '[KIOSK]', `Disconnected`);
        });
    });
}

// Create and register monitor
async function createMonitor() {
    return new Promise((resolve, reject) => {
        const token = generateToken(MONITOR_ID, 'MONITOR');
        const socket = io(SERVER_URL, {
            auth: {
                token
            }
        });

        socket.on('connect', () => {
            log(colors.blue, '[MONITOR]', `${MONITOR_ID} connected`);
            socket.emit('register-monitor');
        });

        socket.on('monitor-registered', (data) => {
            log(colors.blue, '[MONITOR]', `Registered successfully`);
            testResults.monitorRegistered = true;
            resolve(socket);
        });

        socket.on('monitoring-started', (data) => {
            log(colors.blue, '[MONITOR]', `Monitoring started for ${data.kioskId}`);
            testResults.sessionStarted = true;
        });

        socket.on('call-request', (data) => {
            log(colors.magenta, '[MONITOR]', `Received call request from ${data.fromId}`);
            testResults.callRequestReceived = true;
        });

        socket.on('call-request-sent', (data) => {
            log(colors.magenta, '[MONITOR]', `Call request sent to ${data.kioskId}`);
            testResults.callRequestSent = true;
        });

        socket.on('call-accepted', (data) => {
            log(colors.magenta, '[MONITOR]', `Call accepted by ${data.fromId}`);
            testResults.callAccepted = true;
        });

        socket.on('call-accept-confirmed', (data) => {
            log(colors.magenta, '[MONITOR]', `Call accept confirmed for ${data.kioskId}`);
        });

        socket.on('call-rejected', (data) => {
            log(colors.magenta, '[MONITOR]', `Call rejected by ${data.fromId}`);
            testResults.callRejected = true;
        });

        socket.on('call-ended', (data) => {
            log(colors.magenta, '[MONITOR]', `Call ended by ${data.fromId}`);
            testResults.callEnded = true;
        });

        socket.on('call-end-confirmed', (data) => {
            log(colors.magenta, '[MONITOR]', `Call end confirmed for ${data.kioskId}`);
        });

        socket.on('video-toggled', (data) => {
            log(colors.cyan, '[MONITOR]', `Video toggled by ${data.fromId}: ${data.enabled ? 'ON' : 'OFF'}`);
            testResults.videoToggled = true;
        });

        socket.on('video-toggle-confirmed', (data) => {
            log(colors.cyan, '[MONITOR]', `Video toggle confirmed: ${data.enabled ? 'ON' : 'OFF'}`);
        });

        socket.on('audio-toggled', (data) => {
            log(colors.cyan, '[MONITOR]', `Audio toggled by ${data.fromId}: ${data.enabled ? 'UNMUTED' : 'MUTED'}`);
            testResults.audioToggled = true;
        });

        socket.on('audio-toggle-confirmed', (data) => {
            log(colors.cyan, '[MONITOR]', `Audio toggle confirmed: ${data.enabled ? 'UNMUTED' : 'MUTED'}`);
        });

        socket.on('error', (error) => {
            log(colors.red, '[ERROR]', `MONITOR Error: ${error.message || JSON.stringify(error)}`);
            if (error.code) {
                log(colors.red, '[ERROR]', `MONITOR Error Code: ${error.code}`);
            }
            // Don't reject on error, just log it
        });

        // Listen for all events for debugging
        socket.onAny((eventName, ...args) => {
            if (eventName !== 'connect' && eventName !== 'disconnect') {
                log(colors.cyan, '[MONITOR EVENT]', `${eventName}: ${JSON.stringify(args[0] || {})}`);
            }
        });

        socket.on('disconnect', () => {
            log(colors.yellow, '[MONITOR]', `Disconnected`);
        });
    });
}

// Wait helper
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Main test function
async function runTests() {
    console.log('\n' + colors.bright + '='.repeat(70) + colors.reset);
    console.log(colors.bright + '  Testing Bidirectional Communication Features' + colors.reset);
    console.log('='.repeat(70) + '\n');

    try {
        // Step 1: Connect both clients
        log(colors.blue, '[STEP 1]', 'Connecting clients...');
        kioskSocket = await createKiosk();
        await wait(500);
        monitorSocket = await createMonitor();
        await wait(1000);

        // Step 2: Start monitoring session
        log(colors.blue, '[STEP 2]', 'Starting monitoring session...');
        monitorSocket.emit('start-monitoring', {
            kioskId: KIOSK_ID
        });
        await wait(2000); // Give more time for session to be fully established

        // Step 3: Monitor initiates call
        log(colors.blue, '[STEP 3]', 'Monitor initiating call...');
        log(colors.cyan, '[DEBUG]', `Emitting call-request with kioskId: ${KIOSK_ID}`);
        monitorSocket.emit('call-request', {
            kioskId: KIOSK_ID
        });
        await wait(2000);

        // Step 4: KIOSK accepts call
        log(colors.blue, '[STEP 4]', 'KIOSK accepting call...');
        kioskSocket.emit('call-accept', {
            kioskId: KIOSK_ID
        });
        await wait(2000);

        // Step 5: Test media controls - Toggle video
        log(colors.blue, '[STEP 5]', 'Testing video toggle...');
        monitorSocket.emit('toggle-video', {
            kioskId: KIOSK_ID,
            enabled: false
        });
        await wait(1000);
        monitorSocket.emit('toggle-video', {
            kioskId: KIOSK_ID,
            enabled: true
        });
        await wait(1500);

        // Step 6: Test media controls - Toggle audio
        log(colors.blue, '[STEP 6]', 'Testing audio toggle...');
        kioskSocket.emit('toggle-audio', {
            kioskId: KIOSK_ID,
            enabled: false
        });
        await wait(1000);
        kioskSocket.emit('toggle-audio', {
            kioskId: KIOSK_ID,
            enabled: true
        });
        await wait(1500);

        // Step 7: End call
        log(colors.blue, '[STEP 7]', 'Ending call...');
        monitorSocket.emit('call-end', {
            kioskId: KIOSK_ID
        });
        await wait(2000);

        // Step 8: Test call rejection scenario
        log(colors.blue, '[STEP 8]', 'Testing call rejection...');
        monitorSocket.emit('call-request', {
            kioskId: KIOSK_ID
        });
        await wait(1500);
        kioskSocket.emit('call-reject', {
            kioskId: KIOSK_ID
        });
        await wait(1500);

        // Step 9: Test KIOSK initiating call
        log(colors.blue, '[STEP 9]', 'KIOSK initiating call...');
        kioskSocket.emit('call-request', {
            kioskId: KIOSK_ID
        });
        await wait(1500);
        monitorSocket.emit('call-accept', {
            kioskId: KIOSK_ID
        });
        await wait(1500);
        kioskSocket.emit('call-end', {
            kioskId: KIOSK_ID
        });
        await wait(2000);

        // Print test results
        console.log('\n' + colors.bright + '='.repeat(70) + colors.reset);
        console.log(colors.bright + '  Test Results' + colors.reset);
        console.log('='.repeat(70) + '\n');

        console.log(`Kiosk Registered: ${testResults.kioskRegistered ? '✓' : '✗'}`);
        console.log(`Monitor Registered: ${testResults.monitorRegistered ? '✓' : '✗'}`);
        console.log(`Session Started: ${testResults.sessionStarted ? '✓' : '✗'}`);
        console.log(`Call Request Sent: ${testResults.callRequestSent ? '✓' : '✗'}`);
        console.log(`Call Request Received: ${testResults.callRequestReceived ? '✓' : '✗'}`);
        console.log(`Call Accepted: ${testResults.callAccepted ? '✓' : '✗'}`);
        console.log(`Call Rejected: ${testResults.callRejected ? '✓' : '✗'}`);
        console.log(`Call Ended: ${testResults.callEnded ? '✓' : '✗'}`);
        console.log(`Video Toggled: ${testResults.videoToggled ? '✓' : '✗'}`);
        console.log(`Audio Toggled: ${testResults.audioToggled ? '✓' : '✗'}`);

        const allPassed =
            testResults.kioskRegistered &&
            testResults.monitorRegistered &&
            testResults.sessionStarted &&
            testResults.callRequestSent &&
            testResults.callRequestReceived &&
            testResults.callAccepted &&
            testResults.callRejected &&
            testResults.callEnded &&
            testResults.videoToggled &&
            testResults.audioToggled;

        console.log('\n' + (allPassed ? colors.green : colors.red) +
            (allPassed ? '✓ All tests passed!' : '✗ Some tests failed!') +
            colors.reset + '\n');

        // Cleanup
        log(colors.yellow, '[CLEANUP]', 'Disconnecting clients...');
        kioskSocket.disconnect();
        monitorSocket.disconnect();

        await wait(1000);
        process.exit(allPassed ? 0 : 1);

    } catch (error) {
        log(colors.red, '[FATAL ERROR]', error.message);
        console.error(error);
        process.exit(1);
    }
}

// Check if server is running
async function checkServer() {
    return new Promise((resolve) => {
        const url = new URL(SERVER_URL);
        const options = {
            hostname: url.hostname,
            port: url.port || 3000,
            path: '/health',
            method: 'GET',
            timeout: 5000 // Increased timeout to 5 seconds
        };

        let resolved = false;

        const req = http.request(options, (res) => {
            if (resolved) return;
            resolved = true;

            // Consume response data to prevent hanging
            res.on('data', () => {});
            res.on('end', () => {});

            if (res.statusCode === 200) {
                log(colors.green, '[SERVER]', `Server is running at ${SERVER_URL}`);
                resolve(true);
            } else {
                log(colors.red, '[ERROR]', `Server returned status ${res.statusCode}`);
                resolve(false);
            }
        });

        req.on('error', (error) => {
            if (resolved) return;
            resolved = true;

            // Don't treat ECONNREFUSED as fatal if server might be starting
            if (error.code === 'ECONNREFUSED') {
                log(colors.yellow, '[WARN]', `Cannot connect to server at ${SERVER_URL}`);
                log(colors.yellow, '[INFO]', 'Make sure the server is running: npm start');
            } else {
                log(colors.red, '[ERROR]', `Connection error: ${error.message}`);
            }
            resolve(false);
        });

        req.on('timeout', () => {
            if (resolved) return;
            resolved = true;

            req.destroy();
            log(colors.yellow, '[WARN]', 'Server health check timeout (server may still be starting)');
            log(colors.yellow, '[INFO]', 'Attempting to continue anyway...');
            // Don't fail - allow test to proceed as server might be slow to respond
            resolve(true);
        });

        req.setTimeout(options.timeout);
        req.end();
    });
}

// Run the tests
const serverRunning = await checkServer();
if (!serverRunning) {
    process.exit(1);
}
await runTests();