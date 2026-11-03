/**
 * Module that manages time syncing with server.
 * @module components/syncPlay/core/timeSync/TimeSyncServer
 */

import Events from '../../../../utils/events.ts';
import TimeSync from './TimeSync';

const MessageType = 'SyncPlayTimeSync';
const WebSocketTimeout = 2000; // milliseconds
const HttpTimeout = 5000; // milliseconds

/**
 * Class that manages time syncing with server.
 */
class TimeSyncServer extends TimeSync {
    constructor(syncPlayManager) {
        super(syncPlayManager);
        this.useWebSocket = true; // Servers without support for it never answer.
        this.lastRequestId = 0;
        this.pendingRequests = new Map();
        this.boundApiClients = new WeakSet();
    }

    /**
     * Makes a ping request to the server. The WebSocket is preferred, as it is the connection that
     * delivers the group commands, and a reverse proxy adds much less to it than to a new request.
     */
    requestPing() {
        const apiClient = this.manager.getApiClient();

        if (this.useWebSocket && apiClient.isWebSocketOpen()) {
            return this.requestPingWebSocket(apiClient).catch((error) => {
                console.debug('SyncPlay TimeSyncServer: falling back to HTTP:', error);
                this.useWebSocket = false;
                return this.requestPingHttp(apiClient);
            });
        }

        return this.requestPingHttp(apiClient);
    }

    /**
     * Allows using the WebSocket again and takes new measurements, after the connection changed.
     */
    onConnectionRestored() {
        this.useWebSocket = true;
        this.forceUpdate();
    }

    requestPingWebSocket(apiClient) {
        this.bindApiClient(apiClient);

        return new Promise((resolve, reject) => {
            const requestId = ++this.lastRequestId;
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error('Time sync request timed out.'));
            }, WebSocketTimeout);

            this.pendingRequests.set(requestId, { requestSent: new Date(), timeout, resolve });

            try {
                apiClient.sendWebSocketMessage(MessageType, requestId);
            } catch (error) {
                clearTimeout(timeout);
                this.pendingRequests.delete(requestId);
                reject(error);
            }
        });
    }

    bindApiClient(apiClient) {
        if (this.boundApiClients.has(apiClient)) return;
        this.boundApiClients.add(apiClient);

        Events.on(apiClient, 'message', (_event, msg) => {
            if (msg.MessageType !== MessageType) return;

            const responseReceived = new Date();
            const { RequestId, RequestReceptionTime, ResponseTransmissionTime } = msg.Data;
            const pending = this.pendingRequests.get(RequestId);
            if (!pending) return;

            this.pendingRequests.delete(RequestId);
            clearTimeout(pending.timeout);
            pending.resolve({
                requestSent: pending.requestSent,
                requestReceived: new Date(RequestReceptionTime),
                responseSent: new Date(ResponseTransmissionTime),
                responseReceived
            });
        });
    }

    requestPingHttp(apiClient) {
        const requestSent = new Date();
        let responseReceived;
        const request = apiClient.getServerTime().then((response) => {
            responseReceived = new Date();
            return response.json();
        }).then((data) => {
            const requestReceived = new Date(data.RequestReceptionTime);
            const responseSent = new Date(data.ResponseTransmissionTime);
            return {
                requestSent: requestSent,
                requestReceived: requestReceived,
                responseSent: responseSent,
                responseReceived: responseReceived
            };
        });

        // A request stuck in a proxy must not stop the polling.
        let timeout;
        const expired = new Promise((_resolve, reject) => {
            timeout = setTimeout(() => reject(new Error('Time sync request timed out.')), HttpTimeout);
        });
        return Promise.race([request, expired]).finally(() => clearTimeout(timeout));
    }
}

export default TimeSyncServer;
