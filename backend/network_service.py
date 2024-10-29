# backend/network_service.py

from ping3 import ping
from backend.models.network_status import NetworkStatus

def check_server(server_ip):
    latency = ping(server_ip, timeout=1)
    is_up = latency is not None
    latency = round(latency * 1000, 2) if latency else -1  # Convert to milliseconds if available
    return NetworkStatus(server_ip, is_up, latency)
