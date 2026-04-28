import React, { useState, useEffect } from 'react';
import axios from 'axios';

export function RequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchRequests = async () => {
      setLoading(true);
      try {
        const response = await axios.get('/api/requests');
        setRequests(response.data);
      } catch {
        setError('Error al cargar las solicitudes');
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();
  }, []);

  if (loading) {
    return <div>Cargando...</div>;
  }

  if (error) {
    return <div>{error}</div>;
  }

  return (
    <div>
      <h1>Solicitudes de Compra</h1>
      <ul>
        {requests.map((request) => (
          <li key={request.id}>
            <strong>{request.item}</strong> - {request.quantity} unidades
          </li>
        ))}
      </ul>
    </div>
  );
}

