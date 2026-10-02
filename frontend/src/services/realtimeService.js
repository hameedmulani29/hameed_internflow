import { getSession } from './publicExperience';

/**
 * Real-Time Internship Subscription Service
 * Subscribes connected intern/candidate clients to backend WebSocket stream.
 * Automatically handles connection, events, and reconnection backoff.
 */
export function subscribeToInternships({ onInternshipPublished, onReconnect }) {
  let ws = null;
  let retryCount = 0;
  let maxRetries = 10;
  let retryTimer = null;
  let isClosedIntentionally = false;

  function getWsUrl() {
    const session = getSession();
    const token = session?.token || '';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/api/internships/ws?token=${encodeURIComponent(token)}`;
  }

  function connect() {
    if (isClosedIntentionally) return;
    const url = getWsUrl();

    try {
      ws = new WebSocket(url);

      ws.onopen = () => {
        if (retryCount > 0 && typeof onReconnect === 'function') {
          onReconnect();
        }
        retryCount = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.type === 'internship_published' && data.internship) {
            if (typeof onInternshipPublished === 'function') {
              onInternshipPublished(data.internship);
            }
          }
        } catch (err) {
          console.error('[RealTime] Error parsing event message:', err);
        }
      };

      ws.onerror = () => {
        // Connection error triggers onclose reconnect logic
      };

      ws.onclose = () => {
        if (isClosedIntentionally) return;
        if (retryCount < maxRetries) {
          const delay = Math.min(1000 * Math.pow(1.5, retryCount), 10000);
          retryCount++;
          retryTimer = setTimeout(connect, delay);
        }
      };
    } catch {
      if (retryCount < maxRetries) {
        retryCount++;
        retryTimer = setTimeout(connect, 2000);
      }
    }
  }

  connect();

  return function unsubscribe() {
    isClosedIntentionally = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (ws) {
      ws.close();
    }
  };
}

/**
 * Real-Time Intern Event WebSocket Subscription Service
 *
 * Mirrors subscribeToMentorMonitoring for the intern role: receives the same
 * activity events (task assigned/started/submitted/completed, review
 * decisions, mentor feedback) about the intern's own internship so the UI
 * updates without a manual refresh. Automatic reconnection with backoff;
 * consumers get onConnect/onDisconnect/onReconnect to surface connection
 * state without blocking rendering.
 */
export function subscribeToInternEvents({ onEvent, onConnect, onDisconnect, onReconnect }) {
  let ws = null;
  let retryCount = 0;
  const maxRetries = 10;
  let retryTimer = null;
  let isClosedIntentionally = false;

  function getWsUrl() {
    const session = getSession();
    const token = session?.token || '';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/api/ws/intern?token=${encodeURIComponent(token)}`;
  }

  function connect() {
    if (isClosedIntentionally) return;
    const url = getWsUrl();

    try {
      ws = new WebSocket(url);

      ws.onopen = () => {
        if (typeof onConnect === 'function') {
          onConnect();
        }
        if (retryCount > 0 && typeof onReconnect === 'function') {
          onReconnect();
        }
        retryCount = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && typeof onEvent === 'function') {
            onEvent(data);
          }
        } catch (err) {
          console.error('[InternEvents] Error parsing event message:', err);
        }
      };

      ws.onerror = () => {
        // Connection error triggers onclose reconnect logic
      };

      ws.onclose = () => {
        if (typeof onDisconnect === 'function') {
          onDisconnect();
        }
        if (isClosedIntentionally) return;
        if (retryCount < maxRetries) {
          const delay = Math.min(1000 * Math.pow(1.5, retryCount), 10000);
          retryCount++;
          retryTimer = setTimeout(connect, delay);
        }
      };
    } catch {
      if (typeof onDisconnect === 'function') {
        onDisconnect();
      }
      if (retryCount < maxRetries) {
        retryCount++;
        retryTimer = setTimeout(connect, 2000);
      }
    }
  }

  connect();

  return function unsubscribe() {
    isClosedIntentionally = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (ws) {
      ws.close();
    }
  };
}

/**
 * Real-Time Mentor Monitoring WebSocket Subscription Service
 * Subscribes connected mentor clients to their authorized monitoring stream.
 * Automatically handles reconnection, state sync triggers, and event callbacks.
 */
export function subscribeToMentorMonitoring({ onEvent, onConnect, onDisconnect, onReconnect }) {
  let ws = null;
  let retryCount = 0;
  const maxRetries = 10;
  let retryTimer = null;
  let isClosedIntentionally = false;

  function getWsUrl() {
    const session = getSession();
    const token = session?.token || '';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/api/ws/mentor?token=${encodeURIComponent(token)}`;
  }

  function connect() {
    if (isClosedIntentionally) return;
    const url = getWsUrl();

    try {
      ws = new WebSocket(url);

      ws.onopen = () => {
        if (typeof onConnect === 'function') {
          onConnect();
        }
        if (retryCount > 0 && typeof onReconnect === 'function') {
          onReconnect();
        }
        retryCount = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && typeof onEvent === 'function') {
            onEvent(data);
          }
        } catch (err) {
          console.error('[MentorMonitoring] Error parsing event message:', err);
        }
      };

      ws.onerror = () => {
        // Connection error triggers onclose reconnect logic
      };

      ws.onclose = () => {
        if (typeof onDisconnect === 'function') {
          onDisconnect();
        }
        if (isClosedIntentionally) return;
        if (retryCount < maxRetries) {
          const delay = Math.min(1000 * Math.pow(1.5, retryCount), 10000);
          retryCount++;
          retryTimer = setTimeout(connect, delay);
        }
      };
    } catch {
      if (typeof onDisconnect === 'function') {
        onDisconnect();
      }
      if (retryCount < maxRetries) {
        retryCount++;
        retryTimer = setTimeout(connect, 2000);
      }
    }
  }

  connect();

  return function unsubscribe() {
    isClosedIntentionally = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (ws) {
      ws.close();
    }
  };
}
