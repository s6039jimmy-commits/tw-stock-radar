import { useState, useCallback } from 'react';

const BASE_URL = '/api';

export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const request = useCallback(async (endpoint, options = {}) => {
    setLoading(true);
    setError(null);
    try {
      const config = {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      };
      
      if (options.body && typeof options.body === 'object') {
        config.body = JSON.stringify(options.body);
      }

      const response = await fetch(`${BASE_URL}${endpoint}`, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'API request failed');
      }

      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const get = useCallback((endpoint) => request(endpoint, { method: 'GET' }), [request]);
  const post = useCallback((endpoint, body) => request(endpoint, { method: 'POST', body }), [request]);
  const put = useCallback((endpoint, body) => request(endpoint, { method: 'PUT', body }), [request]);
  const patch = useCallback((endpoint, body) => request(endpoint, { method: 'PATCH', body }), [request]);
  const del = useCallback((endpoint) => request(endpoint, { method: 'DELETE' }), [request]);

  return { loading, error, get, post, put, patch, del };
}
