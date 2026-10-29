import React, { useEffect, useState } from 'react';
import { getHealth } from '../lib/api.js';

const statusLabels = {
  loading: 'Checking API',
  connected: 'API connected',
  disconnected: 'API disconnected',
};

function getDisconnectedDetail(error) {
  const database = error.data?.database;
  if (database) return `The API is reachable, but the database is ${database}.`;
  return error.message || 'The API could not be reached.';
}

export default function ConnectionStatus() {
  const [status, setStatus] = useState('loading');
  const [detail, setDetail] = useState('Checking the API and database connection.');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    let timeoutId;
    let controller;

    async function checkConnection() {
      controller = new AbortController();

      try {
        const health = await getHealth({ signal: controller.signal });
        if (!active) return;

        const isConnected = health.status === 'ok' && health.database === 'connected';
        setStatus(isConnected ? 'connected' : 'disconnected');
        setDetail(isConnected
          ? 'The API and MongoDB are connected.'
          : `The API reports database ${health.database || 'unavailable'}.`);
      } catch (error) {
        if (!active || error.name === 'AbortError') return;
        setStatus('disconnected');
        setDetail(getDisconnectedDetail(error));
      } finally {
        if (active) timeoutId = window.setTimeout(checkConnection, 30000);
      }
    }

    checkConnection();

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      controller?.abort();
    };
  }, [retryCount]);

  function retryConnection() {
    setStatus('loading');
    setDetail('Checking the API and database connection.');
    setRetryCount((count) => count + 1);
  }

  return (
    <button
      className={`connection-indicator connection-${status}`}
      type="button"
      aria-label={`${statusLabels[status]}. Click to check again.`}
      aria-live="polite"
      aria-busy={status === 'loading'}
      title={`${detail} Click to check again.`}
      onClick={retryConnection}
    >
      <span className="connection-dot" aria-hidden="true" />
      <span>{statusLabels[status]}</span>
    </button>
  );
}