"""Sync failures and phone pending summaries are visible from the PC."""
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from uuid import uuid4

from fastapi import HTTPException
from fastapi.testclient import TestClient

import sync_diagnostics
from test import app


def main():
    operation_id, entity_id, device_id, blocked_id = [str(uuid4()) for _ in range(4)]
    operation = {'operation_id': operation_id, 'entity_id': entity_id,
                 'kind': 'stock_count', 'payload': {'product_id': entity_id}}
    client = TestClient(app)
    with TemporaryDirectory() as directory, patch.object(sync_diagnostics, 'DATABASE', Path(directory) / 'diagnostics.sqlite3'):
        with patch('test.apply_operation', side_effect=HTTPException(409, 'Las existencias cambiaron')):
            assert client.post('/api/sync', json=operation).status_code == 409
            assert client.post('/api/sync', json=operation).status_code == 409
        failure = client.get('/api/sync/diagnostics').json()['failures'][0]
        assert failure['operation_id'] == operation_id and failure['attempts'] == 2
        assert failure['product_id'] == entity_id and failure['detail'] == 'Las existencias cambiaron'

        report = {'device_id': device_id, 'entries': [
            {'operation_id': operation_id, 'entity_id': entity_id, 'product_id': entity_id,
             'kind': 'stock_count', 'title': 'Papel higiénico Felpita', 'state': 'error',
             'error': 'Las existencias cambiaron', 'error_status': 409,
             'values': {'location': 'Baño', 'expected_balance': '24.000000', 'quantity': '20.000000'}},
            {'operation_id': blocked_id, 'entity_id': str(uuid4()), 'product_id': entity_id,
             'kind': 'stock_count', 'title': 'Otro recuento', 'state': 'blocked',
             'blocked_by': [operation_id]}]}
        assert client.post('/api/sync/diagnostics', json=report).status_code == 200
        pending = {entry['operation_id']: entry for entry in client.get('/api/sync/diagnostics').json()['pending']}
        assert len(pending) == 2 and pending[blocked_id]['blocked_by'] == [operation_id]
        assert pending[operation_id]['values']['expected_balance'] == '24.000000'

        with patch('test.apply_operation', return_value={'status': 'confirmed'}):
            assert client.post('/api/sync', json=operation).status_code == 200
        assert client.get('/api/sync/diagnostics').json()['failures'] == []
        assert client.post('/api/sync/diagnostics', json={'device_id': device_id, 'entries': []}).status_code == 200
        assert client.get('/api/sync/diagnostics').json()['pending'] == []
    print('OK: errores, reintentos, pendientes del teléfono y limpieza al confirmar')


if __name__ == '__main__':
    main()
